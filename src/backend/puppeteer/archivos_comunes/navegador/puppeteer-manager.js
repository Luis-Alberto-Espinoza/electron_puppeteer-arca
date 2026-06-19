const { launchBrowserAndPage } = require('./browserLauncher');

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
    let huboError = false;
    const { headless = true, dejarAbiertoEnError = false, dejarAbiertoSiempre = false } = opciones;

    try {
        console.log('[PuppeteerManager] Iniciando navegador...');
        // Único punto de arranque: launchBrowserAndPage centraliza config + pestaña
        // (reusa la about:blank y aplica el viewport por defecto).
        const lanzado = await launchBrowserAndPage({ headless });
        browser = lanzado.browser;
        const page = lanzado.page;

        // Ejecutar la logica de negocio (manager -> flujo)
        const resultado = await callback(browser, page);

        // Si el flujo devuelve {success:false} también lo tratamos como error
        // a los fines de "dejar abierto" para depurar.
        if (resultado && resultado.success === false) huboError = true;

        return resultado;

    } catch (error) {
        huboError = true;
        console.error('[PuppeteerManager] Error:', error.message);
        return {
            success: false,
            error: 'BROWSER_ERROR',
            message: error.message
        };
    } finally {
        if (browser) {
            if (dejarAbiertoSiempre) {
                console.log('[PuppeteerManager] ⚠️  dejarAbiertoSiempre=true → navegador queda abierto (modo debug). Cerralo manualmente.');
            } else if (huboError && dejarAbiertoEnError) {
                console.log('[PuppeteerManager] ⚠️  Hubo error y dejarAbiertoEnError=true → navegador queda abierto para inspección. Cerralo manualmente.');
            } else {
                console.log('[PuppeteerManager] Cerrando navegador...');
                await browser.close();
            }
        }
    }
}

module.exports = { ejecutar };
