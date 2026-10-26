const { launchBrowserAndPage } = require('./browserLauncher');

// Navegadores abiertos por ejecutar() que siguen corriendo (→ cómo cortar su espera), y los que
// el usuario mandó cerrar con "⏹ Cancelar" (componentes/lanzadorAutomatizacion → 'automatizacion:cancelar').
const navegadoresActivos = new Map();
const cancelados = new WeakSet();

const RESULTADO_CANCELADO = Object.freeze({
    success: false,
    error: 'CANCELADO',
    message: 'Cancelado por el usuario'
});

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

        // Ejecutar la logica de negocio (manager -> flujo). Cancelar no espera a que el flujo
        // se entere (pausas fijas, esperas a AFIP): corta acá y el flujo muere solo por detrás.
        // Ojo en los lotes: sus avisos tardíos (onProgreso) hay que ignorarlos.
        const corte = new Promise(resolve => navegadoresActivos.set(browser, resolve));
        const tarea = callback(browser, page);
        tarea.catch(() => { /* si se canceló, su error ya no le importa a nadie */ });
        const resultado = await Promise.race([tarea, corte]);

        // Si el flujo devuelve {success:false} también lo tratamos como error
        // a los fines de "dejar abierto" para depurar.
        if (resultado && resultado.success === false) huboError = true;

        // Cancelado: lo que haya devuelto el flujo es el error del paso que se cortó.
        if (cancelados.has(browser)) return RESULTADO_CANCELADO;
        return resultado;

    } catch (error) {
        huboError = true;
        if (browser && cancelados.has(browser)) return RESULTADO_CANCELADO;
        console.error('[PuppeteerManager] Error:', error.message);
        return {
            success: false,
            error: 'BROWSER_ERROR',
            message: error.message,
            // Un paso puede marcar el error con un código y datos para que el
            // backend actúe (ej. TIPO_PDV_DISTINTO → corregir el cliente).
            ...(error.codigo ? { codigo: error.codigo, detalle: error.detalle } : {})
        };
    } finally {
        if (browser) {
            navegadoresActivos.delete(browser);
            if (cancelados.has(browser)) {
                // Ya lo cerró cancelar().
            } else if (dejarAbiertoSiempre) {
                console.log('[PuppeteerManager] El navegador queda abierto a disposición del usuario: lo cierra él.');
            } else if (huboError && dejarAbiertoEnError) {
                console.log('[PuppeteerManager] ⚠️  Hubo error y dejarAbiertoEnError=true → navegador queda abierto para inspección. Cerralo manualmente.');
            } else {
                console.log('[PuppeteerManager] Cerrando navegador...');
                await browser.close();
            }
        }
    }
}

/**
 * "⏹ Cancelar" del frontend: ejecutar() devuelve RESULTADO_CANCELADO en el acto y el navegador
 * se mata (sin el cierre prolijo de browser.close(), que tarda segundos).
 * @returns {Promise<number>} cuántos navegadores cerró
 */
async function cancelar() {
    const abiertos = [...navegadoresActivos];
    console.log(`[PuppeteerManager] Cancelado por el usuario: cerrando ${abiertos.length} navegador(es)`);
    for (const [browser, cortarEspera] of abiertos) {
        cancelados.add(browser);
        navegadoresActivos.delete(browser);
        cortarEspera();
        try { browser.process()?.kill('SIGKILL'); } catch (e) { /* ya estaba cerrado */ }
        browser.close().catch(() => { /* ya estaba cerrado */ });
    }
    return abiertos.length;
}

module.exports = { ejecutar, cancelar, RESULTADO_CANCELADO };
