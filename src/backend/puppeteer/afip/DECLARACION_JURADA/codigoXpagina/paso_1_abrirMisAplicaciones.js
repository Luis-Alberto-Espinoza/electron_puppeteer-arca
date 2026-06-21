// paso_1_abrirMisAplicaciones.js
// Busca "Mis Aplicaciones Web" en el portal AFIP y aterriza en el portal fenix
// (https://fenix.cloud.afip.gob.ar/fenix/contribuyente/app).
//
// Maneja el re-login intermedio (igual que el SCT): a veces AFIP rebota a la
// pantalla de login antes de abrir el servicio.
//
// IMPORTANTE: fenix es una app Vaadin/GWT. Los iframes que aparecen
// (__gwt_historyFrame, DefaultWidgetSet) son plomería interna de GWT, NO
// contenido — el formulario se renderiza en el documento principal. Por eso
// acá operamos sobre `page` directamente, sin scopear a ningún iframe.

const { buscarEnAfip } = require('../../archivosComunes/buscadorAfip.js');
const loginManager = require('../../archivosComunes/login/login_arca.js');

const FENIX_URL_PART = 'fenix.cloud.afip.gob.ar';
const LOGIN_URL_PART = 'auth.afip.gob.ar/contribuyente_/login';

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} credenciales  { usuario, contrasena } — por si hay re-login.
 * @returns {Promise<import('puppeteer').Page>} la página del portal fenix.
 */
async function ejecutar(page, credenciales) {
    console.log('[DDJJ paso_1] Buscando "Mis Aplicaciones Web"...');

    const fenixPage = await buscarEnAfip(page, 'Mis Aplicaciones Web', {
        esperarNuevaPestana: true,
        timeoutNuevaPestana: 15000,
        textoEsperadoEnResultado: 'Mis Aplicaciones Web'   // habilita F5 retry si el buscador queda frío
    });

    // Race: ¿abrió fenix, o AFIP pide re-login intermedio?
    await fenixPage.waitForFunction(
        (fenix, login) => location.href.includes(fenix) || location.href.includes(login),
        { timeout: 30000 },
        FENIX_URL_PART, LOGIN_URL_PART
    );

    if (fenixPage.url().includes(LOGIN_URL_PART)) {
        console.log('[DDJJ paso_1] AFIP pidió re-login intermedio. Reintentando login...');
        const r = await loginManager.hacerLogin(fenixPage, fenixPage.url(), credenciales);
        if (!r.success) {
            throw new Error(`Re-login intermedio falló: ${r.message}`);
        }
        await fenixPage.waitForFunction(
            (fenix) => location.href.includes(fenix),
            { timeout: 30000 },
            FENIX_URL_PART
        );
    }

    // Esperar a que Vaadin termine de renderizar los widgets del formulario.
    // Cualquiera de estos hooks indica que la vista "Buscar" ya está montada.
    await fenixPage.waitForFunction(() => {
        return !!document.querySelector('select.v-select-select')
            || !!document.querySelector('.v-filterselect-input')
            || !!document.querySelector('.eFormAceptarButton');
    }, { timeout: 30000 });

    console.log(`[DDJJ paso_1] Portal fenix listo: ${fenixPage.url()}`);
    return fenixPage;
}

module.exports = { ejecutar };
