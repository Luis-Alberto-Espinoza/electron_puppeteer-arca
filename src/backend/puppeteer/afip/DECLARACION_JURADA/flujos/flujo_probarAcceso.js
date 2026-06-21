// flujo_probarAcceso.js
// Flujo de DIAGNÓSTICO del servicio Declaración Jurada (modo prueba):
//   paso_1: buscar "Mis Aplicaciones Web" → portal fenix
//   paso_2: volcar selectores para confirmar que matchean
//
// El login ya lo hizo el manager antes de delegar acá.

const paso1 = require('../codigoXpagina/paso_1_abrirMisAplicaciones.js');
const paso2 = require('../codigoXpagina/paso_2_verificarSelectores.js');
const paso3 = require('../codigoXpagina/paso_3_explorarNuevo.js');

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} payload       { cliente }
 * @param {Object} credenciales  { usuario, contrasena } — por re-login intermedio.
 */
async function ejecutar(page, payload, credenciales) {
    try {
        const fenixPage = await paso1.ejecutar(page, credenciales);
        const { hallazgos, resumen } = await paso2.ejecutar(fenixPage);

        // Exploración del flujo "Nuevo" (prueba el click + captura el combo Organismo).
        // En try/catch para no perder los resultados de paso_1/paso_2 si el combo falla.
        let nuevo = null;
        let resumenNuevo = '';
        try {
            nuevo = await paso3.ejecutar(fenixPage, { caption: 'Organismo' });
            resumenNuevo = '\n\n' + nuevo.resumen;
        } catch (e) {
            console.error('[DDJJ flujo_probarAcceso] paso_3 (Nuevo) falló:', e.message);
            nuevo = { error: e.message };
            resumenNuevo = `\n\n--- Exploración "Nuevo" ---\n❌ ${e.message}`;
        }

        return {
            success: true,
            modo: 'probarAcceso',
            cliente: payload && payload.cliente,
            url: fenixPage.url(),
            hallazgos,
            nuevo,
            resumen: resumen + resumenNuevo
        };
    } catch (error) {
        console.error('[DDJJ flujo_probarAcceso] Error:', error);
        return {
            success: false,
            error: 'FLUJO_ERROR',
            message: error.message,
            stack: error.stack
        };
    }
}

module.exports = { ejecutar };
