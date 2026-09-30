// tablasPdf/convertirPdfAExcel.js — PDF → Excel con el motor de Tablas PDF.
//
// Único camino de conversión: lo usan el IPC del servicio (handlers.js) y las
// automatizaciones que bajan PDFs (ej. Plan de Pago ATM). Vive FUERA de motor/
// porque motor/ es copia exacta del proyecto hermano y no se edita acá.
//
// El .xlsx queda al lado del PDF. Si el especialista no arma su propio Excel,
// el nombre sale del PDF (mismo nombre, extensión .xlsx).

const procesarPdfConFallback = require('./motor/extraerTablasPdf/extraerTablas_B_Manager.js');
const { convertStructuredDataToExcel } = require('./motor/services/fileProcessingService.js');

/**
 * @param {string} filePath - Ruta del PDF.
 * @returns {Promise<{rutaExcel: string, extraccion: Object}>} extraccion = resultado crudo del motor (allFilas, tablas, metodo...).
 * @throws si la extracción o la conversión fallan.
 */
async function convertirPdfAExcel(filePath) {
    // 1. Extraer datos estructurados
    const extraccion = await procesarPdfConFallback(filePath);
    if (!extraccion.exito) {
        throw new Error(extraccion.error || 'Error desconocido durante el procesamiento del PDF.');
    }

    // 2. Si el especialista ya generó su propio Excel (multi-hoja), usarlo tal cual.
    if (extraccion.excelPath) {
        return { rutaExcel: extraccion.excelPath, extraccion };
    }

    // 3. Si no, convertidor genérico.
    const conversion = await convertStructuredDataToExcel(extraccion, extraccion.suggestedFileName, filePath);
    if (!conversion.exito) {
        throw new Error(conversion.error || 'Error desconocido durante la conversión a Excel.');
    }
    return { rutaExcel: conversion.rutaExcel, extraccion };
}

module.exports = { convertirPdfAExcel };
