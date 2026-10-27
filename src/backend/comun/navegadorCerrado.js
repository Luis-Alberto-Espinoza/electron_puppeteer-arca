// El usuario cerró el navegador a mano en medio de la automatización.
// Sin esto, el error que queda es el del paso que se cortó ("No cargó Seti", "Target closed"…)
// y parece una falla de AFIP.

const RESULTADO_NAVEGADOR_CERRADO = Object.freeze({
    success: false,
    error: 'NAVEGADOR_CERRADO',
    message: 'Se cerró el navegador antes de terminar'
});

// `error` (opcional): el que cortó el flujo. Sirve cuando se trabaja en OTRA pestaña
// (ej. Comprobantes en línea se abre aparte): si el usuario cierra la ventana, el
// navegador tarda en desconectarse y la pestaña del login todavía figura abierta,
// pero el paso que estaba corriendo ya tiró TargetCloseError.
function seCerroElNavegador(browser, page, error) {
    if (!browser.isConnected() || page.isClosed()) return true;
    return !!error && (error.name === 'TargetCloseError' || /Target closed|Session closed/i.test(error.message || ''));
}

module.exports = { RESULTADO_NAVEGADOR_CERRADO, seCerroElNavegador };
