// atm/planDePago/handlers.js
// Handlers IPC para el servicio de Plan de Pago de ATM

const { procesarLote } = require('./manager.js');

/**
 * Configura los handlers IPC para Plan de Pago
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 * @param {Electron.BrowserWindow} mainWindow - Ventana principal
 * @param {Electron.App} app - Instancia de la app
 */
function setupPlanDePagoHandlers(ipcMain, mainWindow, app) {

    // Handler para generar planes de pago en lote
    ipcMain.handle('atm:planDePago:generarLote', async (event, datos) => {
        const { usuarios } = datos;
        const downloadsPath = app.getPath('downloads');

        console.log(`[ATM:PlanDePago] Iniciando lote para ${usuarios.length} usuario(s)`);

        // Callback para enviar progreso al frontend
        const enviarProgreso = (mensaje) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('atm:planDePago:update', mensaje);
            }
        };

        try {
            await procesarLote({ usuarios, downloadsPath }, enviarProgreso);
            return { success: true, mensaje: 'Proceso de Plan de Pago iniciado.' };
        } catch (error) {
            console.error('[ATM:PlanDePago] Error:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = setupPlanDePagoHandlers;
