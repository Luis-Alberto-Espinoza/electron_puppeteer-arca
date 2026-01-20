// atm/retenciones/handlers.js
// Handlers IPC para el servicio de Descarga de Retenciones de ATM

const { procesarLote } = require('./manager.js');

/**
 * Configura los handlers IPC para Retenciones
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 * @param {Electron.BrowserWindow} mainWindow - Ventana principal
 * @param {Electron.App} app - Instancia de la app
 */
function setupRetencionesHandlers(ipcMain, mainWindow, app) {

    // Handler para descargar retenciones en lote
    ipcMain.handle('atm:retenciones:generarLote', async (event, datos) => {
        const { usuarios } = datos;
        const downloadsPath = app.getPath('downloads');

        console.log(`[ATM:Retenciones] Iniciando lote para ${usuarios.length} usuario(s)`);

        // Callback para enviar progreso al frontend
        const enviarProgreso = (mensaje) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('atm:retenciones:update', mensaje);
            }
        };

        try {
            await procesarLote({ usuarios, downloadsPath }, enviarProgreso);
            return { success: true, mensaje: 'Proceso de Descarga de Retenciones iniciado.' };
        } catch (error) {
            console.error('[ATM:Retenciones] Error:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = setupRetencionesHandlers;
