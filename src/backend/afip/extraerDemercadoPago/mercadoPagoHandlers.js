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
            const fs = require('fs');
            const path = require('path');
            // La ruta al servicio ahora es relativa a este mismo directorio
            const archivoServicio = path.join(__dirname, 'leer_procesar_resumen_MercadoPago.js');
            
            if (!fs.existsSync(ruta)) {
                throw new Error(`El archivo PDF no existe en la ruta: ${ruta}`);
            }
            
            const PDFProcessorService = require(archivoServicio);
            const pdfService = new PDFProcessorService();
            const resultado = await pdfService.procesarPDF(ruta);
            return resultado;
        } catch (error) {
            return {
                success: false,
                error: {
                    message: error.message,
                    stack: error.stack,
                    codigo: 'MERCADOPAGO_PDF_ERROR'
                },
                archivo: ruta ? require('path').basename(ruta) : 'desconocido',
                procesadoEn: new Date().toISOString()
            };
        }
    });
}
