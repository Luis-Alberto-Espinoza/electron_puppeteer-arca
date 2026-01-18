const puppeteerManager = require('../archivos_comunes/navegador/puppeteer-manager');
const loginManager = require('../facturas/codigo/login/login_arca.js');
const flujo_generarVEP = require('./codigo/flujos/flujo_generarVEP.js');
const os = require('os');
const path = require('path');
const fs = require('fs');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Inicializa el proceso de generacion de VEP (Volante Electronico de Pago)
 * @param {string} url - URL de AFIP
 * @param {Object} credenciales - Credenciales del usuario
 * @param {Object} usuarioData - Datos del usuario y medio de pago seleccionado
 * @param {Array<string>} periodosSeleccionados - Periodos seleccionados por el usuario (opcional)
 * @param {string} downloadsPath - Ruta base para guardar los archivos descargados
 * @returns {Object} Resultado del proceso
 */
async function iniciarProcesoVEP(url, credenciales, usuarioData, periodosSeleccionados = null, downloadsPath = null) {
    console.log("🔵 [VEP Manager] Iniciando proceso de generacion de VEP...");
    console.log(`   Usuario: ${usuarioData.usuario.nombre}`);
    console.log(`   CUIT: ${usuarioData.usuario.cuit}`);
    console.log(`   Medio de pago: ${usuarioData.medioPago.nombre}`);
    console.log(`   Ruta de descargas: ${downloadsPath || 'NO ESPECIFICADA'}`);

    // Resolver downloadsPath antes de entrar al navegador
    if (!downloadsPath) {
        console.warn("⚠️ [VEP Manager] downloadsPath no especificado. Usando carpeta de descargas del sistema...");
        const homeDir = os.homedir();
        const posiblesRutas = [
            path.join(homeDir, 'Downloads'),
            path.join(homeDir, 'Descargas'),
            path.join(homeDir, 'Téléchargements')
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
        console.log("🔵 [VEP Manager] Paso 1: Haciendo login...");
        const resultadoLogin = await loginManager.hacerLogin(page, url || URL_LOGIN_AFIP, credenciales);

        if (!resultadoLogin.success) {
            console.error("❌ [VEP Manager] El login fallo:", resultadoLogin.message);
            return {
                success: false,
                error: 'LOGIN_FAILED',
                message: resultadoLogin.message
            };
        }

        console.log("✅ [VEP Manager] Login exitoso. Iniciando flujo de VEP...");

        // 2. Ejecutar flujo de VEP
        const resultado = await flujo_generarVEP.ejecutarFlujoVEP(
            page,
            usuarioData.usuario,
            usuarioData.medioPago,
            periodosSeleccionados,
            downloadsPath
        );

        return resultado;

    }, { headless: true });
}

module.exports = {
    iniciarProceso: iniciarProcesoVEP,
};
