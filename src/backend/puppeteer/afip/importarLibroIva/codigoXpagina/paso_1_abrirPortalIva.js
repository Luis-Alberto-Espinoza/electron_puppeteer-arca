// Paso 1 — Portal AFIP → buscador "portal iva" → "Portal IVA" (pestaña nueva, siapweb).
// Se abre una pestaña nueva por cliente: cada uno arranca de la misma pantalla conocida.

const { buscarEnAfip } = require('../../archivosComunes/buscadorAfip.js');
const { errorConCodigo } = require('./_comun.js');

const TIMEOUT_PORTAL = 30000;

/**
 * @param {import('puppeteer').Page} page  Pestaña del portal AFIP (logueada).
 * @returns {Promise<import('puppeteer').Page>} Pestaña de Portal IVA, con la cabecera armada.
 */
async function abrirPortalIva(page) {
    const portal = await buscarEnAfip(page, 'portal iva', {
        esperarNuevaPestana: true,
        timeoutNuevaPestana: 10000,
        textoEsperadoEnResultado: 'Portal IVA',
        urlNuevaPestana: 'siapweb.cloud.afip.gob.ar'
    });

    // La app React tarda en armarse: esperar la cabecera con el usuario "NOMBRE [CUIT …]".
    // "Representando a" y el link de cambio de relación NO siempre están: ARCA los dibuja solo
    // si el login tiene más de una relación (una persona sola no representa a nadie).
    await portal.waitForFunction(
        () => /\[CUIT\s*[\d-]+\]/i.test((document.querySelector('#usernav') || {}).textContent || ''),
        { timeout: TIMEOUT_PORTAL }
    ).catch(() => {
        throw errorConCodigo('PORTAL_IVA_NO_ABRIO', 'No cargó Portal IVA.');
    });

    return portal;
}

module.exports = { abrirPortalIva };
