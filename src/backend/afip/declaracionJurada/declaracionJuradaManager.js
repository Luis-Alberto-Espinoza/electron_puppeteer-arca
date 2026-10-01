// afip/declaracionJurada/declaracionJuradaManager.js
// Orquesta browser + login + flujo del servicio Declaración Jurada.
// No sabe nada de Electron/IPC: eso vive en handlers.js.
//
// Por ahora soporta un único modo:
//   - 'probarAcceso' : login + buscar "Mis Aplicaciones Web" + volcar selectores
//                      del portal fenix para verificar que matchean.

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Inyecta un modal centrado en la página del navegador avisando que la automatización
 * terminó y que el navegador queda a disposición del usuario (espeja el modal de Electron,
 * pero DENTRO del navegador donde está el usuario). Overlay oscuro + caja al medio con botón
 * "Entendido". Nunca rompe el flujo: si la página está navegando, ignora.
 */
async function avisarEnNavegador(page, texto) {
    const inyectar = (msg) => {
        const ID = '__ddjj_aviso_navegador';
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
            '<h3 style="margin:0 0 10px;color:#1f3a5f;font-size:18px">El navegador quedó a tu disposición</h3>' +
            '<p style="margin:0 0 16px;color:#374151">' + msg + '</p>' +
            '<button type="button" style="background:#667eea;color:#fff;border:none;border-radius:8px;' +
            'padding:11px 22px;font-size:15px;font-weight:600;cursor:pointer">Entendido</button>';

        const cerrar = () => overlay.remove();
        caja.querySelector('button').addEventListener('click', cerrar);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
        overlay.appendChild(caja);
        document.body.appendChild(overlay);
        return true;
    };

    try { await page.bringToFront(); } catch (_) { /* no crítico */ }

    // Reintentar: al terminar el flujo la página Vaadin puede estar "ocupada" (XHR pendiente)
    // y el primer evaluate falla con "Execution context destroyed". Esperamos y reintentamos.
    for (let intento = 1; intento <= 4; intento++) {
        try {
            await page.evaluate(inyectar, texto);
            console.log('[DeclaracionJurada Manager] Banner de aviso inyectado en el navegador.');
            return;
        } catch (e) {
            console.warn(`[DeclaracionJurada Manager] No se pudo inyectar el banner (intento ${intento}/4): ${e.message}`);
            await new Promise(r => setTimeout(r, 800));
        }
    }
}

/**
 * @param {string} url            URL de login (default AFIP).
 * @param {Object} credenciales   { usuario, contrasena }
 * @param {Object} payload        { cliente }
 * @param {string} modo           'probarAcceso'
 * @param {string} downloadsPath
 * @param {boolean} modoPrueba    Si true, deja el navegador abierto al terminar
 *                                para poder inspeccionar el portal a mano.
 */
async function iniciarProcesoDeclaracionJurada(url, credenciales, payload, modo, downloadsPath = null, modoPrueba = true) {
    console.log(`[DeclaracionJurada Manager] Iniciando proceso modo=${modo} (modoPrueba=${modoPrueba})`);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const resultadoLogin = await loginManager.hacerLogin(page, url || URL_LOGIN_AFIP, credenciales);
        if (!resultadoLogin.success) {
            return { success: false, error: resultadoLogin.error || 'LOGIN_FAILED', message: resultadoLogin.message };
        }

        if (modo === 'probarAcceso') {
            const flujo = require('../../puppeteer/afip/DECLARACION_JURADA/flujos/flujo_probarAcceso.js');
            return await flujo.ejecutar(page, payload, credenciales);
        }

        if (modo === 'nuevo') {
            const flujo = require('../../puppeteer/afip/DECLARACION_JURADA/flujos/flujo_nuevo.js');
            const resultado = await flujo.ejecutar(page, payload, credenciales);
            console.log('[DeclaracionJurada Manager] >>> Inyectando aviso en el navegador (modo nuevo)...');
            await avisarEnNavegador(page, 'La carga automática terminó. El navegador quedó a tu disposición para revisar o completar a mano. ⏱️ La sesión de AFIP dura un tiempo limitado.');
            return resultado;
        }

        if (modo === 'buscar') {
            const flujo = require('../../puppeteer/afip/DECLARACION_JURADA/flujos/flujo_buscar.js');
            const resultado = await flujo.ejecutar(page, payload, credenciales);
            console.log('[DeclaracionJurada Manager] >>> Inyectando aviso en el navegador (modo buscar)...');
            await avisarEnNavegador(page, 'La búsqueda terminó. El navegador quedó a tu disposición. ⏱️ La sesión de AFIP dura un tiempo limitado.');
            return resultado;
        }

        return { success: false, error: 'MODO_INVALIDO', message: `Modo no reconocido: ${modo}` };

        // TODO producción: cerrar el navegador al terminar. Por ahora (desarrollo) lo
        // dejamos abierto SIEMPRE para poder inspeccionar el resultado del Aceptar.
    }, { headless: false, dejarAbiertoEnError: true, dejarAbiertoSiempre: true });
}

module.exports = {
    iniciarProceso: iniciarProcesoDeclaracionJurada,
};
