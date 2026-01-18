const { launchBrowser } = require('./browserLauncher');

/**
 * Ejecuta una tarea con navegador gestionado automaticamente.
 * El navegador se abre al inicio y se cierra al final (exito o error).
 *
 * @param {Function} callback - Funcion async que recibe (browser, page)
 * @param {Object} opciones - Opciones de configuracion
 * @param {boolean} opciones.headless - Ejecutar en modo headless (default: true)
 * @returns {Promise} - Resultado del callback
 *
 * @example
 * const resultado = await puppeteerManager.ejecutar(async (browser, page) => {
 *     await page.goto('https://ejemplo.com');
 *     return { success: true, data: await page.title() };
 * }, { headless: false });
 */
async function ejecutar(callback, opciones = {}) {
    let browser;
    const { headless = true } = opciones;

    try {
        console.log('[PuppeteerManager] Iniciando navegador...');
        browser = await launchBrowser({ headless });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        // Ejecutar la logica de negocio (manager -> flujo)
        const resultado = await callback(browser, page);

        return resultado;

    } catch (error) {
        console.error('[PuppeteerManager] Error:', error.message);
        return {
            success: false,
            error: 'BROWSER_ERROR',
            message: error.message
        };
    } finally {
        if (browser) {
            console.log('[PuppeteerManager] Cerrando navegador...');
            await browser.close();
        }
    }
}

module.exports = { ejecutar };
