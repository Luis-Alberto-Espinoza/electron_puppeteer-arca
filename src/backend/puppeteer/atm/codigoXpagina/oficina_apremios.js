// puppeteer/atm/codigoXpagina/oficina_apremios.js
// Oficina Virtual ATM → Apremios › Consulta de Apremios → un botón por impuesto →
// tabla "Listado de Inhibiciones". Relevado con páginas guardadas del 2026-10-16
// (docs: video "Apremios ATM.mp4" + ATMWebPages/flujo_apremios).
//
// Estructura (ZK):
//   página Oficina Virtual
//     └─ iframe "nucleo/inicio.zul"  ← tiene el menú. Al elegir "Consulta de Apremios"
//        ESTE MISMO iframe navega a inhibiciones/consulta_inhibiciones.zul.
//           ├─ cartel modal "Información Importante" (botón Aceptar), puede llegar tarde
//           ├─ botones: Automotor | Inmueble | Ingresos Brutos | Multas… | Agentes
//           └─ listbox con auxheader "Listado de Inhibiciones" (sin paginador: todas
//              las filas están en el DOM). Hay un 2º listbox "Listado de Etapas" que no se usa.

const TEXTO_PANTALLA = 'Seleccione el impuesto al cual le va a consultar sus Apremios';
const TITULO_AVISO = 'Información Importante';

const INTERVALO_MS = 250;
const TIMEOUT_CONSULTA_MS = 60000;
// Lecturas seguidas con ZK quieto después de la respuesta (ZK aplica los cambios en tandas).
const LECTURAS_QUIETO = 2;

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

/** Frame cuyo documento ya muestra la pantalla de Apremios (o null). */
async function buscarFrameApremios(page) {
    for (const frame of page.frames()) {
        try {
            const ok = await frame.evaluate(t => !!document.body && document.body.innerText.includes(t), TEXTO_PANTALLA);
            if (ok) return frame;
        } catch (_) { /* frame que se está recargando: probar el siguiente */ }
    }
    return null;
}

/**
 * Abre Apremios › Consulta de Apremios desde el menú de la Oficina Virtual.
 * @param {import('puppeteer').Page} page - pestaña de la Oficina Virtual
 * @returns {Promise<import('puppeteer').Frame>} frame de la pantalla de Apremios
 */
async function entrarApremios(page, { timeout = 30000 } = {}) {
    const frameHandle = await page.waitForSelector('iframe[src="nucleo/inicio.zul"]', { timeout });
    const frame = await frameHandle.contentFrame();
    if (!frame) throw new Error('No se encontró el iframe del menú de la Oficina Virtual.');

    // 1) Menú "Apremios" (se busca por texto: el orden del menú cambia según el contribuyente).
    await frame.waitForFunction(() => Array.from(document.querySelectorAll('.z-menu-text'))
        .some(s => s.textContent.trim() === 'Apremios'), { timeout });
    await frame.evaluate(() => {
        const span = Array.from(document.querySelectorAll('.z-menu-text')).find(s => s.textContent.trim() === 'Apremios');
        (span.closest('a') || span).click();
    });

    // 2) "Consulta de Apremios": ZK arma el popup recién al abrir el menú.
    const encontrado = await frame.waitForFunction(() => {
        const item = Array.from(document.querySelectorAll('.z-menuitem-text'))
            .find(s => s.textContent.trim() === 'Consulta de Apremios');
        if (!item) return false;
        (item.closest('a') || item).click();
        return true;
    }, { timeout: 10000, polling: INTERVALO_MS }).catch(() => null);
    if (!encontrado) throw new Error('No apareció la opción "Consulta de Apremios" en el menú Apremios.');

    // 3) Esperar la pantalla (el iframe navega; se busca en todos los frames).
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
        const frameApremios = await buscarFrameApremios(page);
        if (frameApremios) return frameApremios;
        await esperar(INTERVALO_MS);
    }
    throw new Error('No cargó la pantalla de Consulta de Apremios.');
}

/**
 * Clic REAL (mouse de Puppeteer). ZK ignora el el.click() hecho desde evaluate sin
 * tirar error (guía §10 gotcha 11): por eso el clic de los botones no llegaba.
 * `buscar` corre en la página y devuelve el elemento (o null).
 * @returns {Promise<boolean>} false si no encontró el elemento
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

/** Corre en la página: ¿está a la vista el cartel "Información Importante"? */
function hayAvisoEnPagina(titulo) {
    return Array.from(document.querySelectorAll('.z-window-modal')).some(w =>
        getComputedStyle(w).display !== 'none' && getComputedStyle(w).visibility !== 'hidden'
        && (w.querySelector('.z-window-header')?.textContent || '').includes(titulo));
}

/** Corre en la página: el botón Aceptar del cartel visible, o null. */
function botonAceptarEnPagina(titulo) {
    const modal = Array.from(document.querySelectorAll('.z-window-modal')).find(w =>
        getComputedStyle(w).display !== 'none' && getComputedStyle(w).visibility !== 'hidden'
        && (w.querySelector('.z-window-header')?.textContent || '').includes(titulo));
    return (modal && Array.from(modal.querySelectorAll('button.z-button')).find(b => b.textContent.trim() === 'Aceptar')) || null;
}

/**
 * Cierra el cartel "Información Importante" si está a la vista. Llega tarde a veces:
 * con `esperarMs` se lo espera un rato; si no aparece, no es error. Si aparece y no
 * se puede cerrar, SÍ es error: su máscara tapa los botones de impuesto.
 * @returns {Promise<boolean>} true si lo cerró
 */
async function aceptarAviso(frame, { esperarMs = 0 } = {}) {
    const inicio = Date.now();
    while (!(await frame.evaluate(hayAvisoEnPagina, TITULO_AVISO))) {
        if (Date.now() - inicio >= esperarMs) return false;
        await esperar(INTERVALO_MS);
    }

    if (!(await clicReal(frame, botonAceptarEnPagina, TITULO_AVISO))) {
        throw new Error('No se encontró el botón Aceptar del cartel "Información Importante".');
    }

    const limite = Date.now() + 10000;
    while (await frame.evaluate(hayAvisoEnPagina, TITULO_AVISO)) {
        if (Date.now() >= limite) throw new Error('No se pudo cerrar el cartel "Información Importante" de Apremios.');
        await esperar(INTERVALO_MS);
    }
    return true;
}

/**
 * Corre EN la página. Cuenta las respuestas del servidor que ZK procesa: es la ÚNICA
 * prueba de que ATM contestó un clic. Sin respuesta nueva no se lee la tabla (si no,
 * una tabla vacía porque el clic no llegó se informaba como "sin apremios").
 * ZK de ATM manda por zAu._fetch y procesa en zAu._onResponseReady; respaldo: fetch.
 * @returns {string} cómo quedó enganchado ('zAu' | 'fetch')
 */
function vigilarRespuestasZk() {
    if (window.__apremiosVigia) return window.__apremiosVigia;
    window.__apremiosAu = 0;
    if (window.zAu && typeof window.zAu._onResponseReady === 'function') {
        const original = window.zAu._onResponseReady;
        window.zAu._onResponseReady = function (resp) {
            const r = original.apply(this, arguments);
            if (!resp || resp.ok !== false) window.__apremiosAu++;
            return r;
        };
        window.__apremiosVigia = 'zAu';
    } else {
        const original = window.fetch;
        window.fetch = function (url) {
            const p = original.apply(this, arguments);
            if (String(url && url.url || url).includes('zkau')) {
                p.then(r => { if (r.ok) window.__apremiosAu++; }).catch(() => {});
            }
            return p;
        };
        window.__apremiosVigia = 'fetch';
    }
    return window.__apremiosVigia;
}

/**
 * Corre EN la página (frame.evaluate). Lee el listbox "Listado de Inhibiciones".
 * Embargo e Inhibición son íconos: transparent.gif = no; otra imagen = "Sí".
 * @returns {{encontrada: boolean, encabezados: string[], filas: string[][]}}
 */
function leerTablaEnPagina() {
    const aux = Array.from(document.querySelectorAll('.z-auxheader-content'))
        .find(d => d.textContent.trim() === 'Listado de Inhibiciones');
    const listbox = aux && aux.closest('.z-listbox');
    if (!listbox) return { encontrada: false, encabezados: [], filas: [] };

    const encabezados = Array.from(listbox.querySelectorAll('.z-listhead .z-listheader-content'))
        .map(h => h.textContent.trim());

    const filas = Array.from(listbox.querySelectorAll('.z-listbox-body tr.z-listitem')).map(tr =>
        Array.from(tr.querySelectorAll(':scope > td.z-listcell')).map(td => {
            const texto = (td.textContent || '').replace(/ /g, ' ').trim();
            if (texto) return texto;
            const img = td.querySelector('img');
            if (img && !/transparent\.gif/i.test(img.getAttribute('src') || '')) {
                return 'Sí';
            }
            return '';
        }));

    return { encontrada: true, encabezados, filas };
}

/**
 * Corre EN la página. Estado para saber si la consulta terminó: ocupado (ZK con un
 * pedido en vuelo), si la tabla ya no es la marcada antes del click, y si apareció
 * un mensaje modal de ATM (que no sea el cartel de bienvenida).
 */
function estadoEnPagina(tituloAviso) {
    const visible = el => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const ocupado = ((typeof window.zk !== 'undefined') && (window.zk.processing === true || window.zk.ausending === true))
        || ((typeof window.zAu !== 'undefined') && !!window.zAu.ajaxReq)
        || Array.from(document.querySelectorAll('.z-loading')).some(visible)
        || visible(document.querySelector('#zk_showBusy'));

    const aux = Array.from(document.querySelectorAll('.z-auxheader-content'))
        .find(d => d.textContent.trim() === 'Listado de Inhibiciones');
    const listbox = aux && aux.closest('.z-listbox');
    const cuerpo = listbox && listbox.querySelector('.z-listbox-body tbody[id$="-rows"]');
    const filas = listbox ? Array.from(listbox.querySelectorAll('.z-listbox-body tr.z-listitem')) : [];
    // Si ZK re-renderizó, las marcas puestas antes del click ya no están.
    const refrescado = !cuerpo || cuerpo.getAttribute('data-apremios-previo') === null
        || filas.some(tr => tr.getAttribute('data-apremios-previo') === null);

    let mensaje = null;
    const modal = Array.from(document.querySelectorAll('.z-window-modal')).find(w => visible(w)
        && !(w.querySelector('.z-window-header')?.textContent || '').includes(tituloAviso));
    if (modal) {
        mensaje = (modal.querySelector('.z-window-content')?.innerText || modal.innerText || '').trim();
        const btn = modal.querySelector('button.z-button');
        if (btn) btn.click();
    }

    return { ocupado, refrescado, mensaje, respuestas: window.__apremiosAu || 0 };
}

/**
 * Elige un impuesto y lee su tabla. Solo se lee cuando ATM CONTESTÓ el clic (respuesta
 * nueva de ZK) y ZK quedó quieto. Sin respuesta en el tiempo límite = ERROR, nunca
 * "sin apremios" (error nunca es cero, guía §10 gotcha 13).
 * @param {import('puppeteer').Frame} frame
 * @param {{id: string, boton: string}} impuesto
 * @returns {Promise<{encabezados: string[], filas: string[][], mensaje: string|null}>}
 */
async function consultarImpuesto(frame, impuesto, { timeout = TIMEOUT_CONSULTA_MS } = {}) {
    // El cartel puede haber llegado tarde y tapar los botones.
    await aceptarAviso(frame);

    await frame.evaluate(vigilarRespuestasZk);
    const respuestasAntes = await frame.evaluate(() => window.__apremiosAu || 0);

    // Marcar la tabla actual (diagnóstico: saber si ZK la re-renderizó).
    await frame.evaluate(() => {
        const aux = Array.from(document.querySelectorAll('.z-auxheader-content'))
            .find(d => d.textContent.trim() === 'Listado de Inhibiciones');
        const listbox = aux && aux.closest('.z-listbox');
        if (!listbox) return;
        listbox.querySelectorAll('.z-listbox-body tbody[id$="-rows"], .z-listbox-body tr.z-listitem')
            .forEach(el => el.setAttribute('data-apremios-previo', '1'));
    });

    // Los botones de impuesto están en un .z-hlayout; clic real con el mouse.
    const clickeado = await clicReal(frame, (texto) => Array.from(document.querySelectorAll('.z-hlayout button.z-button, button.z-button'))
        .find(b => b.textContent.trim() === texto && getComputedStyle(b).display !== 'none') || null, impuesto.boton);
    if (!clickeado) throw new Error(`No se encontró el botón "${impuesto.boton}" en Consulta de Apremios.`);

    const inicio = Date.now();
    let mensaje = null;
    let quieto = 0;
    while (Date.now() - inicio < timeout) {
        await esperar(INTERVALO_MS);
        const estado = await frame.evaluate(estadoEnPagina, TITULO_AVISO);
        if (estado.mensaje) mensaje = estado.mensaje;
        const contesto = estado.respuestas > respuestasAntes;
        quieto = (contesto && !estado.ocupado) ? quieto + 1 : 0;
        if (quieto >= LECTURAS_QUIETO) {
            const tabla = await frame.evaluate(leerTablaEnPagina);
            if (!tabla.encontrada) throw new Error('No se encontró la tabla "Listado de Inhibiciones".');
            return { encabezados: tabla.encabezados, filas: tabla.filas, mensaje };
        }
    }
    throw new Error(`ATM no respondió la consulta de ${impuesto.boton} (${Math.round(timeout / 1000)} s): no se puede saber si tiene apremios.`);
}

module.exports = { entrarApremios, aceptarAviso, consultarImpuesto, leerTablaEnPagina, buscarFrameApremios };
