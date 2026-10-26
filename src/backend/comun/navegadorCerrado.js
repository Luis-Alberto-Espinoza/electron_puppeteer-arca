// El usuario cerró el navegador a mano en medio de la automatización.
// Sin esto, el error que queda es el del paso que se cortó ("No cargó Seti", "Target closed"…)
// y parece una falla de AFIP.

const RESULTADO_NAVEGADOR_CERRADO = Object.freeze({
    success: false,
    error: 'NAVEGADOR_CERRADO',
    message: 'Se cerró el navegador antes de terminar'
});

function seCerroElNavegador(browser, page) {
    return !browser.isConnected() || page.isClosed();
}

module.exports = { RESULTADO_NAVEGADOR_CERRADO, seCerroElNavegador };
