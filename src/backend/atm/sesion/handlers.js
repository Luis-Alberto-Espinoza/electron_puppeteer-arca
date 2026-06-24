// atm/sesion/handlers.js
// Handler IPC del lanzador de sesión ATM.
//
//   atm:abrirSesion  payload: cuit (string)
//     → resuelve el acceso ATM (siempre directo, clave propia) y abre el navegador logueado.
//
// Usa el modelo plano: resolverAcceso(cuit, 'atm'). ATM no tiene representación,
// así que el login es siempre con el CUIT/clave propios. Las claves no salen del
// main process.

const sesionAtmManager = require('./sesionAtmManager.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');

function setupSesionAtmHandlers(ipcMain) {
    const repo = getContribuyenteRepo();

    ipcMain.handle('atm:abrirSesion', async (event, cuit) => {
        console.log('[SesionATM] Solicitud de apertura para CUIT:', cuit);
        try {
            const acceso = await repo.resolverAcceso(String(cuit), 'atm');
            if (!acceso) {
                return {
                    success: false,
                    error: 'SIN_ACCESO',
                    message: 'El contribuyente no tiene clave ATM cargada.'
                };
            }
            // loginATM espera { cuit, clave }.
            const credenciales = { cuit: acceso.loginCuit, clave: acceso.loginClave };
            return await sesionAtmManager.abrirSesion(credenciales);
        } catch (error) {
            console.error('[SesionATM] Error:', error.message);
            return { success: false, error: 'ABRIR_SESION_ERROR', message: error.message };
        }
    });
}

module.exports = setupSesionAtmHandlers;
