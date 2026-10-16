// Utilidades de Importar Libro IVA.
//
// Dos apps distintas de ARCA:
//   - Portal IVA (siapweb.cloud.afip.gob.ar/iva, React): elegir representado y período.
//     Sin ids: los botones se reconocen por su aria-label fijo ("iva.home.btn.nueva.declaracion…").
//   - IVA Simple / Libro IVA (liva.afip.gob.ar/liva/jsp, jQuery + DataTables): ids fijos
//     (#btnDropdownImportar, #lnkImportarAFIP, #modalImportarAFIP…) y variables globales de
//     la página (gUserEmpresaRepresentadaCUIT, gEstadoPresentacion, gConfigFechas, gServerSide).

const fs = require('fs/promises');

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

/** Error con código (llega al front como `error`). */
function errorConCodigo(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
}

/**
 * Click con el mouse de Puppeteer (no el.click() desde evaluate: algunos botones lo ignoran).
 * Espera a que el elemento esté visible.
 */
async function clickReal(page, selector, { timeout = 20000 } = {}) {
    const el = await page.waitForSelector(selector, { visible: true, timeout });
    await el.evaluate(e => e.scrollIntoView({ block: 'center' }));
    await el.click();
}

/** Espera un archivo terminado (sin .crdownload) en `dir`. null si se agota el tiempo. */
async function esperarArchivoListo(dir, timeoutMs = 60000) {
    const limite = Date.now() + timeoutMs;
    while (Date.now() < limite) {
        try {
            const listos = (await fs.readdir(dir)).filter(n => !n.endsWith('.crdownload') && !n.endsWith('.tmp'));
            if (listos.length > 0) return listos[0];
        } catch (_) { /* la carpeta puede no estar lista */ }
        await esperar(500);
    }
    return null;
}

/** 'AAAAMM' → 'MM/AAAA' (como lo muestra ARCA). */
function periodoLegible(periodo) {
    return `${periodo.slice(4, 6)}/${periodo.slice(0, 4)}`;
}

module.exports = { esperar, soloDigitos, errorConCodigo, clickReal, esperarArchivoListo, periodoLegible };
