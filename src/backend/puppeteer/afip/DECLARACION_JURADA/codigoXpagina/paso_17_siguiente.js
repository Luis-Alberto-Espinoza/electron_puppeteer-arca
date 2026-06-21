// paso_17_siguiente.js
// Click "Siguiente >" en "Liquidación" → avanza a "Consistencia IVA" y vuelca lo que muestra.
// La navegación robusta (espera Vaadin idle + reintenta + detecta avance por firma de la
// página) vive en _navegacion.js. Para volcar a fondo una página nueva usar _inspeccionar.js.

const nav = require('./_navegacion.js');

/**
 * @param {import('puppeteer').Page} page
 */
async function ejecutar(page) {
    // Tolerante: si no hay "Siguiente" o no avanza, NO tumba el flujo.
    try {
        const res = await nav.siguiente(page, 'paso_17 Siguiente → Consistencia IVA');
        console.log('[DDJJ paso_17]\n' + res.resumen);
        return res;
    } catch (e) {
        const msg = `[DDJJ paso_17] No se pudo avanzar con "Siguiente": ${e.message}`;
        console.warn(msg);
        return { success: false, error: e.message, resumen: msg };
    }
}

module.exports = { ejecutar };
