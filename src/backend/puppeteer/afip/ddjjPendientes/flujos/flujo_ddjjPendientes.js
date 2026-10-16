// Flujo DDJJ pendientes (sesión AFIP ya iniciada). Lote por login:
//   abrirSeti (una vez por login): portal → buscador "ddjj y" → Presentación de DDJJ y
//     Pagos (Seti, pestaña nueva).
//   consultarCliente (uno por contribuyente, en la MISMA pestaña de Seti):
//     DDJJ pendientes de presentación → elegir CUIT → respuesta de la API →
//     Excel siempre (tabla completa, o "sin pendientes" de constancia) y, si hay
//     pendientes, Imprimir → PDF; todo en <cliente>/archivos_afip/, un archivo por día.

const fs = require('fs');
const path = require('path');
const { getDownloadPathContribuyente } = require('../../../../cliente/carpetaContribuyente.js');
const { generarExcelDdjjPendientes, nombreArchivo } = require('../../../../afip/ddjjPendientes/excelDdjjPendientes.js');
const { abrirSeti } = require('../codigoXpagina/paso_1_abrirSeti.js');
const { irAPendientes } = require('../codigoXpagina/paso_2_irAPendientes.js');
const { elegirCuit } = require('../codigoXpagina/paso_3_elegirCuit.js');
const { escucharRespuesta, consultar } = require('../codigoXpagina/paso_4_consultar.js');
const { imprimirPdf } = require('../codigoXpagina/paso_5_imprimirPdf.js');

/**
 * @param {import('puppeteer').Page} seti   Pestaña de Seti (de abrirSeti).
 * @param {{cuit: string, nombre?: string}} contribuyente  el OBJETIVO (no el login)
 * @param {string} downloadsPath
 * @returns {Promise<{success, error?, message, pendientes?, rutaPdf?, rutaExcel?, downloadDir?, aviso?}>}
 */
async function consultarCliente(seti, contribuyente, downloadsPath) {
    const cuit = String(contribuyente.cuit);
    try {
        // Cada cliente arranca de la pantalla de pendientes (el anterior pudo quedar en #/impresion).
        await irAPendientes(seti);

        // Escuchar ANTES de elegir (por si Seti consultara solo al cambiar el contribuyente).
        const escucha = escucharRespuesta(seti, cuit);
        await elegirCuit(seti, cuit);
        const pendientes = await consultar(seti, cuit, escucha);

        const downloadDir = await getDownloadPathContribuyente(downloadsPath, cuit, contribuyente.nombre || '', 'archivos_afip');
        const rutaExcel = await generarExcelDdjjPendientes(pendientes, contribuyente, downloadsPath);

        // Sin pendientes Seti no ofrece "Imprimir": queda solo el Excel.
        if (pendientes.length === 0) {
            console.log(`        [DdjjPendientes] ${cuit}: sin pendientes → ${rutaExcel}`);
            return { success: true, message: 'Sin DDJJ pendientes de presentación', pendientes, rutaExcel, downloadDir };
        }

        const { pdf, aviso } = await imprimirPdf(seti, pendientes.length);
        const rutaPdf = path.join(downloadDir, nombreArchivo(cuit, 'pdf'));
        fs.writeFileSync(rutaPdf, pdf);
        console.log(`        [DdjjPendientes] ${cuit}: ${pendientes.length} pendiente(s) → ${downloadDir}`);

        return {
            success: true,
            message: `${pendientes.length} DDJJ pendiente(s) de presentación`,
            pendientes, rutaPdf, rutaExcel, downloadDir, aviso
        };
    } catch (error) {
        console.error(`        [DdjjPendientes] ERROR ${cuit}: ${error.message}`);
        return { success: false, error: error.code || 'FLUJO_ERROR', message: error.message };
    }
}

module.exports = { abrirSeti, consultarCliente };
