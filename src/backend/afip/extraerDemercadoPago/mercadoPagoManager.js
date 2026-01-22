// afip/extraerDemercadoPago/mercadoPagoManager.js
// Manager para el servicio de MercadoPago

const PDFProcessorService = require('./service/leer_procesar_resumen_MercadoPago.js');

/**
 * Manager principal de MercadoPago
 * Procesa las diferentes operaciones relacionadas con resúmenes de MercadoPago
 * @param {Object} data - Datos de la operación
 * @param {string} data.case - Tipo de operación: 'procesarPDF'
 * @param {string} data.ruta - Ruta del archivo PDF a procesar
 * @returns {Object} Resultado de la operación
 */
function procesarMercadoPago(data) {
    console.log("[MercadoPago Manager] Datos recibidos:", data);

    const casosValidos = ['procesarPDF'];

    if (!casosValidos.includes(data.case)) {
        throw new Error('Debe seleccionar una opción válida: ' + casosValidos.join(', '));
    }

    switch (data.case) {
        case 'procesarPDF':
            return procesarPDFMercadoPago(data.ruta);

        default:
            throw new Error('Caso no reconocido: ' + data.case);
    }
}

/**
 * Procesa un archivo PDF de MercadoPago
 * @param {string} ruta - Ruta del archivo PDF
 * @returns {Promise<Object>} Resultado del procesamiento
 */
async function procesarPDFMercadoPago(ruta) {
    if (!ruta || ruta.trim() === '') {
        throw new Error('No se recibió una ruta válida para procesar');
    }

    const pdfService = new PDFProcessorService();
    const resultado = await pdfService.procesarPDF(ruta);

    return resultado;
}

module.exports = {
    procesarMercadoPago,
    procesarPDFMercadoPago
};
