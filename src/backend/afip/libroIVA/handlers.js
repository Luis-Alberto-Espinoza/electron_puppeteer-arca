// afip/libroIVA/handlers.js
// Handlers IPC para el dominio de Libro IVA

const { procesarLibroIva } = require('./libroIvaManager.js');

/**
 * Configura los handlers IPC para el dominio de Libro IVA
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 */
function setupLibroIvaHandlers(ipcMain) {

    // ========================================
    // HANDLER: procesar-libro-iva
    // Procesa el libro IVA (generar informe, modificar, eliminar)
    // ========================================
    ipcMain.on('procesar-libro-iva', async (event, data) => {
        try {
            const resultado = procesarLibroIva(data);
            event.reply('libro-iva-procesado', {
                success: true,
                message: 'Libro IVA procesado correctamente',
                data: resultado
            });
        } catch (error) {
            console.error("[LibroIVA Handler] Error al procesar:", error);
            event.reply('libro-iva-procesado', {
                success: false,
                error: error.message
            });
        }
    });

    // ========================================
    // HANDLER: actualizar-segun-informe
    // Actualiza el libro IVA segun informe previo
    // ========================================
    ipcMain.on('actualizar-segun-informe', async (event, data) => {
        try {
            const resultado = procesarLibroIva({ ...data, case: 'modificarSegunInforme' });
            event.reply('libro-iva-actualizado', {
                success: true,
                message: 'Libro IVA actualizado correctamente',
                data: resultado
            });
        } catch (error) {
            console.error("[LibroIVA Handler] Error al actualizar:", error);
            event.reply('libro-iva-actualizado', {
                success: false,
                error: error.message
            });
        }
    });

    // ========================================
    // HANDLER: numero-eliminar
    // Elimina lineas anteriores del libro IVA
    // ========================================
    ipcMain.on('numero-eliminar', async (event, data) => {
        try {
            const resultado = procesarLibroIva({ ...data, case: 'eliminarAnteriores' });
            event.reply('resultado-numero-eliminar', {
                success: true,
                resultado
            });
        } catch (error) {
            console.error('[LibroIVA Handler] Error al eliminar:', error);
            event.reply('resultado-numero-eliminar', {
                success: false,
                error: error.message
            });
        }
    });
}

module.exports = setupLibroIvaHandlers;
