// afip/declaracionJurada/declaracionJuradaManager.js
// Orquesta browser + login + flujo del servicio Declaración Jurada.
// No sabe nada de Electron/IPC: eso vive en handlers.js.
//
// Por ahora soporta un único modo:
//   - 'probarAcceso' : login + buscar "Mis Aplicaciones Web" + volcar selectores
//                      del portal fenix para verificar que matchean.

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * @param {string} url            URL de login (default AFIP).
 * @param {Object} credenciales   { usuario, contrasena }
 * @param {Object} payload        { cliente }
 * @param {string} modo           'probarAcceso'
 * @param {string} downloadsPath
 * @param {boolean} modoPrueba    Si true, deja el navegador abierto al terminar
 *                                para poder inspeccionar el portal a mano.
 */
async function iniciarProcesoDeclaracionJurada(url, credenciales, payload, modo, downloadsPath = null, modoPrueba = true) {
    console.log(`[DeclaracionJurada Manager] Iniciando proceso modo=${modo} (modoPrueba=${modoPrueba})`);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const resultadoLogin = await loginManager.hacerLogin(page, url || URL_LOGIN_AFIP, credenciales);
        if (!resultadoLogin.success) {
            return { success: false, error: 'LOGIN_FAILED', message: resultadoLogin.message };
        }

        if (modo === 'probarAcceso') {
            const flujo = require('../../puppeteer/afip/DECLARACION_JURADA/flujos/flujo_probarAcceso.js');
            return await flujo.ejecutar(page, payload, credenciales);
        }

        if (modo === 'nuevo') {
            const flujo = require('../../puppeteer/afip/DECLARACION_JURADA/flujos/flujo_nuevo.js');
            return await flujo.ejecutar(page, payload, credenciales);
        }

        if (modo === 'buscar') {
            const flujo = require('../../puppeteer/afip/DECLARACION_JURADA/flujos/flujo_buscar.js');
            return await flujo.ejecutar(page, payload, credenciales);
        }

        return { success: false, error: 'MODO_INVALIDO', message: `Modo no reconocido: ${modo}` };

        // TODO producción: cerrar el navegador al terminar. Por ahora (desarrollo) lo
        // dejamos abierto SIEMPRE para poder inspeccionar el resultado del Aceptar.
    }, { headless: false, dejarAbiertoEnError: true, dejarAbiertoSiempre: true });
}

module.exports = {
    iniciarProceso: iniciarProcesoDeclaracionJurada,
};
