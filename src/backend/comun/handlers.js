// comun/handlers.js — IPC de la carpeta de datos (Fase 2).
//
// Deja al frontend: ver dónde viven los .json, abrir esa carpeta, elegir otra
// (o volver al valor por defecto) y reiniciar para aplicar el cambio.
//
// Por qué reiniciar en vez de recargar en caliente: los stores (JsonStorage,
// contribuyenteStore, etc.) resuelven su ruta una sola vez y quedan atados a ella.
// Un relaunch los re-crea contra la carpeta nueva; es más simple y seguro que
// invalidar cachés y re-instanciar singletons por todos lados.

const { shell } = require('electron');
const { getInfoDatos, getCarpetaDatos, setCarpetaDatos } = require('./rutasDatos.js');

function setupDatosHandlers(ipcMain, app, dialog) {
    ipcMain.handle('datos:getInfo', async () => getInfoDatos());

    ipcMain.handle('datos:abrirCarpeta', async () => {
        try {
            await shell.openPath(getCarpetaDatos());
            return { ok: true };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    });

    ipcMain.handle('datos:elegirCarpeta', async () => {
        const r = await dialog.showOpenDialog({
            title: 'Elegí la carpeta donde guardar los datos',
            properties: ['openDirectory', 'createDirectory'],
        });
        if (r.canceled || !r.filePaths.length) return { ok: false, cancelado: true };
        return { ok: true, carpeta: r.filePaths[0] };
    });

    // ruta === null → borra el override y vuelve al valor por defecto.
    ipcMain.handle('datos:setCarpeta', async (_e, ruta) => setCarpetaDatos(ruta ?? null));

    ipcMain.handle('datos:reiniciar', async () => {
        app.relaunch();
        app.exit(0);
    });
}

module.exports = setupDatosHandlers;
