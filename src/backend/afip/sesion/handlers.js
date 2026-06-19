// afip/sesion/handlers.js
// Handler IPC del lanzador de sesión AFIP.
//
//   afip:abrirSesion  payload: clienteId (string)
//     → busca el cliente en storage, arma credenciales AFIP y abre el navegador logueado.

const sesionAfipManager = require('./sesionAfipManager.js');

/**
 * Arma las credenciales AFIP del cliente desde el storage.
 * Mismo criterio que afip/cuentaTributaria/handlers.js (obtenerCredenciales).
 */
function obtenerCredencialesAfip(userStorage, clienteId) {
    const data = userStorage.loadData();
    const u = data.users.find(x => String(x.id) === String(clienteId));
    if (!u) {
        throw new Error(`No se encontró el cliente ${clienteId}`);
    }
    if (!u.claveAFIP) {
        throw new Error(`El cliente ${u.nombre || clienteId} no tiene clave AFIP cargada`);
    }
    return {
        usuario: u.cuit,
        contrasena: u.claveAFIP
    };
}

function setupSesionAfipHandlers(ipcMain, userStorage) {
    ipcMain.handle('afip:abrirSesion', async (event, clienteId) => {
        console.log('[SesionAFIP] Solicitud de apertura para cliente:', clienteId);
        try {
            const credenciales = obtenerCredencialesAfip(userStorage, clienteId);
            return await sesionAfipManager.abrirSesion(credenciales);
        } catch (error) {
            console.error('[SesionAFIP] Error:', error.message);
            return { success: false, error: 'ABRIR_SESION_ERROR', message: error.message };
        }
    });
}

module.exports = setupSesionAfipHandlers;
