// Paso 3a — IVA Simple: "Tiene un borrador sin presentar, correspondiente a otro período (MM/AAAA)".
// ARCA no deja abrir un período nuevo mientras haya un borrador de otro: hay que presentarlo o
// descartarlo. Acá solo se descarta (nunca se presenta), y solo si el usuario lo autorizó.
//
// Pantalla (liva.afip.gob.ar/liva/jsp/mostrarMenu.do): .panel-danger con el texto + #btn_volver
// + #btnEliminarBorrador → modal BootstrapDialog "Descartar Borrador" → eliminarBorradorDesdeIngreso.do
// ({estado:"ok"}) → borradorEliminado.jsp → #btnContinuar → vuelve a Portal IVA.

const { errorConCodigo, esperarUrl, clickReal, periodoLegible } = require('./_comun.js');

const BTN_DESCARTAR = '#btnEliminarBorrador';
const BTN_CONFIRMAR = '.bootstrap-dialog .modal-footer .btn-danger';
const TIMEOUT = 60000;

/** Período ('AAAAMM') del borrador que bloquea, o null si la página no es ese error. */
async function leerBorradorOtroPeriodo(liva) {
    return liva.evaluate(() => {
        if (!document.querySelector('#btnEliminarBorrador')) return null;
        const texto = (document.querySelector('.panel-danger .panel-body') || {}).textContent || '';
        const m = /borrador sin presentar[\s\S]*?\((\d{2})\/(\d{4})\)/i.exec(texto);
        return m ? `${m[2]}${m[1]}` : null;
    }).catch(() => null);
}

/**
 * Descarta el borrador y vuelve a Portal IVA.
 * @param {import('puppeteer').Page} liva  en la pantalla del error.
 * @param {string} periodoBorrador  'AAAAMM' leído de la pantalla (el que el usuario autorizó).
 * @returns {Promise<import('puppeteer').Page>} la pestaña de Portal IVA.
 */
async function descartarBorrador(liva, periodoBorrador) {
    const legible = periodoLegible(periodoBorrador);
    await clickReal(liva, BTN_DESCARTAR);
    await liva.waitForSelector(BTN_CONFIRMAR, { visible: true, timeout: 20000 }).catch(() => {
        throw errorConCodigo('BORRADOR_NO_DESCARTADO', `ARCA no mostró la confirmación para descartar el borrador ${legible}.`);
    });

    const respuesta = liva.waitForResponse(r => r.url().includes('eliminarBorradorDesdeIngreso.do'), { timeout: TIMEOUT });
    await clickReal(liva, BTN_CONFIRMAR);
    const r = await respuesta.catch(() => null);
    const json = r ? await r.json().catch(() => null) : null;
    if (!json || json.estado !== 'ok') {
        throw errorConCodigo('BORRADOR_NO_DESCARTADO',
            `ARCA no descartó el borrador ${legible}${json && json.mensajeError ? `: ${json.mensajeError}` : '.'}`);
    }

    // "Listo, tu borrador fue eliminado" → Continuar vuelve a Portal IVA.
    if (!await esperarUrl(liva, /borradorEliminado\.jsp/, TIMEOUT)) {
        throw errorConCodigo('BORRADOR_NO_DESCARTADO', `ARCA descartó el borrador ${legible} pero no mostró la confirmación.`);
    }
    await clickReal(liva, '#btnContinuar');

    // Normalmente vuelve en la misma pestaña; por las dudas se mira también si abrió otra.
    const limite = Date.now() + TIMEOUT;
    while (Date.now() < limite) {
        const paginas = [liva, ...(await liva.browser().pages()).filter(p => p !== liva)];
        const portal = paginas.find(p => /siapweb\.cloud\.afip\.gob\.ar\/iva/.test(p.url()));
        if (portal && await esperarUrl(portal, /siapweb\.cloud\.afip\.gob\.ar\/iva/, 5000)) {
            // Si volvió en otra pestaña, se cierra esta: quedaría en liva/jsp y el paso 3
            // la confundiría con el Libro IVA nuevo.
            if (portal !== liva) await liva.close().catch(() => {});
            return portal;
        }
        await new Promise(res => setTimeout(res, 500));
    }
    throw errorConCodigo('PORTAL_IVA_NO_ABRIO', `Se descartó el borrador ${legible}, pero no volvió a Portal IVA.`);
}

module.exports = { leerBorradorOtroPeriodo, descartarBorrador };
