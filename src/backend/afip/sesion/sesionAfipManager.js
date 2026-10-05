// afip/sesion/sesionAfipManager.js
// Lanzador de sesión AFIP: abre el navegador, hace login en ARCA y lo DEJA ABIERTO
// para que el usuario opere a mano. No hace ninguna tarea automatizada después.

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const { leerNombreTitularAfip } = require('../../puppeteer/verificaCredenciales/flujo_verificaCredenciales_AFIP.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Abre Chrome visible, loguea en ARCA y deja la ventana abierta.
 * @param {Object} credenciales { usuario, contrasena }
 * @param {Object} [opciones]
 * @param {boolean} [opciones.leerNombre]  lee el titular del encabezado (modo manual, para guardarlo)
 * @returns {Promise<{success:boolean, nombre?:string|null, error?:string, message?:string}>}
 */
async function abrirSesion(credenciales, { leerNombre = false } = {}) {
    console.log('[SesionAFIP] Abriendo sesión para CUIT:', credenciales && credenciales.usuario);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const resultadoLogin = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);
        if (!resultadoLogin.success) {
            // Se respeta el código del login (ej. INVALID_CREDENTIALS): el front lo usa
            // para ofrecer "actualizar clave" solo cuando la clave está mal.
            return {
                success: false,
                error: resultadoLogin.error || 'LOGIN_FAILED',
                message: resultadoLogin.message
            };
        }
        if (!leerNombre) return { success: true };
        // Best-effort: el encabezado aparece con el portal; si no llega, el nombre queda null.
        await page.waitForSelector('#buscadorInput', { timeout: 10000 }).catch(() => {});
        return { success: true, nombre: await leerNombreTitularAfip(page) };
    }, { headless: false, dejarAbiertoSiempre: true });
}

module.exports = { abrirSesion };
