// Manager de Importar Libro IVA (Portal IVA → IVA Simple → importar Ventas y Compras desde ARCA).
// Orquesta UN grupo del lote: login una vez con la clave del grupo y, desde el mismo portal,
// procesa cada contribuyente que entra con esa clave (una pestaña de Portal IVA por cliente).

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const flujo = require('../../puppeteer/afip/importarLibroIva/flujos/flujo_importarLibroIva.js');
const { resolverHeadless } = require('../../puppeteer/archivos_comunes/navegador/browserLauncher.js');
const { RESULTADO_NAVEGADOR_CERRADO, seCerroElNavegador } = require('../../comun/navegadorCerrado.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * @param {{usuario: string, contrasena: string}} credenciales  login del grupo
 * @param {Array<{id, cuit, nombre}>} contribuyentes            los que entran con ese login
 * @param {{periodo: string, downloadsPath: string, descartarBorrador?: boolean, soloVistaPrevia?: boolean}} opcionesFlujo
 *        periodo 'AAAAMM'. soloVistaPrevia: el navegador queda abierto (visible) para revisar la Vista Previa.
 * @param {Function} onProgreso  (datos) => void: 'progreso' (varias por cliente) y 'resultado'
 * @param {Object} [opciones]
 * @param {boolean} [opciones.visible]  false = navegador oculto; si no llega, visible
 * @returns {Promise<{success, error?, message?}>}  success:false = falló el login o se cerró el navegador
 *          (los que faltaban del grupo quedan sin procesar).
 */
async function procesarGrupo(credenciales, contribuyentes, opcionesFlujo, onProgreso, { visible } = {}) {
    console.log(`[ImportarLibroIva Manager] Login ${credenciales.usuario}: ${contribuyentes.length} contribuyente(s)`);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const seCerro = () => seCerroElNavegador(browser, page);

        // El login tarda: avisar para que la rueda no quede con el cliente anterior.
        onProgreso({ tipo: 'progreso', contribuyente: contribuyentes[0], mensaje: `Iniciando sesión en AFIP con ${credenciales.usuario}…` });
        const login = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);
        if (seCerro()) return RESULTADO_NAVEGADOR_CERRADO;
        if (!login.success) {
            return { success: false, error: login.error || 'LOGIN_FAILED', message: login.message };
        }

        for (const contribuyente of contribuyentes) {
            if (seCerro()) return RESULTADO_NAVEGADOR_CERRADO;
            const avisar = (mensaje) => onProgreso({ tipo: 'progreso', contribuyente, mensaje });
            let r = await flujo.procesarCliente(page, contribuyente, opcionesFlujo, avisar);
            if (!r.success && seCerro()) r = RESULTADO_NAVEGADOR_CERRADO;
            onProgreso({ tipo: 'resultado', contribuyente, ...r });
        }
        return { success: true };
    }, opcionesFlujo.soloVistaPrevia
        ? { headless: false, dejarAbiertoSiempre: true }
        : { headless: resolverHeadless(visible) });
}

module.exports = { procesarGrupo };
