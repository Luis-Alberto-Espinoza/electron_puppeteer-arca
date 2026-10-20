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

// libro_iva_ventas_<cuit>_<AAAA-MM><sufijo>.xlsx: uno por libro y período (re-importar el mismo
// mes lo pisa). sufijo '_antes' = respaldo de lo que había antes de "Eliminar todo".
function nombreExcel(tipo, cuit, periodo, sufijo = '') {
    return `libro_iva_${tipo}_${cuit}_${periodo.slice(0, 4)}-${periodo.slice(4, 6)}${sufijo}.xlsx`;
}

/**
 * Abre (recarga) el libro y espera la grilla.
 * @returns {Promise<{totalLibro: number, serverSide: boolean, tipoOperacion: number}>}
 */
async function leerLibro(liva, tipo, { cuit, periodo }) {
    const libro = LIBROS[tipo];
    const { serverSide, tipoOperacion } = await abrirLibro(liva, tipo, { cuit, periodo });
    // Grilla cargada (la respuesta de la API ya llegó y DataTables la dibujó).
    await liva.waitForFunction(() => {
        try { return window.jQuery('#tablaDataTables').DataTable().ajax.json() != null; } catch (_) { return false; }
    }, { timeout: TIMEOUT_GRILLA }).catch(() => {
        throw errorConCodigo('GRILLA_NO_CARGO', `No cargó la grilla del Libro ${libro.nombre}.`);
    });
    const totalLibro = await liva.evaluate(() => window.jQuery('#tablaDataTables').DataTable().page.info().recordsTotal);
    return { totalLibro, serverSide, tipoOperacion };
}

/**
 * @param {import('puppeteer').Page} liva
 * @param {'ventas'|'compras'} tipo
 * @param {{cuit: string, nombre?: string, periodo: string, downloadsPath: string, sufijo?: string}} datos
 * @returns {Promise<{rutaExcel?: string, totalLibro?: number, aviso?: string}>}
 */
async function descargarExcel(liva, tipo, { cuit, nombre, periodo, downloadsPath, sufijo = '' }) {
    const libro = LIBROS[tipo];
    const { totalLibro, serverSide } = await leerLibro(liva, tipo, { cuit, periodo });
    if (serverSide) {
        return { totalLibro, aviso: `Libro ${libro.nombre}: ARCA no ofrece Excel con tantos comprobantes (solo CSV); no se descargó.` };
    }

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
        const rutaExcel = path.join(carpeta, nombreExcel(tipo, cuit, periodo, sufijo));
        // copy + rm (no rename): el temporal puede estar en otro disco.
        await fs.copyFile(path.join(tempDir, archivo), rutaExcel);
        return { rutaExcel, totalLibro };
    } finally {
        if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

module.exports = { descargarExcel, leerLibro, nombreExcel };
