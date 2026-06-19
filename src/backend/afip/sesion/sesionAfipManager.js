// afip/sesion/sesionAfipManager.js
// Lanzador de sesión AFIP: abre el navegador, hace login en ARCA y lo DEJA ABIERTO
// para que el usuario opere a mano. No hace ninguna tarea automatizada después.

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Abre Chrome visible, loguea en ARCA y deja la ventana abierta.
 * @param {Object} credenciales { usuario, contrasena }
 * @returns {Promise<{success:boolean, error?:string, message?:string}>}
 */
async function abrirSesion(credenciales) {
    console.log('[SesionAFIP] Abriendo sesión para CUIT:', credenciales && credenciales.usuario);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const resultadoLogin = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);
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
