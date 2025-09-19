module.exports = function setupUserHandlers(ipcMain, userStorage, mainWindow, dialog) {
    ipcMain.handle('user:create', async (event, userData) => {
        try {
            const data = userStorage.loadData();
            const existingUser = data.users.find(user =>
                (user.cuit && user.cuit === userData.cuit && user.cuit !== null && user.cuit !== '') ||
                (user.cuil && user.cuil === userData.cuil && user.cuil !== null && user.cuil !== '')
            );
            if (existingUser) {
                return { success: false, error: 'Ya existe un usuario con ese CUIT o CUIL' };
            }

            const newUser = {
                id: userStorage.generateId(),
                nombre: userData.nombre || null,
                apellido: userData.apellido || null,
                cuit: userData.cuit || null,
                cuil: userData.cuil || null,
                tipoContribuyente: userData.tipoContribuyente || null,
                claveAFIP: userData.claveAFIP,
                claveATM: userData.claveATM,
                empresasDisponible: userData.empresasDisponible || [],
                fechaCreacion: new Date().toISOString()
            };

            data.users.push(newUser);
            return userStorage.saveData(data)
                ? { success: true, user: newUser }
                : { success: false, error: 'Error al guardar' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('user:getAll', async () => {
        try {
            const data = userStorage.loadData();
            return { success: true, users: data.users };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('user:update', async (event, updatedUser) => {
        try {
            const data = userStorage.loadData();
            const index = data.users.findIndex(user => String(user.id) === String(updatedUser.id));
            
            if (index === -1) {
                return { success: false, error: 'Usuario no encontrado' };
            }

            // Mantener los datos existentes y sobreescribir con los nuevos
            data.users[index] = {
                ...data.users[index],
                nombre: updatedUser.nombre,
                apellido: updatedUser.apellido,
                cuit: updatedUser.cuit,
                cuil: updatedUser.cuil,
                tipoContribuyente: updatedUser.tipoContribuyente,
                claveAFIP: updatedUser.claveAFIP,
                claveATM: updatedUser.claveATM,
                fechaModificacion: new Date().toISOString()
            };

            const saveResult = userStorage.saveData(data);

            return saveResult
                ? { success: true, user: data.users[index] }
                : { success: false, error: 'Error al guardar' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('user:delete', async (event, userId) => {
        try {
            const data = userStorage.loadData();
            const index = data.users.findIndex(user => String(user.id) === String(userId));

            if (index === -1) {
                return { success: false, error: 'Usuario no encontrado' };
            }

            const deletedUser = data.users.splice(index, 1)[0];
            const saveResult = userStorage.saveData(data);

            return saveResult
                ? { success: true, user: deletedUser }
                : { success: false, error: 'Error al guardar' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('seleccionar-archivos', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        return result.filePaths;
    });

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
            const archivoServicio = path.join(__dirname, '..', 'extraerDemercadoPago', 'leer_procesar_resumen_MercadoPago.js');
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

    const { ejecutar_verificacionCredenciales } = require('../puppeteer/verificaCredenciales/flujo_verificaCredenciales');

    ipcMain.handle('user:verifyAndUpdate', async (event, updatedUser) => {
        try {
            const credenciales = {
                claveAFIP: updatedUser.claveAFIP,
                cuit: updatedUser.cuit,
                cuil: updatedUser.cuil
            };
            const verificacion = await ejecutar_verificacionCredenciales(credenciales);

            if (!verificacion.success) {
                return { success: false, error: 'Credenciales inválidas o error en verificación' };
            }

            const data = userStorage.loadData();
            const index = data.users.findIndex(user => String(user.id) === String(updatedUser.id));
            if (index === -1) {
                return { success: false, error: 'Usuario no encontrado' };
            }

            data.users[index] = {
                ...data.users[index],
                nombre: updatedUser.nombre,
                apellido: updatedUser.apellido,
                cuit: updatedUser.cuit,
                cuil: updatedUser.cuil,
                tipoContribuyente: updatedUser.tipoContribuyente,
                claveAFIP: updatedUser.claveAFIP,
                claveATM: updatedUser.claveATM,
                empresasDisponible: verificacion.puntosDeVentaArray || [],
                fechaModificacion: new Date().toISOString()
            };

            const saveResult = userStorage.saveData(data);
            return saveResult
                ? { success: true, user: data.users[index] }
                : { success: false, error: 'Error al guardar' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });
}