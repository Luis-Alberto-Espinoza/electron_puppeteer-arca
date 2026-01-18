// afip/libroIVA/handlers.js
// Handlers IPC para el dominio de Libro IVA

const { comunicacionConLibroIVA } = require('../../index.js');

/**
 * Configura los handlers IPC para el dominio de Libro IVA
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 */
function setupLibroIvaHandlers(ipcMain) {

    // ========================================
    // HANDLER: procesar-libro-iva
    // Procesa el libro IVA
    // ========================================
    ipcMain.on('procesar-libro-iva', async (event, data) => {
        try {
            const resultado = await comunicacionConLibroIVA(data);
            event.reply('libro-iva-procesado', { success: true, message: 'Libro IVA procesado correctamente', data: resultado });
        } catch (error) {
            console.error("Error al procesar el libro IVA:", error);
            event.reply('libro-iva-procesado', { success: false, error: error.message });
        }
    });

    // ========================================
    // HANDLER: actualizar-segun-informe
    // Actualiza el libro IVA segun informe
    // ========================================
    ipcMain.on('actualizar-segun-informe', async (event, data) => {
        try {
            const resultado = await comunicacionConLibroIVA(data);
            event.reply('libro-iva-actualizado', { success: true, message: 'Libro IVA actualizado correctamente', data: resultado });
        } catch (error) {
            console.error("Error al procesar el libro IVA:", error);
            event.reply('libro-iva-actualizado', { success: false, error: error.message });
        }
    });

    // ========================================
    // HANDLER: numero-eliminar
    // Elimina numeros del libro IVA
    // ========================================
    ipcMain.on('numero-eliminar', async (event, data) => {
        try {
            const resultado = await comunicacionConLibroIVA(data);
            event.reply('resultado-numero-eliminar', { success: true, resultado });
        } catch (error) {
            console.error('Error al procesar el numero:', error);
            event.reply('resultado-numero-eliminar', { success: false, error: error.message });
        }
    });
}

module.exports = setupLibroIvaHandlers;
