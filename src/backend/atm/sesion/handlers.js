// atm/sesion/handlers.js
// Handler IPC del lanzador de sesión ATM.
//
//   atm:abrirSesion  payload: clienteId (string)
//     → busca el cliente en storage, arma credenciales ATM y abre el navegador logueado.

const sesionAtmManager = require('./sesionAtmManager.js');

/**
 * Arma las credenciales ATM del cliente desde el storage.
 * loginATM espera { cuit, clave }.
 */
function obtenerCredencialesAtm(userStorage, clienteId) {
    const data = userStorage.loadData();
    const u = data.users.find(x => String(x.id) === String(clienteId));
    if (!u) {
        throw new Error(`No se encontró el cliente ${clienteId}`);
    }
    if (!u.claveATM) {
        throw new Error(`El cliente ${u.nombre || clienteId} no tiene clave ATM cargada`);
    }
    return {
        cuit: u.cuit,
        clave: u.claveATM
    };
}

function setupSesionAtmHandlers(ipcMain, userStorage) {
    ipcMain.handle('atm:abrirSesion', async (event, clienteId) => {
        console.log('[SesionATM] Solicitud de apertura para cliente:', clienteId);
        try {
            const credenciales = obtenerCredencialesAtm(userStorage, clienteId);
            return await sesionAtmManager.abrirSesion(credenciales);
        } catch (error) {
            console.error('[SesionATM] Error:', error.message);
            return { success: false, error: 'ABRIR_SESION_ERROR', message: error.message };
        }
    });
}

module.exports = setupSesionAtmHandlers;
