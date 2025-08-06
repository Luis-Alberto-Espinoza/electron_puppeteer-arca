module.exports = function setupUserHandlers(ipcMain, userStorage, mainWindow, dialog) {
    ipcMain.handle('user:create', async (event, userData) => {
        try {
            const data = userStorage.loadData();
            const existingUser = data.users.find(user => user.nombre === userData.nombre);
            if (existingUser) {
                return { success: false, error: 'El usuario ya existe' };
            }

            const newUser = {
                id: userStorage.generateId(),
                nombre: userData.nombre || null,
                apellido: userData.apellido || null,
                cuit: userData.cuit || null,
                cuil: userData.cuil || null,
                tipoContribuyente: userData.tipoContribuyente || null,
                clave: userData.clave,
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
            console.log('Recibiendo actualización:', updatedUser); // Debug
            
            const data = userStorage.loadData();
            console.log('Datos actuales:', data); // Debug
            
            const index = data.users.findIndex(user => String(user.id) === String(updatedUser.id));
            console.log('Usuario encontrado en índice:', index); // Debug
            
            if (index === -1) {
                console.log('Usuario no encontrado:', updatedUser.id); // Debug
                return { success: false, error: 'Usuario no encontrado' };
            }

            data.users[index] = {
                ...data.users[index],
                nombre: updatedUser.nombre,
                apellido: updatedUser.apellido,
                cuit: updatedUser.cuit,
                cuil: updatedUser.cuil,
                tipoContribuyente: updatedUser.tipoContribuyente,
                clave: updatedUser.clave,
                fechaModificacion: new Date().toISOString()
            };

            const saveResult = userStorage.saveData(data);
            console.log('Resultado de guardado:', saveResult); // Debug

            return saveResult
                ? { success: true, user: data.users[index] }
                : { success: false, error: 'Error al guardar' };
        } catch (error) {
            console.error('Error en update:', error); // Debug
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('user:delete', async (event, userId) => {
        try {
            console.log('Intentando eliminar usuario:', userId); // Debug
            
            const data = userStorage.loadData();
            const index = data.users.findIndex(user => String(user.id) === String(userId));
            
            console.log('Usuario encontrado en índice:', index); // Debug

            if (index === -1) {
                console.log('Usuario no encontrado:', userId); // Debug
                return { success: false, error: 'Usuario no encontrado' };
            }

            const deletedUser = data.users.splice(index, 1)[0];
            const saveResult = userStorage.saveData(data);
            
            console.log('Usuario eliminado:', deletedUser); // Debug
            console.log('Resultado de guardado:', saveResult); // Debug

            return saveResult
                ? { success: true, user: deletedUser }
                : { success: false, error: 'Error al guardar' };
        } catch (error) {
            console.error('Error en delete:', error); // Debug
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
                { name: 'Archivos PDF MercadoPago', extensions: ['pdf'] }, // Solo PDFs
                { name: 'Todos los archivos', extensions: ['*'] }
            ],
            title: 'Seleccionar archivo PDF de MercadoPago'
        });
        return result.canceled ? [] : result.filePaths;
    });

    ipcMain.handle('mercadopago:procesar-archivo', async (event, ruta) => {
        try {
            if (!ruta || ruta.trim() === '') {
                console.error('Ruta inválida detectada en handler');
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
            console.error('=== ERROR EN PROCESAMIENTO MERCADOPAGO ===');
            console.error('Error completo:', error);
            console.error('Stack:', error.stack);
            console.error('=== FIN ERROR ===');

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
