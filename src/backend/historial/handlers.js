// historial/handlers.js
// Handlers IPC del dominio Historial (solo LECTURA desde el frontend).
//
// La ESCRITURA no pasa por IPC: la hacen los otros handlers (vep, consultaDeuda,
// etc.) llamando directo a `historialRepo.registrar(...)`. El front solo consulta.

const { historialRepo } = require('./historialRepo.js');

/**
 * Configura los handlers IPC del historial.
 * @param {Electron.IpcMain} ipcMain
 */
function setupHistorialHandlers(ipcMain) {
    // Listar/filtrar entradas. Devuelve siempre un array (nunca lanza al front).
    ipcMain.handle('historial:listar', async (event, filtros) => {
        try {
            return historialRepo.listar(filtros || {});
        } catch (e) {
            console.error('[historial:listar] error:', e.message);
            return [];
        }
    });

    // Busqueda por texto libre (+ filtros opcionales).
    ipcMain.handle('historial:buscar', async (event, { texto, filtros } = {}) => {
        try {
            return historialRepo.buscar(texto, filtros || {});
        } catch (e) {
            console.error('[historial:buscar] error:', e.message);
            return [];
        }
    });
}

module.exports = setupHistorialHandlers;
