// Manager de Importar Libro IVA (Portal IVA → IVA Simple → importar Ventas y Compras desde ARCA).
// Orquesta UN grupo del lote: login una vez con la clave del grupo y, desde el mismo portal,
// procesa cada contribuyente que entra con esa clave (una pestaña de Portal IVA por cliente).

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const flujo = require('../../puppeteer/afip/importarLibroIva/flujos/flujo_importarLibroIva.js');
const { resolverHeadless } = require('../../puppeteer/archivos_comunes/navegador/browserLauncher.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * @param {{usuario: string, contrasena: string}} credenciales  login del grupo
 * @param {Array<{id, cuit, nombre}>} contribuyentes            los que entran con ese login
 * @param {{periodo: string, downloadsPath: string, descartarBorrador?: boolean}} opcionesFlujo  periodo 'AAAAMM'
 * @param {Function} onProgreso  (datos) => void: 'progreso' (varias por cliente) y 'resultado'
 * @param {Object} [opciones]
 * @param {boolean} [opciones.visible]  false = navegador oculto; si no llega, visible
 * @returns {Promise<{success, error?, message?}>}  success:false = falló el login (no se procesó nadie).
 */
async function procesarGrupo(credenciales, contribuyentes, opcionesFlujo, onProgreso, { visible } = {}) {
    console.log(`[ImportarLibroIva Manager] Login ${credenciales.usuario}: ${contribuyentes.length} contribuyente(s)`);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const login = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);
        if (!login.success) {
            return { success: false, error: login.error || 'LOGIN_FAILED', message: login.message };
        }

        for (const contribuyente of contribuyentes) {
            const avisar = (mensaje) => onProgreso({ tipo: 'progreso', contribuyente, mensaje });
            const r = await flujo.procesarCliente(page, contribuyente, opcionesFlujo, avisar);
            onProgreso({ tipo: 'resultado', contribuyente, ...r });
        }
        return { success: true };
    }, { headless: resolverHeadless(visible) });
}

module.exports = { procesarGrupo };
