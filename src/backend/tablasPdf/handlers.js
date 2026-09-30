// tablasPdf/handlers.js — IPC del servicio "Extraer Tablas PDF".
//
// El motor (./motor/) es una copia EXACTA del proyecto hermano tablas_pdf_a_csv,
// que es la fuente de verdad: NO editar nada adentro de motor/, actualizar =
// reemplazar la carpeta entera. Este archivo vive FUERA de motor/ para que una
// copia nueva no lo pise. Ver docs/herramientas_archivos/migracion_tablas_pdf.md.
//
// Los canales tienen los mismos nombres que en el hermano (su src/backend/main.js)
// para que su frontend casi no cambie. Abrir el Excel generado reusa el canal
// 'abrir-archivo' que ya existe en home/main.js (el hermano lo llama
// 'shell:abrir-archivo').
//
// Diferencia con el hermano: NO se pasa projectRoot al motor. El motor ubica el
// worker y las fuentes de pdfjs con require.resolve, que anda en dev y empaquetado.

const { convertirPdfAExcel } = require('./convertirPdfAExcel.js');
const { processBatch } = require('./motor/utils/batchProcessor.js');

function setupTablasPdfHandlers(ipcMain, mainWindow, dialog) {
    ipcMain.handle('extraerTablasPDF:seleccionar-archivo', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'Archivos PDF', extensions: ['pdf'] }],
            title: 'Seleccionar archivo PDF para extraer tablas'
        });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('extraerTablasPDF:procesar-archivo', async (event, filePath) => {
        console.log(`[tablasPdf] Procesando: ${filePath}`);
        try {
            const { rutaExcel } = await convertirPdfAExcel(filePath);
            return { exito: true, rutaExcel };
        } catch (error) {
            console.error(`[tablasPdf] Fallo en 'procesar-archivo': ${error.message}`);
            throw error;
        }
    });

    ipcMain.handle('extraerTablasPDF:seleccionar-carpeta', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Seleccionar carpeta con PDFs'
        });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('extraerTablasPDF:procesar-carpeta', async (event, folderPath) => {
        console.log(`[tablasPdf] Procesando carpeta: ${folderPath}`);
        try {
            return await processBatch(folderPath);
        } catch (error) {
            console.error(`[tablasPdf] Fallo en 'procesar-carpeta': ${error.message}`);
            throw error;
        }
    });
}

module.exports = setupTablasPdfHandlers;
