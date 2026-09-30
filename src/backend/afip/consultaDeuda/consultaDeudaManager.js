const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const flujo_consultaDeuda = require('../../puppeteer/afip/consultaDeuda/flujos/flujo_consultaDeuda.js');
const { resolverHeadless } = require('../../puppeteer/archivos_comunes/navegador/browserLauncher.js');
const { app } = require('electron');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Inicializa el proceso de consulta de deuda
 * @param {string} url - URL de AFIP
 * @param {Object} credenciales - Credenciales del usuario
 * @param {Object} consultaData - Datos de la consulta (usuario, períodos, fecha)
 * @param {string} downloadsPath - Ruta base para guardar los archivos Excel
 * @param {Object} [opciones]
 * @param {boolean} [opciones.visible] - false = navegador oculto; si no llega, visible
 * @returns {Object} Resultado del proceso
 */
async function iniciarConsultaDeuda(url, credenciales, consultaData, downloadsPath = null, { visible } = {}) {
    console.log("🔵 [Consulta Deuda Manager] Iniciando proceso de consulta de deuda...");
    console.log(`   Usuario: ${consultaData.usuario.nombre}`);
    console.log(`   CUIT: ${consultaData.usuario.cuit}`);
    console.log(`   Período Desde: ${consultaData.periodoDesde}`);
    console.log(`   Período Hasta: ${consultaData.periodoHasta}`);
    console.log(`   Fecha Cálculo: ${consultaData.fechaCalculo}`);
    console.log(`   Ruta de descargas: ${downloadsPath || 'NO ESPECIFICADA'}`);

    // Resolver downloadsPath antes de entrar al navegador
    // Misma carpeta que usan los handlers: la que el sistema define como Descargas.
    if (!downloadsPath) downloadsPath = app.getPath('downloads');

    return await puppeteerManager.ejecutar(async (browser, page) => {
        // 1. Login
        console.log("🔵 [Consulta Deuda Manager] Paso 1: Haciendo login...");
        const resultadoLogin = await loginManager.hacerLogin(page, url || URL_LOGIN_AFIP, credenciales);

        if (!resultadoLogin.success) {
            console.error("❌ [Consulta Deuda Manager] El login falló:", resultadoLogin.message);
            return {
                success: false,
                error: 'LOGIN_FAILED',
                message: resultadoLogin.message
            };
        }

        console.log("✅ [Consulta Deuda Manager] Login exitoso. Iniciando flujo de consulta...");

        // 5. Ejecutar el flujo de consulta de deuda
        const resultado = await flujo_consultaDeuda.ejecutarFlujoConsultaDeuda(
            page,
            consultaData.usuario,
            consultaData.periodoDesde,
            consultaData.periodoHasta,
            consultaData.fechaCalculo,
            downloadsPath
        );

        return resultado;

    }, { headless: resolverHeadless(visible) });
}

module.exports = {
    iniciarConsulta: iniciarConsultaDeuda,
};
