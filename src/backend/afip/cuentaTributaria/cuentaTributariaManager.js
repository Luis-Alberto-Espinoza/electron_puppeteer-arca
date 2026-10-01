const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const { resolverHeadless } = require('../../puppeteer/archivos_comunes/navegador/browserLauncher.js');
const { app } = require('electron');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Resuelve la carpeta de descargas si no fue provista.
 * Misma carpeta que usan los handlers: la que el sistema define como Descargas.
 */
function resolverDownloadsPath(downloadsPath) {
    return downloadsPath || app.getPath('downloads');
}

/**
 * Inicia el proceso de Cuenta Tributaria.
 *
 * Modos soportados:
 *  - 'consultarA'      : Flujo A primera pasada (login + scrape: cuits asociados, tabla de deuda).
 *  - 'pagarA'          : Flujo A segunda pasada (login + paga filas seleccionadas).
 *  - 'pagarDirectoB'   : Flujo B (login + busca por periodo+impuesto y paga).
 *
 * @param {string} url
 * @param {Object} credenciales              { usuario, contrasena }
 * @param {Object} payload                   Datos especificos del modo (ver handlers.js).
 * @param {string} modo                      'consultarA' | 'pagarA' | 'pagarDirectoB'
 * @param {string} downloadsPath
 * @param {Object} [opciones]
 * @param {boolean} [opciones.visible]       false = navegador oculto; si no llega, visible
 * @returns {Promise<Object>}                Resultado dependiente del modo.
 */
async function iniciarProcesoCuentaTributaria(url, credenciales, payload, modo, downloadsPath = null, { visible } = {}) {
    console.log(`[CuentaTributaria Manager] Iniciando proceso modo=${modo}`);
    downloadsPath = resolverDownloadsPath(downloadsPath);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const resultadoLogin = await loginManager.hacerLogin(page, url || URL_LOGIN_AFIP, credenciales);
        if (!resultadoLogin.success) {
            return {
                success: false,
                error: resultadoLogin.error || 'LOGIN_FAILED',
                message: resultadoLogin.message
            };
        }

        // Carga perezosa de los flujos para evitar costos en otros modos.
        if (modo === 'consultarA' || modo === 'pagarA') {
            const flujo_consultarCT = require('../../puppeteer/afip/CUENTA_TRIBUTARIA/flujos/flujo_consultarCT.js');
            return await flujo_consultarCT.ejecutar(page, payload, modo, downloadsPath, credenciales);
        }

        if (modo === 'pagarDirectoB') {
            const flujo_pagarCT = require('../../puppeteer/afip/CUENTA_TRIBUTARIA/flujos/flujo_pagarCT.js');
            return await flujo_pagarCT.ejecutar(page, payload, downloadsPath, credenciales);
        }

        return {
            success: false,
            error: 'MODO_INVALIDO',
            message: `Modo no reconocido: ${modo}`
        };

    }, {
        headless: resolverHeadless(visible),
        // En error se deja abierto para inspeccionar, pero SOLO si se ve: un navegador
        // oculto abierto no sirve para nada (para inspeccionar, reintentar visible).
        dejarAbiertoEnError: visible !== false,
        dejarAbiertoSiempre: false
    });
}

module.exports = {
    iniciarProceso: iniciarProcesoCuentaTributaria,
};
