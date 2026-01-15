/**
 * Manager de Facturación Unificado (REHECHO CORRECTAMENTE)
 *
 * Combina EXACTAMENTE la lógica de:
 * - facturaManager.js
 * - facturaClienteManager.js
 *
 * COPIADO LÍNEA POR LÍNEA de los originales que funcionan.
 *
 * Responsabilidades:
 * 1. Detectar tipo de datos (simple vs detallado)
 * 2. Normalizar datos (llamando al procesador apropiado)
 * 3. Hacer LOGIN en AFIP
 * 4. Llamar al flujo unificado con page ya logueado
 * 5. Cerrar navegador
 * 6. Retornar resultado
 */

const { app } = require('electron');
const loginManager = require('./codigo/login/login_arca.js');
const { procesarDatosFactura } = require('../../facturas/procesarFactura.js');
const { procesarDatosFacturaCliente } = require('../../facturas/procesarFacturaCliente.js');
const { ejecutar_FacturacionUnificado } = require('./codigo/hacerFacturas/flujos/flujo_FacturacionUnificado.js');

// URL por defecto de AFIP
const URL_AFIP_DEFAULT = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Inicia el proceso de facturación unificado
 *
 * FIRMA COPIADA de managers originales.
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
    let browser; // COPIADO: Variable para cerrar en finally

    console.log("\n╔════════════════════════════════════════════════════╗");
    console.log("║  MANAGER DE FACTURACIÓN UNIFICADO                  ║");
    console.log("╚════════════════════════════════════════════════════╝\n");

    try {
        // ==========================================
        // PASO 1: DETECTAR TIPO Y NORMALIZAR DATOS
        // ==========================================
        console.log("=== [1/4] Detectando tipo y normalizando datos ===");

        const tipo = detectarTipoDatos(datosRaw);
        console.log(`✓ Tipo detectado: ${tipo}`);
        console.log(`  - Módulo: ${datosRaw.modulo || 'no especificado'}`);
        console.log(`  - Método ingreso: ${datosRaw.metodoIngreso || 'no especificado'}`);

        // Normalizar datos usando el procesador apropiado
        let datosProcesados;

        try {
            if (tipo === 'simple') {
                console.log("Usando procesador para modo simple (masivo/manual/mercadopago)...");
                datosProcesados = procesarDatosFactura(datosRaw);
            } else if (tipo === 'detallado') {
                console.log("Usando procesador para modo detallado (cliente específico)...");
                datosProcesados = procesarDatosFacturaCliente(datosRaw);
            } else {
                throw new Error(`Tipo de datos no reconocido: ${tipo}`);
            }

            console.log("✓ Datos procesados correctamente");
            console.log(`  - Tipo actividad: ${datosProcesados.tipoActividad}`);
            console.log(`  - Tipo contribuyente: ${datosProcesados.tipoContribuyente}`);

            if (tipo === 'detallado') {
                console.log(`  - Receptor: ${datosProcesados.receptor?.numeroDocumento || 'genérico'}`);
                console.log(`  - Líneas de detalle: ${datosProcesados.lineasDetalle?.length || 0}`);
            } else {
                console.log(`  - Facturas generadas: ${datosProcesados.montoResultados?.facturasGeneradas?.length || 0}`);
            }

        } catch (validationError) {
            console.error("✗ Error al validar datos:", validationError.message);
            return {
                success: false,
                error: 'VALIDATION_ERROR',
                message: `Error de validación: ${validationError.message}`
            };
        }

        // ==========================================
        // PASO 2: HACER LOGIN EN AFIP
        // COPIADO EXACTO de facturaClienteManager.js línea 66
        // ==========================================
        console.log("\n=== [2/4] Realizando login en AFIP ===");
        console.log("  - CUIT:", credenciales.cuit);
        console.log("  - Empresa:", credenciales.nombreEmpresa);

        // Mapear credenciales al formato que espera loginManager (usuario/contrasena)
        const credencialesLogin = {
            usuario: credenciales.cuit,
            contrasena: credenciales.claveAFIP
        };

        const loginOptions = {
            headless: false // TEMPORAL: Navegador visible para debugging
        };

        const loginResult = await loginManager.hacerLogin(url, credencialesLogin, loginOptions);

        if (!loginResult.success) {
            console.error("✗ El login falló:", loginResult.message);
            return {
                success: false,
                error: 'LOGIN_FAILED',
                message: loginResult.message
            };
        }

        console.log("✓ Login exitoso");

        // Desestructurar page y browser del resultado (COPIADO líneas 80-81)
        const { page, browser: b } = loginResult;
        browser = b; // Asignar a variable externa para el finally

        // ==========================================
        // PASO 3: EJECUTAR FLUJO UNIFICADO
        // COPIADO de facturaClienteManager.js líneas 86-95
        // ==========================================
        console.log("\n=== [3/4] Ejecutando flujo de facturación unificado ===");

        const downloadsPath = tipo === 'detallado' ? app.getPath('downloads') : null;

        const resultado = await ejecutar_FacturacionUnificado(
            page,                   // Página ya logueada
            datosProcesados,        // Datos normalizados
            test,                   // Modo test
            credenciales,           // Credenciales
            usuarioSeleccionado,    // Usuario completo
            empresa,                // Empresa elegida
            enviarProgreso,         // Callback de progreso
            downloadsPath           // Ruta de descargas
        );

        console.log("✓ Flujo de facturación completado");

        // ==========================================
        // PASO 4: RETORNAR RESULTADO
        // COPIADO de facturaClienteManager.js líneas 100-117
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

        // Dar tiempo para inspeccionar el navegador antes de cerrarlo (solo en modo NO test)
        // COPIADO líneas 111-115
        if (!test && browser && tipo === 'detallado') {
            console.log("\n⏳ Esperando 5 segundos para permitir inspección del navegador...");
            console.log("   (El navegador se cerrará automáticamente)");
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.log("\n╔════════════════════════════════════════════════════╗");
        console.log("║  MANAGER: Proceso completado exitosamente         ║");
        console.log("╚════════════════════════════════════════════════════╝\n");

        return resultado;

    } catch (error) {
        console.error("\n✗ ERROR EN MANAGER DE FACTURACIÓN:", error);
        console.error("Stack trace:", error.stack);

        // Devolver un objeto de error estructurado (COPIADO líneas 124-129)
        return {
            success: false,
            error: 'PROCESS_ERROR',
            message: error.message,
            stack: test ? error.stack : undefined // Solo incluir stack en modo test
        };

    } finally {
        // ===== LIMPIEZA: Cerrar el navegador =====
        // COPIADO EXACTO de ambos managers (líneas 34-38 y 132-141)
        if (browser) {
            console.log("\n[Limpieza] Cerrando el navegador...");
            try {
                await browser.close();
                console.log("✓ Navegador cerrado correctamente");
            } catch (closeError) {
                console.error("✗ Error al cerrar el navegador:", closeError.message);
            }
        }
    }
}

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================

/**
 * Detecta el tipo de datos según el módulo y método de ingreso
 *
 * @param {Object} datos - Datos crudos
 * @returns {string} 'simple' o 'detallado'
 */
function detectarTipoDatos(datos) {
    // Cliente específico
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

    // Si tiene datos de receptor específico, es detallado
    if (datos.receptor && !datos.receptor.generico) {
        return 'detallado';
    }

    // Default: simple
    return 'simple';
}

module.exports = {
    iniciarProceso
};
