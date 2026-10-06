/**
 * PASO 8b: PDF OFICIAL de AFIP de una sección (Pagos / Plan de Pago / Obligaciones)
 *
 * Se corre parado en la página de la sección, después de leer la tabla
 * (paso_5 en Pagos, paso_8 en las demás). Si sale bien, este PDF reemplaza al
 * propio (paso_6 / paso_9); si falla por cualquier motivo, el flujo genera el
 * propio como respaldo.
 * Pagos: AFIP muestra el motivo de los intentos fallidos solo como tooltip;
 * acá se escribe en la celda (ver paso 5b) para que el PDF lo traiga.
 *
 * Cómo imprime AFIP: el botón "Imprimir" usa el plugin printThis → clona
 * `.printGroup` en un iframe oculto, le carga bootstrap + CSS de impresión y
 * llama a print() del iframe (diálogo nativo de Chrome, que congela Puppeteer)
 * y ~1 s después BORRA el iframe. Por eso:
 *   1. Neutralizamos print() en todo documento/iframe de la pestaña, y el
 *      reemplazo GUARDA el HTML del documento que se iba a imprimir
 *      (en window.top), en el mismo instante: sin carrera contra el borrado.
 *   2. Click en el Imprimir correcto: `.btnImprimirMain` (Obligaciones) o
 *      `.btnImprimir` (Plan de Pago), NUNCA el del modal oculto (imprime vacío).
 *   3. Ese HTML se abre en una pestaña nueva de la MISMA sesión, con <base>
 *      a la URL de AFIP (carga logo y CSS) → page.pdf() con media print,
 *      que es lo mismo que haría el diálogo.
 *   4. Se desmarcan celdas con datos que la paginación dejó `hidden-print`.
 *      Y los botones con tooltip (motivo de intento fallido en Pagos) se
 *      reemplazan por su texto: el PDF oficial sale CON el motivo.
 *   5. Control: la cantidad de filas que imprimen algo debe ser la que
 *      leímos en paso_8; si no, se descarta (el flujo usa el PDF propio).
 */

const path = require('path');
const { getDownloadPathContribuyente } = require('../../../../cliente/carpetaContribuyente.js');

const TIMEOUT_PRINT = 15000;      // printThis espera a que cargue el CSS + 333 ms
const TIMEOUT_RED_QUIETA = 15000;

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

// Corre DENTRO del navegador (cada documento). Reemplaza print() por: guardar
// el HTML del documento en window.top + marca. Lo mismo en cada iframe
// presente o futuro (printThis crea el suyo al clickear).
function neutralizarPrint() {
    const capturar = (w) => {
        let top = w;
        try { top = w.top || w; } catch (_) { /* cross-origin */ }
        try { top.__printHTML = w.document.documentElement.outerHTML; } catch (_) {}
        top.__printLlamado = true;
    };
    const parchear = (w) => {
        try {
            if (!w || w.__printParcheado) return;
            w.__printParcheado = true;
            w.print = () => capturar(w);
        } catch (_) { /* iframe cross-origin: no se puede */ }
    };
    const parchearIframe = (f) => {
        parchear(f.contentWindow);
        f.addEventListener('load', () => parchear(f.contentWindow));
    };
    const iniciar = () => {
        document.querySelectorAll('iframe').forEach(parchearIframe);
        new MutationObserver((mutaciones) => {
            for (const m of mutaciones) {
                for (const n of m.addedNodes) {
                    if (n.tagName === 'IFRAME') parchearIframe(n);
                    else if (n.querySelectorAll) n.querySelectorAll('iframe').forEach(parchearIframe);
                }
            }
        }).observe(document.documentElement, { childList: true, subtree: true });
    };

    parchear(window);
    if (window.__observerPrint) return;
    window.__observerPrint = true;
    if (document.documentElement) iniciar();
    else document.addEventListener('DOMContentLoaded', iniciar);
}

/**
 * @param {import('puppeteer').Page} page - parada en la sección (tabla ya leída)
 * @param {Object} seccion - de paso_8.SECCIONES, o { etiqueta, prefijo } para Pagos
 * @param {Object} plan - { numero }
 * @param {string} cuitConsulta
 * @param {string} downloadsPath
 * @param {number} filasEsperadas - filas `trRpt_` leídas (en Pagos: una por cuota)
 * @returns {Promise<{success, pdf?, message?}>}
 */
async function ejecutar(page, seccion, plan, cuitConsulta, downloadsPath, filasEsperadas) {
    let scriptId = null;
    let pestana = null;
    try {
        console.log(`  → Paso 8b: PDF oficial de AFIP de "${seccion.etiqueta}"...`);

        // 1. print() neutralizado en todo lo que haya y lo que venga
        ({ identifier: scriptId } = await page.evaluateOnNewDocument(neutralizarPrint));
        await Promise.all(page.frames().map(f => f.evaluate(neutralizarPrint).catch(() => {})));
        await page.evaluate(() => { window.__printLlamado = false; window.__printHTML = null; });

        // 2. Click en el Imprimir correcto (fuera de modales)
        const boton = await page.evaluate(() => {
            const candidatos = Array.from(document.querySelectorAll('button.btnImprimirMain, button.btnImprimir'))
                .filter(b => !b.closest('.modal'));
            const elegido = candidatos.find(b => b.classList.contains('btnImprimirMain')) || candidatos[0];
            if (!elegido) return null;
            elegido.click();
            return elegido.className;
        });
        if (!boton) throw new Error('No se encontró el botón Imprimir de la sección');

        // 3. Esperar a que printThis llame a print() (ya capturado)
        const html = await esperarCaptura(page);
        if (!html) throw new Error('Imprimir no llegó a llamar a print() (¿cambió la página de AFIP?)');

        // 4. Abrir la vista de impresión en una pestaña de la misma sesión
        const baseHref = page.url();
        const htmlConBase = html.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
        pestana = await page.browser().newPage();
        await pestana.setContent(htmlConBase, { waitUntil: 'domcontentloaded' });
        await pestana.waitForNetworkIdle({ idleTime: 500, timeout: TIMEOUT_RED_QUIETA }).catch(() => {});
        await pestana.emulateMediaType('print');

        // 5. La paginación de AFIP puede dejar celdas CON DATOS marcadas
        //    `hidden-print` (filas de otras páginas de la tabla y Totales): no se
        //    imprimirían y Chrome además corta la tabla en la 1ª hoja. Se desmarcan;
        //    las de relleno (vacías, bajo un rowspan) siguen ocultas.
        await pestana.evaluate(() => {
            // tbody completo: filas de datos y también las de Totales
            document.querySelectorAll('table tbody td.hidden-print').forEach(td => {
                if (td.textContent.trim() !== '') td.classList.remove('hidden-print');
            });
        });

        // 5b. Motivos de los intentos de débito fallidos (Pagos): AFIP los
        //     muestra solo como tooltip de un botón, que al imprimir sale vacío.
        //     Se reemplaza cada botón con tooltip por su texto. Solo <button>:
        //     el link "Ver Detalle" de Obligaciones también tiene title y no va.
        const motivos = await pestana.evaluate(() => {
            let n = 0;
            document.querySelectorAll('table tbody td button').forEach(boton => {
                const conTitulo = boton.querySelector('[title], [data-original-title]');
                const texto = ((conTitulo && (conTitulo.getAttribute('title') || conTitulo.getAttribute('data-original-title')))
                    || boton.getAttribute('title') || boton.getAttribute('data-original-title') || '').trim();
                if (!texto) return;
                const span = document.createElement('span');
                span.textContent = texto;
                span.style.fontStyle = 'italic';
                boton.replaceWith(span);
                n++;
            });
            return n;
        });
        if (motivos) console.log(`  → ${motivos} motivo(s) de intentos fallidos escritos en el PDF.`);

        // 6. Control de filas: las que IMPRIMEN algo (fila visible con al menos
        //    una celda visible con texto) vs las leídas en paso_8
        const filasPdf = await pestana.evaluate(() =>
            Array.from(document.querySelectorAll('tr[id*="trRpt_"]'))
                .filter(tr => getComputedStyle(tr).display !== 'none'
                    && Array.from(tr.cells).some(td => getComputedStyle(td).display !== 'none' && td.textContent.trim() !== ''))
                .length
        );
        if (filasPdf !== filasEsperadas) {
            throw new Error(`El PDF de AFIP trae ${filasPdf} fila(s) y la tabla leída ${filasEsperadas}`);
        }

        // 7. Guardar (mismo nombre que el PDF propio: lo reemplaza)
        const downloadDir = await getDownloadPathContribuyente(downloadsPath, cuitConsulta, '', 'archivos_afip');
        const cuitLimpio = String(cuitConsulta).replace(/-/g, '');
        const fecha = new Date().toISOString().slice(0, 10);
        const nombre = `${seccion.prefijo}_${cuitLimpio}_Plan${plan.numero || 'SinNumero'}_${fecha}.pdf`;
        const pdfPath = path.join(downloadDir, nombre);

        await pestana.pdf({
            path: pdfPath,
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
        });

        console.log(`  ✅ PDF oficial AFIP guardado (${filasPdf} filas): ${nombre}`);
        return { success: true, pdf: { path: pdfPath, nombre, downloadDir, origen: 'afip' } };

    } catch (error) {
        console.log(`  ⚠️ PDF oficial AFIP no disponible (${seccion.etiqueta}): ${error.message}. Se genera el propio.`);
        return { success: false, message: error.message };
    } finally {
        if (pestana) { try { await pestana.close(); } catch (_) {} }
        if (scriptId) { try { await page.removeScriptToEvaluateOnNewDocument(scriptId); } catch (_) {} }
    }
}

// Polling: el contexto puede reiniciarse; printThis tarda lo que cargue el CSS.
async function esperarCaptura(page) {
    const inicio = Date.now();
    while (Date.now() - inicio < TIMEOUT_PRINT) {
        const html = await page.evaluate(() => (window.__printLlamado ? window.__printHTML : null)).catch(() => null);
        if (html) return html;
        await esperar(250);
    }
    return null;
}

module.exports = { ejecutar };
