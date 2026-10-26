// comun/cancelarAutomatizacionHandlers.js
// "⏹ Cancelar" del lanzador (componentes/lanzadorAutomatizacion): un solo canal para todos
// los servicios. Cierra el navegador que está corriendo; cada servicio recibe
// { success:false, error:'CANCELADO', message:'Cancelado por el usuario' } de puppeteer-manager.

const puppeteerManager = require('../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');

function setupCancelarAutomatizacionHandlers(ipcMain) {
    ipcMain.handle('automatizacion:cancelar', async () => {
        const cerrados = await puppeteerManager.cancelar();
        return { success: true, cerrados };
    });
}

module.exports = setupCancelarAutomatizacionHandlers;
