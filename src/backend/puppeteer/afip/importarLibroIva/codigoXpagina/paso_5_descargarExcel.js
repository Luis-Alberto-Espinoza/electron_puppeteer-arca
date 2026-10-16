// Paso 5 — Botón "Excel" de la grilla del libro → <cliente>/archivos_afip/.
//
// Se recarga el libro para que la grilla traiga lo recién importado. El Excel lo arma
// DataTables en el navegador (todas las filas, no solo la página visible) y lo baja como
// archivo: se captura en una carpeta temporal y se mueve con nombre propio.
// Con muchos comprobantes ARCA pagina en el servidor (gServerSide) y NO ofrece Excel: se avisa.

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { getDownloadPathContribuyente } = require('../../../../cliente/carpetaContribuyente.js');
const { errorConCodigo, clickReal, esperarArchivoListo } = require('./_comun.js');
const { abrirLibro, LIBROS } = require('./paso_4_importarLibro.js');

const TIMEOUT_GRILLA = 60000;
const TIMEOUT_DESCARGA = 60000;

// libro_iva_ventas_<cuit>_<AAAA-MM>.xlsx: uno por libro y período (re-importar el mismo mes lo pisa).
function nombreExcel(tipo, cuit, periodo) {
    return `libro_iva_${tipo}_${cuit}_${periodo.slice(0, 4)}-${periodo.slice(4, 6)}.xlsx`;
}

/**
 * @param {import('puppeteer').Page} liva
 * @param {'ventas'|'compras'} tipo
 * @param {{cuit: string, nombre?: string, periodo: string, downloadsPath: string}} datos
 * @returns {Promise<{rutaExcel?: string, totalLibro?: number, aviso?: string}>}
 */
async function descargarExcel(liva, tipo, { cuit, nombre, periodo, downloadsPath }) {
    const libro = LIBROS[tipo];
    const { serverSide } = await abrirLibro(liva, tipo, { cuit, periodo });
    if (serverSide) {
        return { aviso: `Libro ${libro.nombre}: ARCA no ofrece Excel con tantos comprobantes (solo CSV); no se descargó.` };
    }

    // Grilla cargada (la respuesta de la API ya llegó y DataTables la dibujó).
    await liva.waitForFunction(() => {
        try { return window.jQuery('#tablaDataTables').DataTable().ajax.json() != null; } catch (_) { return false; }
    }, { timeout: TIMEOUT_GRILLA }).catch(() => {
        throw errorConCodigo('GRILLA_NO_CARGO', `No cargó la grilla del Libro ${libro.nombre}.`);
    });
    const totalLibro = await liva.evaluate(() => window.jQuery('#tablaDataTables').DataTable().page.info().recordsTotal);

    let tempDir = null;
    try {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libro-iva-'));
        const client = await liva.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: tempDir });

        await clickReal(liva, 'button.buttons-excel');
        const archivo = await esperarArchivoListo(tempDir, TIMEOUT_DESCARGA);
        if (!archivo) {
            throw errorConCodigo('EXCEL_NO_DESCARGO', `El Excel del Libro ${libro.nombre} no terminó de descargarse.`);
        }

        const carpeta = await getDownloadPathContribuyente(downloadsPath, cuit, nombre || '', 'archivos_afip');
        const rutaExcel = path.join(carpeta, nombreExcel(tipo, cuit, periodo));
        // copy + rm (no rename): el temporal puede estar en otro disco.
        await fs.copyFile(path.join(tempDir, archivo), rutaExcel);
        return { rutaExcel, totalLibro };
    } finally {
        if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

module.exports = { descargarExcel, nombreExcel };
