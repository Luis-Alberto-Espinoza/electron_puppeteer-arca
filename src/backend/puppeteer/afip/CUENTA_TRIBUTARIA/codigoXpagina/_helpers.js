// Helpers compartidos entre los pasos del SCT.
//
// El SCT carga su UI dentro de un iframe (`.v-iframe iframe`). Todo lo que sea
// pestañas, tabla de deudas, paginación y dropdown "Exportar" vive ahí adentro.
// El header del portal (`div.razonSoc`, `select[name="$PropertySelection"]`)
// queda en el documento principal — eso lo siguen tocando los pasos 1 y 2.

const SELECTOR_IFRAME_SCT = '.v-iframe iframe';

/**
 * Espera al iframe del SCT y devuelve el Frame de Puppeteer.
 * Tira si no aparece dentro del timeout o si no se puede obtener contentFrame.
 *
 * @param {import('puppeteer').Page} page
 * @param {{ timeout?: number }} [opts]
 * @returns {Promise<import('puppeteer').Frame>}
 */
async function getSctFrame(page, { timeout = 30000 } = {}) {
    await page.waitForSelector(SELECTOR_IFRAME_SCT, { timeout });
    const handle = await page.$(SELECTOR_IFRAME_SCT);
    if (!handle) throw new Error('Iframe SCT no encontrado tras waitForSelector');
    const frame = await handle.contentFrame();
    if (!frame) throw new Error('No se pudo obtener contentFrame() del iframe SCT');
    return frame;
}

/**
 * Espera a que el iframe del SCT esté presente, montado y con contenido.
 * Si el iframe se desprende mientras estamos esperando (caso típico tras
 * cambiar el CUIT interno: AFIP reemplaza el iframe), reintenta hasta agotar
 * el timeout. Devuelve el Frame estable.
 */
async function esperarIframeSctListo(page, { timeout = 20000, selectorListo = 'a.nav-link' } = {}) {
    const inicio = Date.now();
    let ultimoError = null;
    while (Date.now() - inicio < timeout) {
        try {
            const frame = await getSctFrame(page, { timeout: 5000 });
            const restante = timeout - (Date.now() - inicio);
            await frame.waitForSelector(selectorListo, { timeout: Math.max(2000, restante) });
            return frame;
        } catch (e) {
            ultimoError = e;
            await new Promise(r => setTimeout(r, 500));
        }
    }
    throw new Error(`Iframe SCT no quedó listo (${ultimoError ? ultimoError.message : 'sin causa'})`);
}

/**
 * Snippet evaluable (en el contexto del iframe) que devuelve el <a.nav-link>
 * cuyo texto incluye "Deudas". El tab "Detalle de Deuda Consolidada" no matchea
 * porque dice "Deuda" (singular).
 */
const FN_FIND_TAB_DEUDAS = `() => {
    const tabs = Array.from(document.querySelectorAll('a.nav-link'));
    return tabs.find(el => (el.textContent || '').includes('Deudas')) || null;
}`;

/**
 * Busca el primer frame (incluyendo `page.mainFrame()`) cuyo `document` tenga
 * algún elemento que matchee el selector. Útil cuando AFIP renderiza una vista
 * en otro iframe distinto al del SCT (p.ej. medios de pago, modal de pago, etc).
 *
 * @param {import('puppeteer').Page} page
 * @param {string} selector  CSS selector
 * @returns {Promise<import('puppeteer').Frame|null>}
 */
async function frameConSelector(page, selector) {
    const frames = page.frames();
    for (const f of frames) {
        try {
            const has = await f.evaluate(
                (sel) => !!document.querySelector(sel),
                selector
            );
            if (has) return f;
        } catch (_) {
            // Frame detached o cross-origin sin acceso — saltar.
        }
    }
    return null;
}

/**
 * Polling hasta encontrar un frame que matchee el selector, o timeout.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} selector
 * @param {{ timeout?: number, intervalo?: number }} [opts]
 * @returns {Promise<import('puppeteer').Frame>}
 */
async function esperarFrameConSelector(page, selector, { timeout = 15000, intervalo = 400 } = {}) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
        const f = await frameConSelector(page, selector);
        if (f) return f;
        await new Promise(r => setTimeout(r, intervalo));
    }
    throw new Error(`Timeout esperando frame con selector "${selector}"`);
}

/**
 * Busca el primer frame cuyo `document` tenga algún elemento que satisfaga el
 * predicado (función evaluable en contexto de página). Útil cuando hay que
 * matchear por texto/atributo y el selector CSS no alcanza.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} predicateFnSrc  Source de una función `() => boolean` que
 *        devuelve true si en ese document existe lo buscado.
 * @returns {Promise<import('puppeteer').Frame|null>}
 */
async function frameConPredicado(page, predicateFnSrc) {
    const frames = page.frames();
    for (const f of frames) {
        try {
            const ok = await f.evaluate(`(${predicateFnSrc})()`);
            if (ok) return f;
        } catch (_) {}
    }
    return null;
}

module.exports = {
    SELECTOR_IFRAME_SCT,
    getSctFrame,
    esperarIframeSctListo,
    FN_FIND_TAB_DEUDAS,
    frameConSelector,
    esperarFrameConSelector,
    frameConPredicado
};
