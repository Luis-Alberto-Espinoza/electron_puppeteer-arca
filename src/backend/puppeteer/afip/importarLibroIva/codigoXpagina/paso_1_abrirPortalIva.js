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

    // La app React tarda en armarse: esperar la cabecera con "Representando a" y el link
    // de cambio de relación.
    await portal.waitForFunction(
        () => !!document.querySelector('a[href*="#/changeRelation"]') &&
              /representando a/i.test(document.body ? document.body.innerText : ''),
        { timeout: TIMEOUT_PORTAL }
    ).catch(() => {
        throw errorConCodigo('PORTAL_IVA_NO_ABRIO', 'No cargó Portal IVA.');
    });

    return portal;
}

module.exports = { abrirPortalIva };
