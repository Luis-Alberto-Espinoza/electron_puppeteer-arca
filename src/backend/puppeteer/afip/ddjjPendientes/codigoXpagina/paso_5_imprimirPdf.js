// Paso 5 — PDF oficial: el "Imprimir" de Seti, guardado como PDF.
//
// "Imprimir" lleva a la ruta #/impresion (misma pestaña): una <table> común dentro de
// #ConsultaImprimir con las 5 columnas, y llama a window.print(). El diálogo de
// impresión de Chrome CONGELA Puppeteer, así que antes se neutraliza print() y el PDF
// lo hace page.pdf() (el mismo motor que "Guardar como PDF").
//
// Tal cual, la impresión de Seti sale fea (visto en vivo, también a mano): la tabla en
// vertical no entra (cortada en "Fecha" + barra de scroll), fondo gris y el botón
// "Volver" impreso. Se imprime la MISMA vista con: hoja horizontal, tabla sin scroll,
// sin botones y fondo blanco. Si hay más filas de las que entran, Chrome sigue en otra
// hoja y repite el encabezado de la tabla; ninguna fila queda partida.
//
// La tabla de pantalla pagina de a 10: si hay más filas, antes de imprimir se pasa a 100
// para que la impresión no salga con solo la primera página.

const { esperar } = require('./_seti.js');

const TIMEOUT_TABLA = 30000;
const TIMEOUT_IMPRESION = 20000;
const FILAS_POR_PAGINA = 10;

const SELECTOR_FILAS_IMPRESION = '#ConsultaImprimir table tbody tr';

const CSS_IMPRESION = `
    html, body, #app, [style*="whitesmoke"] { background: #fff !important; }
    #impresion button { display: none !important; }
    #impresion .container { max-width: none !important; }
    #ConsultaImprimir .e-table { overflow: visible !important; width: auto !important; max-width: none !important;
                                 height: auto !important; max-height: none !important; }
    #ConsultaImprimir table { width: 100% !important; }
    #ConsultaImprimir thead { display: table-header-group; }
    #ConsultaImprimir tr { break-inside: avoid; page-break-inside: avoid; }
`;

// Corre en el navegador: print() pasa a ser una marca.
function neutralizarPrint() {
    window.print = () => { window.__printLlamado = true; };
}

function buscarImprimir() {
    return Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.replace(/\s+/g, ' ').trim().toLowerCase().endsWith('imprimir')
            && b.offsetParent !== null && !b.disabled) || null;
}

const ESTILO_MARGEN = 'font-size:8px;font-family:Arial,sans-serif;width:100%;padding:0 10mm;display:flex;justify-content:space-between;';
const HEADER = `<div style="${ESTILO_MARGEN}"><span class="date"></span><span class="title"></span><span></span></div>`;
const FOOTER = `<div style="${ESTILO_MARGEN}"><span class="url"></span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;

/**
 * @param {import('puppeteer').Page} page  Pestaña de Seti con la consulta ya hecha (hay filas).
 * @param {number} filasEsperadas          Filas que trajo la API (paso 4).
 * @returns {Promise<{pdf: Buffer, aviso: string|null}>}
 */
async function imprimirPdf(page, filasEsperadas) {
    // 5.1 Esperar a que la tabla de resultados esté y tenga el botón Imprimir.
    await page.waitForFunction(buscarImprimir, { timeout: TIMEOUT_TABLA })
        .catch(() => { throw new Error('Seti: no apareció el botón "Imprimir" de la consulta.'); });

    // 5.2 Más de 10 filas → paginador en 100 (si no, se imprime solo la 1ª página).
    if (filasEsperadas > FILAS_POR_PAGINA) {
        const cambiado = await page.evaluate(() => {
            const select = document.querySelector('select[id$="-page-size"]');
            if (!select) return false;
            select.value = '100';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        });
        if (!cambiado) console.warn('        [DdjjPendientes] No encontré el selector de filas por página.');
        await esperar(800);
    }

    // 5.3 print() neutralizado (también si la página se recargara) y click real en Imprimir.
    await page.evaluateOnNewDocument(neutralizarPrint);
    await page.evaluate(neutralizarPrint);
    const boton = (await page.evaluateHandle(buscarImprimir)).asElement();
    if (!boton) throw new Error('Seti: el botón "Imprimir" desapareció antes del click.');
    await boton.click();

    // 5.4 Vista de impresión con sus filas.
    await page.waitForSelector(SELECTOR_FILAS_IMPRESION, { timeout: TIMEOUT_IMPRESION })
        .catch(() => { throw new Error(`Seti: no se abrió la vista de impresión (URL: ${page.url()}).`); });
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 }).catch(() => {});

    const filasPdf = await page.$$eval(SELECTOR_FILAS_IMPRESION, trs => trs.length);
    let aviso = null;
    if (filasPdf !== filasEsperadas) {
        aviso = `El PDF de AFIP trae ${filasPdf} fila(s) y la consulta ${filasEsperadas}.`;
        console.warn(`        [DdjjPendientes] ⚠️ ${aviso}`);
    }

    // 5.5 PDF horizontal, limpio.
    await page.addStyleTag({ content: CSS_IMPRESION });
    const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: HEADER,
        footerTemplate: FOOTER,
        margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' }
    });
    if (!pdf || pdf.length < 1000 || Buffer.from(pdf).subarray(0, 4).toString() !== '%PDF') {
        throw new Error('El PDF generado salió vacío o inválido.');
    }
    return { pdf: Buffer.from(pdf), aviso };
}

module.exports = { imprimirPdf };
