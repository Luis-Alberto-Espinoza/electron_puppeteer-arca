// Paso 3 — EXPORTAR y traer el PDF.
//
// La app Vaadin (listasabana-web) tarda mucho en armarse: esperamos el layout con
// márgenes (v-verticallayout ... v-margin-*) y el botón EXPORTAR visibles.
// Al exportar, Vaadin abre una ventana modal (.v-window) con un iframe cuyo src es
// .../listasabana-web/home/APP/connector/0/<n>/source/resumen_<cuit>.pdf (el visor de
// PDF de Chrome). No usamos el visor: pedimos ese src con fetch desde el mismo frame
// (mismas cookies de sesión) y guardamos los bytes. Así no depende del botón de
// descarga del visor y anda igual con el navegador oculto.

const TIMEOUT_CARGA_VAADIN = 120000; // la consulta es lenta de verdad
const TIMEOUT_PDF = 60000;

const SELECTOR_LAYOUT = '.v-verticallayout.v-layout.v-vertical.v-widget.v-has-width'
    + '.v-margin-top.v-margin-right.v-margin-bottom.v-margin-left';

/**
 * @param {import('puppeteer').Frame} frame  Frame de la app Vaadin (paso 2).
 * @returns {Promise<Buffer>} bytes del PDF (validados: empiezan con %PDF).
 */
async function exportarPdf(frame) {
    console.log('        [DatosRegistrales] Paso 3: esperar la consulta y EXPORTAR...');

    // 3.1 Layout cargado + botón EXPORTAR visible
    const boton = await frame.waitForFunction((selLayout) => {
        const visible = el => !!el && el.getClientRects().length > 0;
        if (!visible(document.querySelector(selLayout))) return null;
        const btn = Array.from(document.querySelectorAll('.v-button')).find(b => {
            const cap = b.querySelector('.v-button-caption');
            return cap && cap.textContent.trim().toUpperCase() === 'EXPORTAR';
        });
        return visible(btn) ? btn : null;
    }, { timeout: TIMEOUT_CARGA_VAADIN, polling: 500 }, SELECTOR_LAYOUT)
        .catch(() => { throw new Error('La consulta de Datos registrales no terminó de cargar (no apareció EXPORTAR).'); });

    // 3.2 Click real (Vaadin escucha eventos de mouse); si falla, click por DOM.
    try {
        await boton.asElement().click();
    } catch (_) {
        await boton.evaluate(b => b.click());
    }

    // 3.3 Esperar el iframe del PDF en la ventana modal
    const srcHandle = await frame.waitForFunction(() => {
        const f = Array.from(document.querySelectorAll('iframe')).find(i => /\.pdf(\?|$)/i.test(i.src || ''));
        return f ? f.src : null;
    }, { timeout: TIMEOUT_PDF, polling: 500 })
        .catch(() => { throw new Error('AFIP no mostró el PDF después de EXPORTAR.'); });
    const src = await srcHandle.jsonValue();
    console.log(`        [DatosRegistrales] PDF generado: ${src}`);

    // 3.4 Bajar los bytes con la sesión del frame
    const base64 = await frame.evaluate(async (url) => {
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const bytes = new Uint8Array(await resp.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(bin);
    }, src).catch(e => { throw new Error(`No se pudo bajar el PDF: ${e.message}`); });

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.subarray(0, 4).toString() !== '%PDF') {
        throw new Error('Lo que devolvió AFIP no es un PDF.');
    }
    console.log(`        [DatosRegistrales] <== PDF recibido (${buffer.length} bytes)`);
    return buffer;
}

module.exports = { exportarPdf };
