// atm/sesion/sesionAtmManager.js
// Lanzador de sesión ATM: abre el navegador, hace login en el portal ATM y lo DEJA
// ABIERTO para que el usuario opere a mano. No hace ninguna tarea automatizada después.

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const { loginATM } = require('../../puppeteer/atm/codigoXpagina/login_atm.js');
const { leerNombreTitularAtm } = require('../../puppeteer/atm/flujosDeTareas/flujo_verificaCredenciales_atm.js');

/**
 * Abre Chrome visible, loguea en el portal ATM y deja la ventana abierta.
 * @param {Object} credenciales { cuit, clave }
 * @param {Object} [opciones]
 * @param {boolean} [opciones.leerNombre]  lee el titular de "Mis Trámites" (modo manual, para guardarlo)
 * @returns {Promise<{success:boolean, nombre?:string|null, error?:string, message?:string}>}
 */
async function abrirSesion(credenciales, { leerNombre = false } = {}) {
    console.log('[SesionATM] Abriendo sesión para CUIT:', credenciales && credenciales.cuit);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const resultadoLogin = await loginATM(page, credenciales);
        if (!resultadoLogin.success) {
            // Se respeta el código del login (ej. INVALID_CREDENTIALS): el front lo usa
            // para ofrecer "actualizar clave" solo cuando la clave está mal.
            return {
                success: false,
                error: resultadoLogin.error || 'LOGIN_FAILED',
                message: resultadoLogin.message
            };
        }
        if (!leerNombre) return { success: true };
        return { success: true, nombre: await leerNombreTitularAtm(page) };
    }, { headless: false, dejarAbiertoSiempre: true });
}

module.exports = { abrirSesion };
