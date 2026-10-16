// Paso 2 — Seti: ir a "DDJJ pendientes de presentación".
//
// El inicio de Seti NO tiene el menú lateral (solo las tarjetas Presentaciones / Pagos).
// Seti es una app Vue con rutas por hash: cambiar el hash navega sin recargar (la
// sesión sigue). Si eso no anda, plan B: tarjeta "Presentaciones" → menú lateral.
// La pantalla está lista cuando el desplegable "Contribuyente" tiene opciones.

const { cerrarAvisos, esperar } = require('./_seti.js');

const RUTA_PENDIENTES = '#/presentacion/deuda-falta-de-presentacion';
const SELECTOR_OPCION = 'li.multiselect-option';
const TIMEOUT_PANTALLA = 30000;

async function esperarDesplegable(page, timeout) {
    await page.waitForSelector(SELECTOR_OPCION, { timeout });
}

/**
 * @param {import('puppeteer').Page} page  Pestaña de Seti.
 */
async function irAPendientes(page) {
    await page.evaluate((ruta) => { window.location.hash = ruta; }, RUTA_PENDIENTES);
    try {
        await esperarDesplegable(page, TIMEOUT_PANTALLA);
    } catch (_) {
        console.warn('        [DdjjPendientes] La ruta directa no cargó; voy por el menú...');
        await page.evaluate(() => {
            const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const titulo = Array.from(document.querySelectorAll('.card-title'))
                .find(t => norm(t.textContent) === 'presentaciones');
            if (titulo) titulo.click();
        });
        await page.waitForSelector('#menuDDJJPendientes-link', { timeout: TIMEOUT_PANTALLA })
            .catch(() => { throw new Error('Seti: no apareció el menú "DDJJ pendientes de presentación".'); });
        await cerrarAvisos(page, { ventanaMs: 2000 });
        await page.evaluate(() => document.querySelector('#menuDDJJPendientes-link').click());
        await esperarDesplegable(page, TIMEOUT_PANTALLA)
            .catch(() => { throw new Error('Seti: no cargó la lista de contribuyentes de "DDJJ pendientes".'); });
    }

    // El tour de bienvenida puede aparecer al entrar a la sección.
    await cerrarAvisos(page, { ventanaMs: 2500 });
    await esperar(300);
}

module.exports = { irAPendientes };
