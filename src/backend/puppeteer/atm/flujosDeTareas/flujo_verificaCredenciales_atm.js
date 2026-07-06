const { loginATM } = require('../codigoXpagina/login_atm.js');
const puppeteerManager = require('../../archivos_comunes/navegador/puppeteer-manager');

/**
 * Lee el nombre del titular desde el encabezado de "Mis Trámites" de ATM. El nombre es
 * el texto del <h3> SIN el <span> (ese trae el usuario de sesión, ej. "taxwebp1@...").
 * Best-effort: si el selector cambió, devuelve null y no rompe la verificación.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<string|null>}
 */
async function leerNombreTitularAtm(page) {
    try {
        return await page.evaluate(() => {
            const h3 = document.querySelector('.bocas-padre-miTramites h3');
            if (!h3) return null;
            let txt = '';
            h3.childNodes.forEach(n => { if (n.nodeType === Node.TEXT_NODE) txt += n.textContent; });
            txt = txt.replace(/\s+/g, ' ').trim();
            return txt || null;
        });
    } catch (_) {
        return null;
    }
}

/**
 * Flujo de trabajo para verificar las credenciales de ATM.
 *
 * Abre su PROPIO navegador (visible), loguea y lo cierra al terminar. Simétrico al
 * flujo AFIP: cada servicio gestiona su navegador de punta a punta, así nunca quedan
 * dos ventanas abiertas a la vez (antes reusaba un navegador ya abierto por el manager).
 *
 * @param {import('puppeteer').Page} _page IGNORADO (se mantiene por compatibilidad de firma).
 * @param {string} cuit El CUIT del usuario.
 * @param {string} clave La clave del usuario.
 * @returns {Promise<{success: boolean, error?: string, message?: string}>} El resultado de la operación de login.
 */
async function verificarCredencialesATM(_page, cuit, clave) {
    console.log(`[Flujo ATM] ==> Iniciando verificación para CUIT: ${cuit}`);

    // ejecutar() abre el navegador al entrar y lo cierra en el finally (éxito o error),
    // igual que hace el flujo de AFIP.
    return await puppeteerManager.ejecutar(async (browser, atmPage) => {
        const resultadoLogin = await loginATM(atmPage, { cuit, clave });

        // Si el login anduvo, aprovechamos para leer el nombre del titular (comodidad del alta).
        if (resultadoLogin && resultadoLogin.success) {
            resultadoLogin.nombre = await leerNombreTitularAtm(atmPage);
            if (resultadoLogin.nombre) console.log(`[Flujo ATM] Titular detectado: ${resultadoLogin.nombre}`);
        }

        console.log(`[Flujo ATM] <== Finalizada verificación. Resultado: ${resultadoLogin.success ? 'Éxito' : 'Fallo (' + resultadoLogin.error + ')'}`);

        return resultadoLogin;
    }, { headless: false });
}

module.exports = verificarCredencialesATM;