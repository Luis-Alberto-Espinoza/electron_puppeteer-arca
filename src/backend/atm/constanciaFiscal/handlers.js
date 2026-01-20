// atm/constanciaFiscal/handlers.js
// Handlers IPC para el servicio de Constancia Fiscal de ATM

const { procesarLote } = require('./manager.js');

/**
 * Configura los handlers IPC para Constancia Fiscal
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 * @param {Electron.BrowserWindow} mainWindow - Ventana principal
 * @param {Electron.App} app - Instancia de la app
 */
function setupConstanciaFiscalHandlers(ipcMain, mainWindow, app) {

    // Handler para generar constancias fiscales en lote
    ipcMain.handle('atm:constanciaFiscal:generarLote', async (event, datos) => {
        const { usuarios } = datos;
        const downloadsPath = app.getPath('downloads');

        console.log(`[ATM:ConstanciaFiscal] Iniciando lote para ${usuarios.length} usuario(s)`);

        // Callback para enviar progreso al frontend
        const enviarProgreso = (mensaje) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('atm:constanciaFiscal:update', mensaje);
            }
        };

        try {
            await procesarLote({ usuarios, downloadsPath }, enviarProgreso);
            return { success: true, mensaje: 'Proceso de Constancia Fiscal iniciado.' };
        } catch (error) {
            console.error('[ATM:ConstanciaFiscal] Error:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = setupConstanciaFiscalHandlers;
