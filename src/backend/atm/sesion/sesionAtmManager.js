// atm/sesion/sesionAtmManager.js
// Lanzador de sesión ATM: abre el navegador, hace login en el portal ATM y lo DEJA
// ABIERTO para que el usuario opere a mano. No hace ninguna tarea automatizada después.

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const { loginATM } = require('../../puppeteer/atm/codigoXpagina/login_atm.js');

/**
 * Abre Chrome visible, loguea en el portal ATM y deja la ventana abierta.
 * @param {Object} credenciales { cuit, clave }
 * @returns {Promise<{success:boolean, error?:string, message?:string}>}
 */
async function abrirSesion(credenciales) {
    console.log('[SesionATM] Abriendo sesión para CUIT:', credenciales && credenciales.cuit);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const resultadoLogin = await loginATM(page, credenciales);
        if (!resultadoLogin.success) {
            return {
                success: false,
                error: 'LOGIN_FAILED',
                message: resultadoLogin.message
            };
        }
        return { success: true };
    }, { headless: false, dejarAbiertoSiempre: true });
}

module.exports = { abrirSesion };
