// _inspeccionar.js
// Inyecta el kit tools/scraping-inspector.js en la página y devuelve $inspect.full().
// Idea (del usuario): en toda página NUEVA que exploremos, al menos la primera vez,
// lanzar el inspector para tener un volcado completo (selects/inputs/botones/links/
// forms/iframes) y no quedarnos cortos con los dumps a medida.

const path = require('path');
const RUTA_INSPECTOR = path.resolve(__dirname, '../../../../../../tools/scraping-inspector.js');

/**
 * @param {import('puppeteer').Page} page
 * @param {string} etiqueta  nombre de la página (para el log)
 * @returns {Promise<Object|null>} informe de $inspect.full() (o null si falló)
 */
async function inspeccionar(page, etiqueta = 'página') {
    try {
        await page.addScriptTag({ path: RUTA_INSPECTOR });
        const informe = await page.evaluate(() => (window.$inspect ? window.$inspect.full() : null));
        if (!informe) {
            console.warn(`[DDJJ inspector] (${etiqueta}) $inspect no quedó disponible.`);
            return null;
        }
        // Resumen corto + JSON completo (por si hace falta el detalle).
        console.log(`[DDJJ inspector] (${etiqueta}) selects=${informe.selects.length} ` +
            `inputs=${informe.inputs.length} botones=${informe.botones.length} ` +
            `forms=${informe.forms.length} iframes=${informe.iframes.length}`);
        console.log(`[DDJJ inspector] (${etiqueta}) full():\n` + JSON.stringify(informe, null, 2));
        return informe;
    } catch (e) {
        console.warn(`[DDJJ inspector] (${etiqueta}) No se pudo inyectar el inspector: ${e.message}`);
        return null;
    }
}

module.exports = { inspeccionar };
