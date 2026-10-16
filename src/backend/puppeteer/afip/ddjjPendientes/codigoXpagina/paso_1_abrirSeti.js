// Paso 1 — Portal AFIP → buscador "ddjj y" → "Presentación de DDJJ y Pagos" (pestaña nueva, Seti).
// Al entrar puede saltar el modal "Novedades del servicio": se cierra si aparece.

const { buscarEnAfip } = require('../../archivosComunes/buscadorAfip.js');
const { cerrarAvisos } = require('./_seti.js');

const TIMEOUT_SETI = 30000;

/**
 * @param {import('puppeteer').Page} page  Pestaña del portal AFIP (logueada).
 * @returns {Promise<import('puppeteer').Page>} Pestaña de Seti, ya sin avisos.
 */
async function abrirSeti(page) {
    const seti = await buscarEnAfip(page, 'ddjj y', {
        esperarNuevaPestana: true,
        timeoutNuevaPestana: 10000,
        textoEsperadoEnResultado: 'Presentación de DDJJ y Pagos',
        urlNuevaPestana: 'seti.afip.gob.ar'
    });

    // La app Vue tarda en armarse: esperar el título del servicio en pantalla.
    await seti.waitForFunction(
        () => /presentaci[oó]n de ddjj y pagos/i.test(document.body ? document.body.innerText : ''),
        { timeout: TIMEOUT_SETI }
    ).catch(() => {
        throw new Error('No cargó "Presentación de DDJJ y Pagos" (Seti).');
    });

    await cerrarAvisos(seti);
    return seti;
}

module.exports = { abrirSeti };
