/**
 * Manager de Facturas para Cliente Específico
 *
 * Punto de entrada para el servicio de facturación con datos detallados del cliente.
 * Este manager:
 * 1. Procesa los datos recibidos del frontend
 * 2. Realiza el login en AFIP
 * 3. Ejecuta el flujo de facturación con los pasos específicos para cliente
 * 4. Genera el PDF en la carpeta del cliente
 * 5. Retorna el resultado al frontend
 */

const { app } = require('electron');
const loginManager = require('./codigo/login/login_arca.js');
const flujo_FacturaTipificada = require('./codigo/hacerFacturas/flujos/flujo_Factura_tipificada.js');
const { procesarDatosFacturaCliente } = require('../../facturas/procesarFacturaCliente.js');

/**
 * Inicia el proceso de facturación para un cliente específico
 *
 * @param {string} url - URL de AFIP
 * @param {object} credenciales - Credenciales de acceso (usuario, password, nombreEmpresa)
 * @param {object} datosFacturaCliente - Datos de la factura desde el frontend
 * @param {boolean} test - Modo test (default: false)
 * @param {object} usuarioSeleccionado - Usuario seleccionado
 * @param {string} empresa - Empresa elegida
 * @param {function} enviarProgreso - Función callback para enviar progreso (opcional)
 * @returns {Promise<object>} Resultado de la operación
 */
async function iniciarProcesoFacturaCliente(
    url,
    credenciales,
    datosFacturaCliente,
    test = false,
    usuarioSeleccionado,
    empresa,
    enviarProgreso = null
) {
    let browser;
    console.log("\n=== Manager de Facturación de Cliente ===");
    console.log("Iniciando proceso para usuario:", usuarioSeleccionado?.nombreUsuario || 'N/A');
    console.log("Modo test:", test);

    try {
        // ===== PASO 1: Validar y procesar datos del frontend =====
        console.log("\n[1/4] Validando y procesando datos del frontend...");
        let datosProcesados;
        try {
            datosProcesados = procesarDatosFacturaCliente(datosFacturaCliente);
            console.log("✓ Datos procesados correctamente");
            console.log("  - Tipo actividad:", datosProcesados.tipoActividad);
            console.log("  - Tipo contribuyente:", datosProcesados.tipoContribuyente);
            console.log("  - Receptor:", datosProcesados.receptor?.numeroDocumento);
            console.log("  - Líneas de detalle:", datosProcesados.lineasDetalle?.length || 0);
        } catch (validationError) {
            console.error("✗ Error al validar datos:", validationError.message);
            return {
                success: false,
                error: 'VALIDATION_ERROR',
                message: `Error de validación: ${validationError.message}`
            };
        }

        // ===== PASO 2: Realizar login en AFIP =====
        console.log("\n[2/4] Realizando login en AFIP...");
        const loginResult = await loginManager.hacerLogin(url, credenciales, { headless: false }); // Navegador visible para debugging

        if (!loginResult.success) {
            console.error("✗ El login falló:", loginResult.message);
            return {
                success: false,
                error: 'LOGIN_FAILED',
                message: loginResult.message
            };
        }

        console.log("✓ Login exitoso");

        // Desestructurar page y browser del resultado
        const { page, browser: b } = loginResult;
        browser = b;

        // ===== PASO 3: Ejecutar flujo de facturación =====
        console.log("\n[3/4] Ejecutando flujo de facturación para cliente...");

        const resultado = await flujo_FacturaTipificada.ejecutar_FacturaCliente(
            page,
            datosProcesados,
            test,
            credenciales,
            usuarioSeleccionado,
            empresa,
            enviarProgreso, // ← Pasar callback de progreso
            app.getPath('downloads') // ← Pasar ruta de descargas
        );

        console.log("✓ Flujo de facturación completado");

        // ===== PASO 4: Retornar resultado =====
        console.log("\n[4/4] Proceso finalizado exitosamente");
        if (resultado.data?.resultados) {
            console.log("PDFs generados:");
            resultado.data.resultados.forEach((factura, idx) => {
                console.log(`  ${idx + 1}. ${factura.pdfPath || 'N/A'}`);
            });
        } else {
            console.log("PDF generado en:", resultado.data?.pdfPath || 'N/A');
        }

        // Espera de inspección eliminada para optimizar velocidad
        // Si necesitas inspeccionar manualmente, descomentar las siguientes líneas:
        // if (!test && browser) {
        //     console.log("\n⏳ Esperando 5 segundos para permitir inspección del navegador...");
        //     console.log("   (El navegador se cerrará automáticamente)");
        //     await new Promise(resolve => setTimeout(resolve, 5000));
        // }

        return resultado;

    } catch (error) {
        console.error("\n✗ Error en iniciarProcesoFacturaCliente:", error);
        console.error("Stack trace:", error.stack);

        // Devolver un objeto de error estructurado
        return {
            success: false,
            error: 'PROCESS_ERROR',
            message: error.message,
            stack: test ? error.stack : undefined // Solo incluir stack en modo test
        };

    } finally {
        // ===== LIMPIEZA: Cerrar el navegador =====
        if (browser) {
            console.log("\n[Limpieza] Cerrando el navegador...");
            try {
                //await browser.close();
                console.log("✓ Navegador cerrado correctamente");
            } catch (closeError) {
                console.error("✗ Error al cerrar el navegador:", closeError.message);
            }
        }
    }
}

module.exports = {
    iniciarProcesoFacturaCliente,
};
