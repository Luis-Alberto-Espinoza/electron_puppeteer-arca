// afip/empresa/handlers.js
// IPC handlers para operaciones de Empresa (datos del cliente).

const empresaManager = require('./empresaManager.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');

/**
 * @param {Electron.IpcMain} ipcMain
 */
function setupEmpresaHandlers(ipcMain) {

    // Modelo plano: analiza UN contribuyente y guarda sus PDV en contribuyentes.json
    // (login por resolverAcceso).
    ipcMain.handle('empresa:analizarContribuyente', async (event, datos) => {
        console.log('BACKEND: empresa:analizarContribuyente recibido');
        try {
            const { cuit } = datos || {};
            if (!cuit) return { success: false, error: 'MISSING_CUIT', message: 'Falta el CUIT del contribuyente.' };

            const repo = getContribuyenteRepo();
            return await empresaManager.analizarContribuyente(repo, cuit);
        } catch (error) {
            console.error('BACKEND: Error en empresa:analizarContribuyente:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });

    // Análisis por LOTE: un login por credencial (no por contribuyente). Emite
    // progreso por grupo a la ventana que lo pidió.
    ipcMain.handle('empresa:analizarLote', async (event, datos) => {
        console.log('BACKEND: empresa:analizarLote recibido');
        try {
            const { cuits } = datos || {};
            if (!Array.isArray(cuits) || cuits.length === 0) {
                return { success: false, error: 'MISSING_CUITS', message: 'No se recibieron contribuyentes para analizar.' };
            }

            const repo = getContribuyenteRepo();
            const onProgreso = (p) => {
                // event.sender: la ventana que invocó (no un mainWindow global).
                try { event.sender.send('empresa:analizarLote:progreso', p); } catch (_) { /* ventana cerrada */ }
            };

            return await empresaManager.analizarLote(repo, cuits, onProgreso);
        } catch (error) {
            console.error('BACKEND: Error en empresa:analizarLote:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });
}

module.exports = setupEmpresaHandlers;
