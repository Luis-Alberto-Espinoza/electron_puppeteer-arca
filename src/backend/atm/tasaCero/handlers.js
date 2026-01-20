// atm/tasaCero/handlers.js
// Handlers IPC para el servicio de Tasa Cero de ATM

const { procesarLote } = require('./manager.js');

/**
 * Configura los handlers IPC para Tasa Cero
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 * @param {Electron.BrowserWindow} mainWindow - Ventana principal
 * @param {Electron.App} app - Instancia de la app
 */
function setupTasaCeroHandlers(ipcMain, mainWindow, app) {

    // Handler para generar comprobantes de Tasa Cero en lote
    ipcMain.handle('atm:tasaCero:generarLote', async (event, datos) => {
        const { clientes } = datos;
        const downloadsPath = app.getPath('downloads');

        console.log(`[ATM:TasaCero] Iniciando lote para ${clientes.length} cliente(s)`);

        // Callback para enviar progreso al frontend
        const enviarProgreso = (mensaje) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('atm:tasaCero:update', mensaje);
            }
        };

        try {
            await procesarLote({ clientes, downloadsPath }, enviarProgreso);
            return { exito: true, mensaje: 'Proceso de Tasa Cero iniciado.' };
        } catch (error) {
            console.error('[ATM:TasaCero] Error:', error);
            return { exito: false, error: error.message };
        }
    });
}

module.exports = setupTasaCeroHandlers;
