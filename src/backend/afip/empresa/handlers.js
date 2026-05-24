// afip/empresa/handlers.js
// IPC handlers para operaciones de Empresa (datos del cliente).

const empresaManager = require('./empresaManager.js');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} userStorage
 */
function setupEmpresaHandlers(ipcMain, userStorage) {

    ipcMain.handle('empresa:descubrirPuntosDeVenta', async (event, datos) => {
        console.log('BACKEND: empresa:descubrirPuntosDeVenta recibido');

        try {
            const { usuarioId, razonSocial } = datos || {};

            if (!usuarioId)    return { success: false, error: 'MISSING_USER',    message: 'Falta el id del usuario.' };
            if (!razonSocial)  return { success: false, error: 'MISSING_EMPRESA', message: 'Falta la razón social de la empresa.' };

            return await empresaManager.descubrirPuntosDeVenta(userStorage, usuarioId, razonSocial);

        } catch (error) {
            console.error('BACKEND: Error en empresa:descubrirPuntosDeVenta:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });

    ipcMain.handle('empresa:analizarCliente', async (event, datos) => {
        console.log('BACKEND: empresa:analizarCliente recibido');

        try {
            const { usuarioId } = datos || {};
            if (!usuarioId) return { success: false, error: 'MISSING_USER', message: 'Falta el id del usuario.' };

            return await empresaManager.analizarCliente(userStorage, usuarioId);

        } catch (error) {
            console.error('BACKEND: Error en empresa:analizarCliente:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });

    ipcMain.handle('empresa:analizarEmpresa', async (event, datos) => {
        console.log('BACKEND: empresa:analizarEmpresa recibido');

        try {
            const { usuarioId, razonSocial } = datos || {};
            if (!usuarioId)   return { success: false, error: 'MISSING_USER',    message: 'Falta el id del usuario.' };
            if (!razonSocial) return { success: false, error: 'MISSING_EMPRESA', message: 'Falta la razón social.' };

            return await empresaManager.analizarEmpresa(userStorage, usuarioId, razonSocial);

        } catch (error) {
            console.error('BACKEND: Error en empresa:analizarEmpresa:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });
}

module.exports = setupEmpresaHandlers;
