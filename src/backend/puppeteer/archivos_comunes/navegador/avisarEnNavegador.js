// Cartel "El navegador quedó a tu disposición" dentro de la página (Declaración Jurada, Portal IVA).
// Va junto con dejarAbiertoSiempre del puppeteer-manager: la automatización terminó y sigue el usuario.

/**
 * Inyecta un modal centrado en la página del navegador avisando que la automatización
 * terminó y que el navegador queda a disposición del usuario (DENTRO del navegador donde
 * está el usuario). Overlay oscuro + caja al medio con botón "Entendido".
 * Nunca rompe el flujo: si la página está navegando, reintenta y después ignora.
 * @param {string} texto
 * @param {{titulo?: string, log?: string}} [opciones]  log = prefijo del servicio para la consola
 */
async function avisarEnNavegador(page, texto, { titulo = 'El navegador quedó a tu disposición', log = '[AvisoNavegador]' } = {}) {
    const inyectar = (msg, tit) => {
        const ID = '__aviso_navegador';
        const prev = document.getElementById(ID);
        if (prev) prev.remove();

        const overlay = document.createElement('div');
        overlay.id = ID;
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'z-index:2147483647',
            'background:rgba(15,23,42,.55)',
            'display:flex', 'align-items:center', 'justify-content:center',
            'font:14px/1.5 Arial,Helvetica,sans-serif'
        ].join(';');

        const caja = document.createElement('div');
        caja.style.cssText = [
            'background:#fff', 'max-width:440px', 'width:90%', 'border-radius:12px',
            'padding:24px 26px', 'text-align:center', 'box-shadow:0 12px 40px rgba(0,0,0,.35)'
        ].join(';');
        caja.innerHTML =
            '<div style="font-size:40px;line-height:1;margin-bottom:10px">🌐</div>' +
            '<h3 style="margin:0 0 10px;color:#1f3a5f;font-size:18px"></h3>' +
            '<p style="margin:0 0 16px;color:#374151">' + msg + '</p>' +
            '<button type="button" style="background:#667eea;color:#fff;border:none;border-radius:8px;' +
            'padding:11px 22px;font-size:15px;font-weight:600;cursor:pointer">Entendido</button>';

        caja.querySelector('h3').textContent = tit;
        const cerrar = () => overlay.remove();
        caja.querySelector('button').addEventListener('click', cerrar);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
        overlay.appendChild(caja);
        document.body.appendChild(overlay);
        return true;
    };

    try { await page.bringToFront(); } catch (_) { /* no crítico */ }

    // Reintentar: al terminar el flujo la página puede estar "ocupada" (XHR pendiente o navegando)
    // y el primer evaluate falla con "Execution context destroyed". Esperamos y reintentamos.
    for (let intento = 1; intento <= 4; intento++) {
        try {
            await page.evaluate(inyectar, texto, titulo);
            console.log(`${log} Aviso "${titulo}" mostrado en el navegador.`);
            return;
        } catch (e) {
            console.warn(`${log} No se pudo mostrar el aviso en el navegador (intento ${intento}/4): ${e.message}`);
            await new Promise(r => setTimeout(r, 800));
        }
    }
}

module.exports = { avisarEnNavegador };
