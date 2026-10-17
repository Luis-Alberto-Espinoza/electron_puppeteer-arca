// atm/apremios/handlers.js
// Handlers IPC para Apremios ATM

const { procesarLote } = require('./manager.js');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {Electron.BrowserWindow} mainWindow
 * @param {Electron.App} app
 */
function setupApremiosHandlers(ipcMain, mainWindow, app) {

    // datos: { clientes: [{ id, cuit, nombre, apellido, impuestos: ['automotor', …] }], visible }
    ipcMain.handle('atm:apremios:generarLote', async (event, datos) => {
        const { clientes, visible } = datos || {};
        if (!Array.isArray(clientes) || clientes.length === 0) {
            return { success: false, error: 'SIN_CLIENTES', message: 'No hay clientes seleccionados.' };
        }
        const downloadsPath = app.getPath('downloads');

        console.log(`[ATM:Apremios] Iniciando lote para ${clientes.length} cliente(s)`);

        const enviarProgreso = (mensaje) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('atm:apremios:update', mensaje);
            }
        };

        try {
            await procesarLote({ clientes, downloadsPath, visible }, enviarProgreso);
            return { success: true, mensaje: 'Apremios ATM finalizado.' };
        } catch (error) {
            console.error('[ATM:Apremios] Error:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });
}

module.exports = setupApremiosHandlers;
