/**
 * Manager de Facturacion Unificado
 *
 * Combina la logica de:
 * - facturaManager.js
 * - facturaClienteManager.js
 *
 * Responsabilidades:
 * 1. Detectar tipo de datos (simple vs detallado)
 * 2. Normalizar datos (llamando al procesador apropiado)
 * 3. Hacer LOGIN en AFIP
 * 4. Llamar al flujo unificado con page ya logueado
 * 5. Retornar resultado (navegador se cierra automaticamente)
 */

const { app } = require('electron');
const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager =  require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const { procesarDatosFactura } = require('./service/procesarFactura.js');
const { procesarDatosFacturaCliente } = require('./service/procesarFacturaCliente.js');
const { ejecutar_FacturacionUnificado } = require('../../puppeteer/afip/facturas/codigo/hacerFacturas/flujos/flujo_FacturacionUnificado.js');
const { resolverHeadless } = require('../../puppeteer/archivos_comunes/navegador/browserLauncher.js');
const { RESULTADO_NAVEGADOR_CERRADO, seCerroElNavegador } = require('../../comun/navegadorCerrado.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Inicia el proceso de facturacion unificado
 *
 * @param {string} url - URL de AFIP
 * @param {Object} credenciales - Credenciales de acceso {cuit, claveAFIP, nombreEmpresa}
 * @param {Object} datosRaw - Datos crudos desde el frontend
 * @param {boolean} test - Modo test (default: false)
 * @param {Object} usuarioSeleccionado - Usuario completo
 * @param {string} empresa - Empresa elegida
 * @param {Function} enviarProgreso - Callback para reportar progreso (opcional)
 * @param {Object} [opciones]
 * @param {boolean} [opciones.visible] - false = navegador oculto; si no llega, visible
 * @returns {Promise<Object>} Resultado del proceso
 */
async function iniciarProceso(
    url,
    credenciales,
    datosRaw,
    test = false,
    usuarioSeleccionado,
    empresa,
    enviarProgreso = null,
    { visible } = {}
) {
    console.log("\n╔════════════════════════════════════════════════════╗");
    console.log("║  MANAGER DE FACTURACION UNIFICADO                  ║");
    console.log("╚════════════════════════════════════════════════════╝\n");

    // ==========================================
    // PASO 1: DETECTAR TIPO Y NORMALIZAR DATOS
    // ==========================================
    console.log("=== [1/4] Detectando tipo y normalizando datos ===");

    // Un array = varios comprobantes detallados (ya procesados) en UN login:
    // el flujo los hace uno tras otro volviendo al menú (lote de Tipificada / Notas).
    const muestra = Array.isArray(datosRaw) ? datosRaw[0] : datosRaw;
    const tipo = detectarTipoDatos(muestra);
    console.log(`✓ Tipo detectado: ${tipo}`);
    console.log(`  - Modulo: ${muestra.modulo || 'no especificado'}`);
    console.log(`  - Metodo ingreso: ${muestra.metodoIngreso || 'no especificado'}`);

    // Normalizar datos usando el procesador apropiado
    let datosProcesados;

    try {
        // Detectar si los datos ya vienen procesados (flujo antiguo)
        const yaEstaProcesado = muestra.montoResultados?.facturasGeneradas || muestra.lineasDetalle;

        if (yaEstaProcesado) {
            console.log("Datos ya procesados, usando directamente...");
            datosProcesados = datosRaw;
        } else if (tipo === 'simple') {
            console.log("Usando procesador para modo simple (masivo/manual/mercadopago)...");
            datosProcesados = procesarDatosFactura(datosRaw);
        } else if (tipo === 'detallado') {
            console.log("Usando procesador para modo detallado (cliente especifico)...");
            datosProcesados = procesarDatosFacturaCliente(datosRaw);
        } else {
            throw new Error(`Tipo de datos no reconocido: ${tipo}`);
        }

        console.log("✓ Datos procesados correctamente");
        const muestraProcesada = Array.isArray(datosProcesados) ? datosProcesados[0] : datosProcesados;
        console.log(`  - Tipo actividad: ${muestraProcesada.tipoActividad}`);
        console.log(`  - Tipo contribuyente: ${muestraProcesada.tipoContribuyente}`);

        if (Array.isArray(datosProcesados)) {
            console.log(`  - Comprobantes en esta sesión: ${datosProcesados.length}`);
        } else if (tipo === 'detallado') {
            console.log(`  - Receptor: ${datosProcesados.receptor?.numeroDocumento || 'generico'}`);
            console.log(`  - Lineas de detalle: ${datosProcesados.lineasDetalle?.length || 0}`);
        } else {
            console.log(`  - Facturas generadas: ${datosProcesados.montoResultados?.facturasGeneradas?.length || 0}`);
        }

    } catch (validationError) {
        console.error("✗ Error al validar datos:", validationError.message);
        return {
            success: false,
            error: 'VALIDATION_ERROR',
            message: `Error de validacion: ${validationError.message}`
        };
    }

    // Normalizar credenciales: acepta ambos formatos
    // Formato 1 (handlers nuevos): { usuario, contrasena, nombreEmpresa }
    // Formato 2 (legacy): { cuit, claveAFIP, nombreEmpresa }
    const credencialesLogin = {
        usuario: credenciales.usuario || credenciales.cuit,
        contrasena: credenciales.contrasena || credenciales.claveAFIP
    };

    // Validar que tenemos credenciales
    if (!credencialesLogin.usuario || !credencialesLogin.contrasena) {
        console.error("✗ Credenciales incompletas");
        return {
            success: false,
            error: 'INVALID_CREDENTIALS',
            message: 'Credenciales incompletas: falta usuario/cuit o contrasena/claveAFIP'
        };
    }

    return await puppeteerManager.ejecutar(async (browser, page) => {
        // ==========================================
        // PASO 0: CAPTURAR DIÁLOGOS NATIVOS DE AFIP
        // ==========================================
        // AFIP dispara alert()/confirm() en algunos pasos (p. ej. validación del
        // receptor). Si no se manejan, el diálogo queda abierto y bloquea la
        // navegación → el flujo se cuelga hasta el timeout. Los logueamos (para
        // saber qué dice) y los aceptamos para destrabar el flujo.
        page.on('dialog', async (dialog) => {
            try {
                console.log(`[AFIP dialog] tipo=${dialog.type()} mensaje="${dialog.message()}"`);
                await dialog.accept();
            } catch (e) {
                console.warn('[AFIP dialog] no se pudo manejar el diálogo:', e.message);
            }
        });

        // ==========================================
        // PASO 2: HACER LOGIN EN AFIP
        // ==========================================
        console.log("\n=== [2/4] Realizando login en AFIP ===");
        console.log("  - CUIT:", credencialesLogin.usuario);
        console.log("  - Empresa:", credenciales.nombreEmpresa);

        const loginResult = await loginManager.hacerLogin(page, url || URL_LOGIN_AFIP, credencialesLogin);

        if (!loginResult.success) {
            if (seCerroElNavegador(browser, page)) return RESULTADO_NAVEGADOR_CERRADO;
            console.error("✗ El login fallo:", loginResult.message);
            return {
                success: false,
                error: loginResult.error || 'LOGIN_FAILED',
                message: loginResult.message
            };
        }

        console.log("✓ Login exitoso");

        // ==========================================
        // PASO 3: EJECUTAR FLUJO UNIFICADO
        // ==========================================
        console.log("\n=== [3/4] Ejecutando flujo de facturacion unificado ===");

        const downloadsPath = tipo === 'detallado' ? app.getPath('downloads') : null;

        let resultado;
        try {
            resultado = await ejecutar_FacturacionUnificado(
                page,
                datosProcesados,
                test,
                credenciales,
                usuarioSeleccionado,
                empresa,
                enviarProgreso,
                downloadsPath
            );
        } catch (error) {
            // Cerrado a mano: no es una falla de AFIP (el error del paso cortado confunde).
            if (seCerroElNavegador(browser, page, error)) return RESULTADO_NAVEGADOR_CERRADO;
            throw error;
        }

        // El flujo puede volver con success:false sin tirar excepción (ej. falta el
        // tipo de contribuyente): no anunciar "exitosamente" en ese caso.
        const fallo = !resultado || resultado.success === false;
        if (fallo) {
            const motivo = (resultado && (resultado.message || resultado.error)) || 'sin detalle';
            console.log(`✗ Flujo de facturacion falló: ${motivo}`);
        } else {
            console.log("✓ Flujo de facturacion completado");
        }

        // ==========================================
        // PASO 4: RETORNAR RESULTADO
        // ==========================================
        console.log(`\n=== [4/4] Proceso finalizado ${fallo ? 'CON ERROR' : 'exitosamente'} ===`);

        if (resultado.data?.resultados) {
            console.log("Facturas procesadas:");
            resultado.data.resultados.forEach((factura, idx) => {
                const estado = factura.success ? '✓' : '✗';
                const info = factura.pdfPath || factura.error || 'N/A';
                console.log(`  ${estado} ${idx + 1}. ${info}`);
            });
        }

        console.log("\n╔════════════════════════════════════════════════════╗");
        console.log(fallo
            ? "║  MANAGER: Proceso terminado CON ERROR              ║"
            : "║  MANAGER: Proceso completado exitosamente         ║");
        console.log("╚════════════════════════════════════════════════════╝\n");

        return resultado;

    }, { headless: resolverHeadless(visible) });
}

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

/**
 * Detecta el tipo de datos segun el modulo y metodo de ingreso
 *
 * @param {Object} datos - Datos crudos
 * @returns {string} 'simple' o 'detallado'
 */
function detectarTipoDatos(datos) {
    // Cliente especifico
    if (datos.modulo === 'facturaCliente') {
        return 'detallado';
    }

    // MercadoPago
    if (datos.modulo === 'mercadopago') {
        return 'simple';
    }

    // Facturas masivas o manuales
    if (datos.metodoIngreso === 'masivo' || datos.metodoIngreso === 'manual') {
        return 'simple';
    }

    // Si tiene datos de receptor especifico, es detallado
    if (datos.receptor && !datos.receptor.generico) {
        return 'detallado';
    }

    // Default: simple
    return 'simple';
}

module.exports = {
    iniciarProceso
};
