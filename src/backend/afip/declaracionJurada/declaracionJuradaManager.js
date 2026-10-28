// afip/declaracionJurada/declaracionJuradaManager.js
// Orquesta browser + login + flujo del servicio Declaración Jurada.
// No sabe nada de Electron/IPC: eso vive en handlers.js.
//
// Por ahora soporta un único modo:
//   - 'probarAcceso' : login + buscar "Mis Aplicaciones Web" + volcar selectores
//                      del portal fenix para verificar que matchean.

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const { avisarEnNavegador } = require('../../puppeteer/archivos_comunes/navegador/avisarEnNavegador.js');
const { resolverHeadless } = require('../../puppeteer/archivos_comunes/navegador/browserLauncher.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

// El flujo trabaja en una pestaña nueva (Mis Aplicaciones Web): el aviso de "navegador a
// tu disposición" va en la última abierta, que es donde quedó el formulario.
async function pestanaFinal(browser, page) {
    const pestanas = (await browser.pages()).filter(p => !p.isClosed());
    return pestanas[pestanas.length - 1] || page;
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

    const avisar = (payload && payload.avisar) || (() => {});
    // Switch "Mostrar navegador" del lanzador. Oculto: no queda abierto al terminar (nadie lo
    // ve) ni se inyecta el aviso de "navegador a tu disposición".
    const visible = !(payload && payload.visible === false);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        avisar('Iniciando sesión en AFIP…');
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
            let resultado = await flujo.ejecutar(page, payload, credenciales);

            // "Reemplazar borrador" (casilla opt-in del frontend): si AFIP dice que ya hay un
            // borrador, se borra con Buscar → Borrar y se vuelve a cargar, en la MISMA sesión.
            // Nunca un PRESENTADO: ese sale como 'ya-presentado' y no entra acá.
            if (payload.reemplazarBorrador && resultado && resultado.aceptar && resultado.aceptar.status === 'borrador-existente') {
                avisar('Borrando el borrador anterior…');
                const flujoBuscar = require('../../puppeteer/afip/DECLARACION_JURADA/flujos/flujo_buscar.js');
                const borrado = await flujoBuscar.ejecutar(page, { ...payload, accion: 'borrar' }, credenciales);
                const ok = !!(borrado && borrado.success && borrado.accion && borrado.accion.borrado);
                const motivo = ok ? '' : ((borrado && borrado.accion && borrado.accion.motivo)
                    || (borrado && borrado.resultados && borrado.resultados.length !== 1 ? `Buscar encontró ${borrado.resultados.length} formularios (se borra solo si hay 1)` : '')
                    || (borrado && borrado.message) || 'no se confirmó el borrado');
                if (ok) {
                    avisar('Borrador anterior borrado. Cargando de nuevo…');
                    resultado = await flujo.ejecutar(page, payload, credenciales);
                }
                resultado = { ...resultado, reemplazo: { borrado: ok, motivo, resumen: borrado && borrado.resumen } };
                if (resultado.resumen && borrado && borrado.resumen) resultado.resumen = borrado.resumen + '\n\n' + resultado.resumen;
            }

            if (visible && resultado && resultado.corte) await avisarEnNavegador(await pestanaFinal(browser, page), `⛔ La carga se cortó en "${resultado.corte.paso}": ${resultado.corte.mensaje} Revisalo acá; no se grabó nada.`, { log: '[DeclaracionJurada Manager]' });
            else if (visible) await avisarEnNavegador(await pestanaFinal(browser, page), 'La carga automática terminó. El navegador quedó a tu disposición para revisar o completar a mano. ⏱️ La sesión de AFIP dura un tiempo limitado.', { log: '[DeclaracionJurada Manager]' });
            return resultado;
        }

        if (modo === 'buscar') {
            const flujo = require('../../puppeteer/afip/DECLARACION_JURADA/flujos/flujo_buscar.js');
            const resultado = await flujo.ejecutar(page, { ...payload, visible }, credenciales);
            if (visible) await avisarEnNavegador(await pestanaFinal(browser, page), 'La búsqueda terminó. El navegador quedó a tu disposición. ⏱️ La sesión de AFIP dura un tiempo limitado.', { log: '[DeclaracionJurada Manager]' });
            return resultado;
        }

        return { success: false, error: 'MODO_INVALIDO', message: `Modo no reconocido: ${modo}` };

        // TODO producción: cerrar el navegador al terminar. Por ahora (desarrollo) lo
        // dejamos abierto SIEMPRE para poder inspeccionar el resultado del Aceptar.
    }, { headless: resolverHeadless(visible), dejarAbiertoEnError: visible, dejarAbiertoSiempre: visible });
}

module.exports = {
    iniciarProceso: iniciarProcesoDeclaracionJurada,
};
