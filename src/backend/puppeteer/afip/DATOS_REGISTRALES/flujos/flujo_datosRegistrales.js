// Flujo Datos registrales (un contribuyente, sesión AFIP ya iniciada):
//   portal → buscador "Sistema registral" (pestaña nueva) → elegir persona →
//   Consulta → Datos registrales → EXPORTAR → PDF a <cliente>/archivos_afip/.
//
// Se llama una vez por contribuyente dentro del mismo login (lote por representante):
// cada vuelta abre su propia pestaña de Sistema Registral y la cierra al terminar,
// así la pestaña del portal queda lista para el siguiente.

const fs = require('fs');
const path = require('path');
const { buscarEnAfip } = require('../../archivosComunes/buscadorAfip.js');
const { getDownloadPathContribuyente } = require('../../../../cliente/carpetaContribuyente.js');
const { elegirPersona } = require('../codigoXpagina/paso_1_elegirPersona.js');
const { abrirDatosRegistrales } = require('../codigoXpagina/paso_2_abrirDatosRegistrales.js');
const { exportarPdf } = require('../codigoXpagina/paso_3_exportarPdf.js');

function hoyISO() {
    const d = new Date();
    const dos = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/**
 * @param {import('puppeteer').Page} page   Pestaña del portal AFIP (logueada).
 * @param {{cuit: string, nombre?: string}} contribuyente
 * @param {string} downloadsPath
 * @returns {Promise<{success: boolean, message: string, rutaPdf?: string, downloadDir?: string}>}
 */
async function descargarDatosRegistrales(page, contribuyente, downloadsPath) {
    const cuit = String(contribuyente.cuit);
    let registralPage = null;
    try {
        registralPage = await buscarEnAfip(page, 'Sistema registral', {
            esperarNuevaPestana: true,
            timeoutNuevaPestana: 10000,
            textoEsperadoEnResultado: 'Sistema Registral'
        });

        await elegirPersona(registralPage, cuit);
        const frameVaadin = await abrirDatosRegistrales(registralPage);
        const pdf = await exportarPdf(frameVaadin);

        const downloadDir = await getDownloadPathContribuyente(downloadsPath, cuit, contribuyente.nombre || '', 'archivos_afip');
        const rutaPdf = path.join(downloadDir, `datos_registrales_${cuit}_${hoyISO()}.pdf`);
        fs.writeFileSync(rutaPdf, pdf);
        console.log(`        [DatosRegistrales] PDF guardado en ${rutaPdf}`);

        return { success: true, message: 'PDF de datos registrales descargado', rutaPdf, downloadDir };
    } catch (error) {
        console.error(`        [DatosRegistrales] ERROR ${cuit}: ${error.message}`);
        return { success: false, message: error.message };
    } finally {
        if (registralPage && registralPage !== page) {
            try { await registralPage.close(); } catch (_) {}
        }
        try { await page.bringToFront(); } catch (_) {}
    }
}

module.exports = { descargarDatosRegistrales };
