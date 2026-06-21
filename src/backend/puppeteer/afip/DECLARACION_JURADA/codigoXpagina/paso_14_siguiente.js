// paso_14_siguiente.js
// Click "Siguiente >" en "Determinación" → avanza a "Liquidación" y vuelca lo que muestra.
// La navegación + volcado viven en _navegacion.js (reusable: "Siguiente" se repite).

const nav = require('./_navegacion.js');

/**
 * @param {import('puppeteer').Page} page
 */
async function ejecutar(page) {
    const res = await nav.siguiente(page, 'paso_14 Siguiente → Liquidación');
    console.log('[DDJJ paso_14]\n' + res.resumen);
    return res;
}

module.exports = { ejecutar };
