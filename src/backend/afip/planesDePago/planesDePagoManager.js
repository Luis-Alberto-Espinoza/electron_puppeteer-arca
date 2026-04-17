// Manager para el proceso de Planes de Pago AFIP
// Orquesta: login → flujo de consulta

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const flujo = require('../../puppeteer/afip/planesDePago/flujos/flujo_planesDePago.js');
const os = require('os');
const path = require('path');
const fs = require('fs');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Inicia el proceso de consulta de Planes de Pago para un representante y un CUIT
 * @param {Object} credenciales - { usuario: CUIT, contrasena: claveAFIP }
 * @param {Object} usuario - Datos del representante
 * @param {Object} cuitConsulta - { cuit, alias } del CUIT a consultar
 * @param {string} downloadsPath - Ruta para descargas
 */
async function iniciarProceso(credenciales, usuario, cuitConsulta, downloadsPath = null) {
    console.log('[PlanesDePago Manager] Iniciando proceso...');
    console.log(`   Representante: ${usuario.nombre} (${credenciales.usuario})`);
    console.log(`   Consulta CUIT: ${cuitConsulta.cuit} (${cuitConsulta.alias})`);

    if (!downloadsPath) {
        const homeDir = os.homedir();
        const posiblesRutas = [
            path.join(homeDir, 'Downloads'),
            path.join(homeDir, 'Descargas'),
        ];
        for (const ruta of posiblesRutas) {
            if (fs.existsSync(ruta)) {
                downloadsPath = ruta;
                break;
            }
        }
        if (!downloadsPath) {
            downloadsPath = path.join(homeDir, 'Downloads');
        }
    }

    return await puppeteerManager.ejecutar(async (browser, page) => {
        // 1. Login
        console.log('[PlanesDePago Manager] Paso 1: Login...');
        const resultadoLogin = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);

        if (!resultadoLogin.success) {
            console.error('[PlanesDePago Manager] Login falló:', resultadoLogin.message);
            return {
                success: false,
                error: 'LOGIN_FAILED',
                message: resultadoLogin.message
            };
        }

        console.log('[PlanesDePago Manager] Login exitoso. Iniciando flujo...');

        // 2. Ejecutar flujo
        const resultado = await flujo.ejecutarFlujo(page, usuario, cuitConsulta, downloadsPath);
        return resultado;

    }, { headless: false });
}

module.exports = { iniciarProceso };
