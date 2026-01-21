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
const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/facturas/codigo/login/login_arca.js');
const flujo_FacturaTipificada = require('../../puppeteer/afip/facturas/codigo/hacerFacturas/flujos/flujo_Factura_tipificada.js');
const { procesarDatosFacturaCliente } = require('./service/procesarFacturaCliente.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

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
    console.log("\n=== Manager de Facturacion de Cliente ===");
    console.log("Iniciando proceso para usuario:", usuarioSeleccionado?.nombreUsuario || 'N/A');
    console.log("Modo test:", test);

    // ===== PASO 1: Validar y procesar datos del frontend =====
    console.log("\n[1/4] Validando y procesando datos del frontend...");
    let datosProcesados;
    try {
        datosProcesados = procesarDatosFacturaCliente(datosFacturaCliente);
        console.log("✓ Datos procesados correctamente");
        console.log("  - Tipo actividad:", datosProcesados.tipoActividad);
        console.log("  - Tipo contribuyente:", datosProcesados.tipoContribuyente);
        console.log("  - Receptor:", datosProcesados.receptor?.numeroDocumento);
        console.log("  - Lineas de detalle:", datosProcesados.lineasDetalle?.length || 0);
    } catch (validationError) {
        console.error("✗ Error al validar datos:", validationError.message);
        return {
            success: false,
            error: 'VALIDATION_ERROR',
            message: `Error de validacion: ${validationError.message}`
        };
    }

    return await puppeteerManager.ejecutar(async (browser, page) => {
        // ===== PASO 2: Realizar login en AFIP =====
        console.log("\n[2/4] Realizando login en AFIP...");
        const loginResult = await loginManager.hacerLogin(page, url || URL_LOGIN_AFIP, credenciales);

        if (!loginResult.success) {
            console.error("✗ El login fallo:", loginResult.message);
            return {
                success: false,
                error: 'LOGIN_FAILED',
                message: loginResult.message
            };
        }

        console.log("✓ Login exitoso");

        // ===== PASO 3: Ejecutar flujo de facturacion =====
        console.log("\n[3/4] Ejecutando flujo de facturacion para cliente...");

        const resultado = await flujo_FacturaTipificada.ejecutar_FacturaCliente(
            page,
            datosProcesados,
            test,
            credenciales,
            usuarioSeleccionado,
            empresa,
            enviarProgreso,
            app.getPath('downloads')
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

        return resultado;

    }, { headless: false });
}

module.exports = {
    iniciarProcesoFacturaCliente,
};
