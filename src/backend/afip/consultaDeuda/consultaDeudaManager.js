const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/facturas/codigo/login/login_arca.js');
const flujo_consultaDeuda = require('../../puppeteer/afip/consultaDeuda/flujos/flujo_consultaDeuda.js');
const os = require('os');
const path = require('path');
const fs = require('fs');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Inicializa el proceso de consulta de deuda
 * @param {string} url - URL de AFIP
 * @param {Object} credenciales - Credenciales del usuario
 * @param {Object} consultaData - Datos de la consulta (usuario, períodos, fecha)
 * @param {string} downloadsPath - Ruta base para guardar los archivos Excel
 * @returns {Object} Resultado del proceso
 */
async function iniciarConsultaDeuda(url, credenciales, consultaData, downloadsPath = null) {
    console.log("🔵 [Consulta Deuda Manager] Iniciando proceso de consulta de deuda...");
    console.log(`   Usuario: ${consultaData.usuario.nombre}`);
    console.log(`   CUIT: ${consultaData.usuario.cuit}`);
    console.log(`   Período Desde: ${consultaData.periodoDesde}`);
    console.log(`   Período Hasta: ${consultaData.periodoHasta}`);
    console.log(`   Fecha Cálculo: ${consultaData.fechaCalculo}`);
    console.log(`   Ruta de descargas: ${downloadsPath || 'NO ESPECIFICADA'}`);

    // Resolver downloadsPath antes de entrar al navegador
    if (!downloadsPath) {
        console.warn("⚠️ [Consulta Deuda Manager] downloadsPath no especificado. Usando carpeta de descargas del sistema...");
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
        console.log(`   Usando ruta de descargas: ${downloadsPath}`);
    }

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

    }, { headless: true });
}

module.exports = {
    iniciarConsulta: iniciarConsultaDeuda,
};
