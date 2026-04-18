// afip/planesDePago/handlers_listas.js
// Handlers IPC para el CRUD de listas persistentes - Planes de Pago

const { ListasPlanesPagoStorage } = require('./storage_listas_planes.js');

function setupListasPlanesPagoHandlers(ipcMain) {
    const storage = new ListasPlanesPagoStorage();

    // Obtener todas las listas
    ipcMain.handle('planesDePago:listas:get', async () => {
        try {
            const listas = storage.getListas();
            return { exito: true, listas };
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });

    // Crear o sobreescribir una lista
    ipcMain.handle('planesDePago:listas:guardar', async (_event, { nombre, texto, representantes }) => {
        try {
            return storage.guardarLista(nombre, texto, representantes);
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });

    // Renombrar una lista
    ipcMain.handle('planesDePago:listas:renombrar', async (_event, { nombreActual, nombreNuevo }) => {
        try {
            return storage.renombrarLista(nombreActual, nombreNuevo);
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });

    // Eliminar una lista
    ipcMain.handle('planesDePago:listas:eliminar', async (_event, { nombre }) => {
        try {
            return storage.eliminarLista(nombre);
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });
}

module.exports = setupListasPlanesPagoHandlers;
