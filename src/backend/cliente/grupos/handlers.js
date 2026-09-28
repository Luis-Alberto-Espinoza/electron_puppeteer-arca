// grupos/handlers.js — IPC del registro de estudios/grupos.
//
// Cablea gruposManager (administra grupos.json) con el contribuyenteRepo (para el
// cascade al borrar). Ver docs/modelo_cliente/plan_grupos_estudios.

const { gruposManager } = require('./gruposManager.js');
const { getContribuyenteRepo } = require('../contribuyenteStore.js');

function setupGruposHandlers(ipcMain) {
    const repo = getContribuyenteRepo();

    ipcMain.handle('grupos:listar', async () => {
        try {
            return { success: true, grupos: gruposManager.listar() };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('grupos:crear', async (event, { nombre, color } = {}) => {
        try {
            return { success: true, grupo: gruposManager.crear({ nombre, color }) };
        } catch (error) {
            return { success: false, error: error.message, code: error.code || null };
        }
    });

    ipcMain.handle('grupos:renombrar', async (event, { id, nombre, color } = {}) => {
        try {
            return { success: true, grupo: gruposManager.renombrar({ id, nombre, color }) };
        } catch (error) {
            return { success: false, error: error.message, code: error.code || null };
        }
    });

    // Borra el grupo del registro y limpia grupoId en todos sus miembros (quedan
    // "sin estudio"). Nunca borra clientes. Devuelve cuántos quedaron sin grupo.
    ipcMain.handle('grupos:eliminar', async (event, { id } = {}) => {
        try {
            const eliminado = gruposManager.eliminar(id);
            if (!eliminado) return { success: false, error: 'No existe ese estudio.' };
            const { cambiados } = await repo.desasignarGrupo(id);
            return { success: true, grupo: eliminado, clientesLiberados: cambiados };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}

module.exports = setupGruposHandlers;
