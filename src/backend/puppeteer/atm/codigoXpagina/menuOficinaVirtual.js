/**
 * Menú de la Oficina Virtual de ATM, POR TEXTO (el orden cambia según el contribuyente:
 * clic por posición bajaba la constancia equivocada y Plan de Pago dependía de que su menú fuera el 6º).
 *
 *   const frame = await abrirMenu(page, 'Planes de Pago', 'Consulta de Plan de Pago');
 *
 * Además: frameOficina (el iframe nucleo/inicio.zul, donde se carga la pantalla elegida),
 * clicReal (mouse de Puppeteer, para los BOTONES de ZK), esperarZk (fin del request de ZK) y
 * esperarProcesando (que se vaya el cartel "Procesando…" que bloquea la página).
 */

const INTERVALO_MS = 250;

/**
 * Devuelve el frame del menú (iframe nucleo/inicio.zul). La pantalla elegida se carga en el mismo.
 * @param {import('puppeteer').Page} page - pestaña de la Oficina Virtual
 */
async function frameOficina(page, { timeout = 30000 } = {}) {
    const frameHandle = await page.waitForSelector('iframe[src="nucleo/inicio.zul"]', { timeout });
    const frame = await frameHandle.contentFrame();
    if (!frame) throw new Error('No se encontró el iframe de la Oficina Virtual.');
    return frame;
}

/**
 * Clic REAL (mouse de Puppeteer): ZK ignora el el.click() hecho desde evaluate (guía §10).
 * `buscar` corre en la página y devuelve el elemento (o null).
 */
async function clicReal(frame, buscar, ...args) {
    const handle = await frame.evaluateHandle(buscar, ...args);
    const el = handle.asElement();
    if (!el) { await handle.dispose(); return false; }
    try {
        await el.click();
        return true;
    } finally {
        await el.dispose();
    }
}

/**
 * Abre `menu` y hace clic en su ítem `item`, buscando por texto.
 * ZK arma el popup recién al abrir el menú; se busca en TODOS los popups (memoria zk-aria-label-selected).
 */
async function abrirMenu(page, menu, item, { timeout = 15000 } = {}) {
    const frame = await frameOficina(page);

    await frame.waitForFunction((texto) => Array.from(document.querySelectorAll('.z-menu-text'))
        .some(s => s.textContent.trim() === texto), { timeout, polling: INTERVALO_MS }, menu)
        .catch(() => { throw new Error(`No apareció el menú "${menu}" en la Oficina Virtual.`); });

    // El MENÚ se abre con clic por código (como Apremios): con el clic real del mouse la barra
    // de ZK no abre el popup (probado en vivo 2026-10-22). Los botones de imprimir sí van con clic real.
    await frame.evaluate((texto) => {
        const span = Array.from(document.querySelectorAll('.z-menu-text')).find(s => s.textContent.trim() === texto);
        (span.closest('a') || span).click();
    }, menu);

    await frame.waitForFunction((texto) => Array.from(document.querySelectorAll('.z-menuitem-text'))
        .some(s => s.textContent.trim() === texto && s.offsetParent !== null), { timeout: 10000, polling: INTERVALO_MS }, item)
        .catch(() => { throw new Error(`No apareció la opción "${item}" en el menú "${menu}".`); });

    const clicItem = await frame.evaluate((texto) => {
        const span = Array.from(document.querySelectorAll('.z-menuitem-text'))
            .find(s => s.textContent.trim() === texto && s.offsetParent !== null);
        if (!span) return false;
        (span.closest('a') || span).click();
        return true;
    }, item);
    if (!clicItem) throw new Error(`No se pudo elegir "${item}" en el menú "${menu}".`);

    return frame;
}

/**
 * Espera a que ZK termine el request en curso (window.zk.processing + cartel de "cargando").
 * Señal fiable de "la pantalla ya cambió" (memoria zk-processing-senal-consulta): no segundos fijos.
 */
async function esperarZk(frame, { timeout = 30000, arranqueMs = 400 } = {}) {
    await new Promise(resolve => setTimeout(resolve, arranqueMs));   // que el request llegue a salir
    await frame.waitForFunction(() => {
        const ocupado = window.zk && window.zk.processing;
        const cargando = Array.from(document.querySelectorAll('.z-loading, #zk_showBusy'))
            .some(e => getComputedStyle(e).display !== 'none');
        return !ocupado && !cargando;
    }, { timeout, polling: INTERVALO_MS });
}

/**
 * Espera a que se vaya el cartelito "Procesando…" de ZK (la página queda en gris y se traga los
 * clics). Primero le da `aparecerMs` para que aparezca (sale con un pequeño retraso); si no aparece,
 * sigue. Visto en vivo en Planes de Pago (2026-10-23): el botón figuraba habilitado mientras tanto.
 * @returns {Promise<number>} ms que estuvo "Procesando…" (0 si no apareció)
 */
async function esperarProcesando(frame, { aparecerMs = 1500, timeout = 60000 } = {}) {
    const hayProcesando = () => frame.evaluate(() => Array.from(document.querySelectorAll('.z-loading, .z-apply-loading, .z-loading-indicator, #zk_proc, #zk_showBusy'))
        .some(e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden')).catch(() => false);
    const inicio = Date.now();
    let aparecio = false;
    while (Date.now() - inicio < aparecerMs) {
        if (await hayProcesando()) { aparecio = true; break; }
        await new Promise(resolve => setTimeout(resolve, INTERVALO_MS));
    }
    if (!aparecio) return 0;
    const desde = Date.now();
    while (Date.now() - desde < timeout) {
        if (!(await hayProcesando())) return Date.now() - desde;
        await new Promise(resolve => setTimeout(resolve, INTERVALO_MS));
    }
    throw new Error('ATM quedó "Procesando…" demasiado tiempo.');
}

module.exports = { abrirMenu, frameOficina, clicReal, esperarZk, esperarProcesando };
