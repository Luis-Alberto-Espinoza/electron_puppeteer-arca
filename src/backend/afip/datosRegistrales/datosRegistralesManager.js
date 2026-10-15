// Manager de Datos registrales (Sistema Registral → PDF "Reflejo de datos registrados").
// Orquesta UN grupo del lote: login una vez con la clave del grupo y, en la misma
// sesión, baja el PDF de cada contribuyente que entra con esa clave.

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const flujo = require('../../puppeteer/afip/DATOS_REGISTRALES/flujos/flujo_datosRegistrales.js');
const { resolverHeadless } = require('../../puppeteer/archivos_comunes/navegador/browserLauncher.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * @param {{usuario: string, contrasena: string}} credenciales  login del grupo
 * @param {Array<{id, cuit, nombre}>} contribuyentes            los que entran con ese login
 * @param {string} downloadsPath
 * @param {Function} onProgreso  (datos) => void, una llamada antes y otra después de cada uno
 * @param {Object} [opciones]
 * @param {boolean} [opciones.visible]  false = navegador oculto; si no llega, visible
 * @returns {Promise<{success, error?, message?, resultados?: Array}>}
 *          success:false = falló el login (no se procesó nadie del grupo).
 */
async function procesarGrupo(credenciales, contribuyentes, downloadsPath, onProgreso, { visible } = {}) {
    console.log(`[DatosRegistrales Manager] Login ${credenciales.usuario}: ${contribuyentes.length} contribuyente(s)`);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const login = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);
        if (!login.success) {
            return { success: false, error: login.error || 'LOGIN_FAILED', message: login.message };
        }

        const resultados = [];
        for (const contribuyente of contribuyentes) {
            onProgreso({ tipo: 'progreso', contribuyente, mensaje: 'Descargando datos registrales...' });
            const r = await flujo.descargarDatosRegistrales(page, contribuyente, downloadsPath);
            resultados.push({ contribuyente, ...r });
            onProgreso({ tipo: 'resultado', contribuyente, ...r });
        }
        return { success: true, resultados };
    }, { headless: resolverHeadless(visible) });
}

module.exports = { procesarGrupo };
