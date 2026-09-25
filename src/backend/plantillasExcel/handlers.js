// plantillasExcel/handlers.js
// Handlers IPC del servicio "Plantillas Excel".
// Ver docs/herramientas_archivos/plantillas_excel.md

const { listarPlantillas } = require('./registroPlantillas.js');
const { procesarArchivo, detectarPlantilla } = require('./plantillasExcelManager.js');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {Electron.BrowserWindow} mainWindow
 * @param {Electron.Dialog} dialog
 */
function setupPlantillasExcelHandlers(ipcMain, mainWindow, dialog) {
    ipcMain.handle('plantillasExcel:listar', async () => {
        try {
            return { success: true, plantillas: listarPlantillas() };
        } catch (error) {
            return { success: false, mensaje: error.message };
        }
    });

    // Abre el administrador de archivos. El filtro por defecto es .xlsx; se deja
    // un segundo filtro .xls para que, si el usuario tiene uno viejo, lo pueda
    // elegir y reciba el mensaje claro de "guardalo como .xlsx" (si no, el archivo
    // simplemente "no aparece" y no se entiende por qué).
    ipcMain.handle('plantillasExcel:elegirArchivo', async () => {
        try {
            const r = await dialog.showOpenDialog(mainWindow, {
                title: 'Elegí el Excel original del cliente',
                properties: ['openFile'],
                filters: [
                    { name: 'Excel (.xlsx)', extensions: ['xlsx'] },
                    { name: 'Excel viejo (.xls, no admitido)', extensions: ['xls'] }
                ]
            });
            if (r.canceled || !r.filePaths || !r.filePaths.length) {
                return { success: false, canceled: true };
            }
            return { success: true, archivo: r.filePaths[0] };
        } catch (error) {
            return { success: false, mensaje: error.message };
        }
    });

    // Orquestador: ¿qué plantilla(s) sirven para este archivo? (ver detectarPlantilla)
    ipcMain.handle('plantillasExcel:detectar', async (event, { archivo } = {}) => {
        try {
            return await detectarPlantilla(archivo);
        } catch (error) {
            console.error('[plantillasExcel:detectar] error:', error);
            return { success: false, mensaje: error.message };
        }
    });

    ipcMain.handle('plantillasExcel:procesar', async (event, { idPlantilla, archivo } = {}) => {
        // procesarArchivo nunca lanza; igual cubrimos cualquier sorpresa.
        try {
            return await procesarArchivo(idPlantilla, archivo);
        } catch (error) {
            console.error('[plantillasExcel:procesar] error:', error);
            return { success: false, mensaje: error.message };
        }
    });
}

module.exports = setupPlantillasExcelHandlers;
