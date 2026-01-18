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
const puppeteerManager = require('../archivos_comunes/navegador/puppeteer-manager');
const loginManager = require('./codigo/login/login_arca.js');
const { procesarDatosFactura } = require('../../facturas/procesarFactura.js');
const { procesarDatosFacturaCliente } = require('../../facturas/procesarFacturaCliente.js');
const { ejecutar_FacturacionUnificado } = require('./codigo/hacerFacturas/flujos/flujo_FacturacionUnificado.js');

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
 * @returns {Promise<Object>} Resultado del proceso
 */
async function iniciarProceso(
    url,
    credenciales,
    datosRaw,
    test = false,
    usuarioSeleccionado,
    empresa,
    enviarProgreso = null
) {
    console.log("\n╔════════════════════════════════════════════════════╗");
    console.log("║  MANAGER DE FACTURACION UNIFICADO                  ║");
    console.log("╚════════════════════════════════════════════════════╝\n");

    // ==========================================
    // PASO 1: DETECTAR TIPO Y NORMALIZAR DATOS
    // ==========================================
    console.log("=== [1/4] Detectando tipo y normalizando datos ===");

    const tipo = detectarTipoDatos(datosRaw);
    console.log(`✓ Tipo detectado: ${tipo}`);
    console.log(`  - Modulo: ${datosRaw.modulo || 'no especificado'}`);
    console.log(`  - Metodo ingreso: ${datosRaw.metodoIngreso || 'no especificado'}`);

    // Normalizar datos usando el procesador apropiado
    let datosProcesados;

    try {
        if (tipo === 'simple') {
            console.log("Usando procesador para modo simple (masivo/manual/mercadopago)...");
            datosProcesados = procesarDatosFactura(datosRaw);
        } else if (tipo === 'detallado') {
            console.log("Usando procesador para modo detallado (cliente especifico)...");
            datosProcesados = procesarDatosFacturaCliente(datosRaw);
        } else {
            throw new Error(`Tipo de datos no reconocido: ${tipo}`);
        }

        console.log("✓ Datos procesados correctamente");
        console.log(`  - Tipo actividad: ${datosProcesados.tipoActividad}`);
        console.log(`  - Tipo contribuyente: ${datosProcesados.tipoContribuyente}`);

        if (tipo === 'detallado') {
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

    // Mapear credenciales al formato que espera loginManager (usuario/contrasena)
    const credencialesLogin = {
        usuario: credenciales.cuit,
        contrasena: credenciales.claveAFIP
    };

    return await puppeteerManager.ejecutar(async (browser, page) => {
        // ==========================================
        // PASO 2: HACER LOGIN EN AFIP
        // ==========================================
        console.log("\n=== [2/4] Realizando login en AFIP ===");
        console.log("  - CUIT:", credenciales.cuit);
        console.log("  - Empresa:", credenciales.nombreEmpresa);

        const loginResult = await loginManager.hacerLogin(page, url || URL_LOGIN_AFIP, credencialesLogin);

        if (!loginResult.success) {
            console.error("✗ El login fallo:", loginResult.message);
            return {
                success: false,
                error: 'LOGIN_FAILED',
                message: loginResult.message
            };
        }

        console.log("✓ Login exitoso");

        // ==========================================
        // PASO 3: EJECUTAR FLUJO UNIFICADO
        // ==========================================
        console.log("\n=== [3/4] Ejecutando flujo de facturacion unificado ===");

        const downloadsPath = tipo === 'detallado' ? app.getPath('downloads') : null;

        const resultado = await ejecutar_FacturacionUnificado(
            page,
            datosProcesados,
            test,
            credenciales,
            usuarioSeleccionado,
            empresa,
            enviarProgreso,
            downloadsPath
        );

        console.log("✓ Flujo de facturacion completado");

        // ==========================================
        // PASO 4: RETORNAR RESULTADO
        // ==========================================
        console.log("\n=== [4/4] Proceso finalizado exitosamente ===");

        if (resultado.data?.resultados) {
            console.log("Facturas procesadas:");
            resultado.data.resultados.forEach((factura, idx) => {
                const estado = factura.success ? '✓' : '✗';
                const info = factura.pdfPath || factura.error || 'N/A';
                console.log(`  ${estado} ${idx + 1}. ${info}`);
            });
        }

        console.log("\n╔════════════════════════════════════════════════════╗");
        console.log("║  MANAGER: Proceso completado exitosamente         ║");
        console.log("╚════════════════════════════════════════════════════╝\n");

        return resultado;

    }, { headless: false });
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
