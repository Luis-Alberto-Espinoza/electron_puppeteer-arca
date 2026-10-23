/**
 * Navegación del menú de la Oficina Virtual de ATM para las constancias.
 *
 * Se busca POR TEXTO (como Apremios): el orden del menú cambia según el contribuyente.
 * Antes se hacía clic en el 3er menú → 1er ítem, que es Ingresos Brutos → Inscripciones:
 * bajaba la constancia de INSCRIPCIÓN y nunca la de deuda.
 *
 *   General → "Constancia de Cumplimiento Fiscal"  (Imprimir Constancia / Imprimir Deuda)
 *   Ingresos Brutos → "Inscripciones"              (Imprimir Constancia de Inscripción)
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

/** General → Constancia de Cumplimiento Fiscal. Espera a que aparezca "Imprimir Constancia". */
async function navegarACumplimientoFiscal(page) {
    console.log('Navegando a General → Constancia de Cumplimiento Fiscal...');
    const frame = await abrirMenu(page, 'General', 'Constancia de Cumplimiento Fiscal');
    await frame.waitForFunction(() => Array.from(document.querySelectorAll('.z-button'))
        .some(b => b.textContent.trim() === 'Imprimir Constancia'), { timeout: 20000, polling: INTERVALO_MS })
        .catch(() => { throw new Error('No cargó la pantalla de Constancia de Cumplimiento Fiscal.'); });
    console.log('Pantalla de Constancia de Cumplimiento Fiscal cargada.');
    return frame;
}

/**
 * Ingresos Brutos → Inscripciones. Espera el botón "Imprimir Constancia de Inscripción" (aunque
 * esté deshabilitado): esperar solo una tabla (.z-listitem) agarraba la del "Resultado Control"
 * de la pantalla anterior, y se seleccionaba una fila equivocada (probado en vivo 2026-10-22).
 */
async function navegarAInscripcionIIBB(page) {
    console.log('Navegando a Ingresos Brutos → Inscripciones...');
    const frame = await abrirMenu(page, 'Ingresos Brutos', 'Inscripciones');
    await frame.waitForFunction(() => Array.from(document.querySelectorAll('.z-button'))
        .some(b => b.textContent.trim() === 'Imprimir Constancia de Inscripción'), { timeout: 20000, polling: INTERVALO_MS })
        .catch(() => { throw new Error('No cargó la pantalla de Inscripciones de Ingresos Brutos.'); });
    await frame.waitForSelector('.z-listitem', { timeout: 10000 })
        .catch(() => { throw new Error('La pantalla de Inscripciones no trajo ninguna inscripción.'); });
    console.log('Pantalla de Inscripciones de Ingresos Brutos cargada.');
    return frame;
}

module.exports = { navegarACumplimientoFiscal, navegarAInscripcionIIBB, frameOficina, clicReal };
