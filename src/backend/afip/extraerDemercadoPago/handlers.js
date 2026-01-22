const fs = require('fs');
const path = require('path');
const { procesarPDFMercadoPago } = require('./mercadoPagoManager.js');

module.exports = function setupMercadoPagoHandlers(ipcMain, mainWindow, dialog) {
    ipcMain.handle('mercadopago:seleccionar-archivo', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Archivos PDF MercadoPago', extensions: ['pdf'] },
                { name: 'Todos los archivos', extensions: ['*'] }
            ],
            title: 'Seleccionar archivo PDF de MercadoPago'
        });
        return result.canceled ? [] : result.filePaths;
    });

    ipcMain.handle('mercadopago:procesar-archivo', async (event, ruta) => {
        try {
            if (!ruta || ruta.trim() === '') {
                throw new Error('No se recibió una ruta válida para procesar');
            }

            if (!fs.existsSync(ruta)) {
                throw new Error(`El archivo PDF no existe en la ruta: ${ruta}`);
            }

            const resultado = await procesarPDFMercadoPago(ruta);
            return resultado;
        } catch (error) {
            return {
                success: false,
                error: {
                    message: error.message,
                    stack: error.stack,
                    codigo: 'MERCADOPAGO_PDF_ERROR'
                },
                archivo: ruta ? path.basename(ruta) : 'desconocido',
                procesadoEn: new Date().toISOString()
            };
        }
    });
}
