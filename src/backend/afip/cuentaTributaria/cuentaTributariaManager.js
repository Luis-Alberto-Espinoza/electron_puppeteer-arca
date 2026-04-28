const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const os = require('os');
const path = require('path');
const fs = require('fs');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Resuelve la carpeta de descargas si no fue provista.
 */
function resolverDownloadsPath(downloadsPath) {
    if (downloadsPath) return downloadsPath;
    const homeDir = os.homedir();
    const candidatos = [
        path.join(homeDir, 'Downloads'),
        path.join(homeDir, 'Descargas'),
    ];
    for (const ruta of candidatos) {
        if (fs.existsSync(ruta)) return ruta;
    }
    return path.join(homeDir, 'Downloads');
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
 * @returns {Promise<Object>}                Resultado dependiente del modo.
 */
async function iniciarProcesoCuentaTributaria(url, credenciales, payload, modo, downloadsPath = null) {
    console.log(`[CuentaTributaria Manager] Iniciando proceso modo=${modo}`);
    downloadsPath = resolverDownloadsPath(downloadsPath);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const resultadoLogin = await loginManager.hacerLogin(page, url || URL_LOGIN_AFIP, credenciales);
        if (!resultadoLogin.success) {
            return {
                success: false,
                error: 'LOGIN_FAILED',
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

    }, { headless: false, dejarAbiertoEnError: true, dejarAbiertoSiempre: true });
}

module.exports = {
    iniciarProceso: iniciarProcesoCuentaTributaria,
};
