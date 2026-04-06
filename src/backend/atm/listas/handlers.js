// atm/listas/handlers.js
// Handlers IPC para el CRUD de listas de clientes ATM

const { ListasATMStorage } = require('./storage_listas.js');

function setupListasATMHandlers(ipcMain) {
    const storage = new ListasATMStorage();

    // Obtener todas las listas de un subservicio
    ipcMain.handle('atm:listas:get', async (_event, subservicio) => {
        try {
            const listas = storage.getListas(subservicio);
            return { exito: true, listas };
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });

    // Crear o sobreescribir una lista
    ipcMain.handle('atm:listas:guardar', async (_event, { subservicio, nombre, texto, clienteIds }) => {
        try {
            return storage.guardarLista(subservicio, nombre, texto, clienteIds);
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });

    // Renombrar una lista
    ipcMain.handle('atm:listas:renombrar', async (_event, { subservicio, nombreActual, nombreNuevo }) => {
        try {
            return storage.renombrarLista(subservicio, nombreActual, nombreNuevo);
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });

    // Eliminar una lista
    ipcMain.handle('atm:listas:eliminar', async (_event, { subservicio, nombre }) => {
        try {
            return storage.eliminarLista(subservicio, nombre);
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });
}

module.exports = setupListasATMHandlers;
