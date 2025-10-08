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
                fechaCreacion: new Date().toISOString(),
                estado_afip: userData.claveAFIP ? 'pendiente' : 'no_aplica',
                estado_atm: userData.claveATM ? 'pendiente' : 'no_aplica',
                fechaVerificacion: null
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

    ipcMain.handle('user:get-by-id', async (event, userId) => {
        try {
            const data = userStorage.loadData();
            const user = data.users.find(u => String(u.id) === String(userId));
            if (user) {
                return { success: true, user };
            } else {
                return { success: false, error: 'Usuario no encontrado' };
            }
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

            const originalUser = data.users[index];

            // Mantener los datos existentes y sobreescribir con los nuevos
            const userToUpdate = {
                ...originalUser,
                nombre: updatedUser.nombre,
                apellido: updatedUser.apellido,
                cuit: updatedUser.cuit,
                cuil: updatedUser.cuil,
                tipoContribuyente: updatedUser.tipoContribuyente,
                claveAFIP: updatedUser.claveAFIP,
                claveATM: updatedUser.claveATM,
                fechaModificacion: new Date().toISOString()
            };

            // Si la clave AFIP cambió, resetear su estado de validación
            if (updatedUser.claveAFIP !== originalUser.claveAFIP) {
                userToUpdate.estado_afip = updatedUser.claveAFIP ? 'pendiente' : 'no_aplica';
            }

            // Si la clave ATM cambió, resetear su estado de validación
            if (updatedUser.claveATM !== originalUser.claveATM) {
                userToUpdate.estado_atm = updatedUser.claveATM ? 'pendiente' : 'no_aplica';
            }

            data.users[index] = userToUpdate;

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



    const { gestionarValidacion } = require('../puppeteer/verificacionManager.js');
    const { launchBrowserAndPage } = require('../puppeteer/browserLauncher.js');

    const { ejecutar_verificacionCredenciales } = require('../puppeteer/verificaCredenciales/flujo_verificaCredenciales');

    ipcMain.handle('user:verify-on-create', async (event, credenciales) => {
        console.log('[Verificación Manual] Iniciando para CUIT:', credenciales.cuit);
        try {
            const resultado = await ejecutar_verificacionCredenciales(credenciales);
            console.log('[Verificación Manual] Verificación completada. Resultado:', resultado);
            return resultado;
        } catch (error) {
            console.error('[Verificación Manual] Error catastrófico:', error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('user:verify-credentials', async (event, { verificationJobs }) => {
        if (!verificationJobs || verificationJobs.length === 0) {
            return { success: false, error: 'No se proporcionaron trabajos de verificación.' };
        }

        const data = userStorage.loadData();
        const stats = { validados: 0, con_fallos: 0, no_encontrados: 0 };
        const updatedUsers = []; // Array para recolectar usuarios actualizados
        let browser;

        // Agrupar trabajos por usuario
        const jobsByUser = verificationJobs.reduce((acc, job) => {
            if (!acc[job.userId]) {
                acc[job.userId] = [];
            }
            acc[job.userId].push(job.service);
            return acc;
        }, {});

        try {
            const { browser: launchedBrowser } = await launchBrowserAndPage({ headless: true });
            browser = launchedBrowser;

            for (const [userId, servicesToVerify] of Object.entries(jobsByUser)) {
                const userIndex = data.users.findIndex(u => String(u.id) === String(userId));
                if (userIndex === -1) {
                    stats.no_encontrados++;
                    continue;
                }
                
                const usuario = data.users[userIndex];

                if (!usuario.cuit) {
                    console.error(`Usuario con ID ${userId} (${usuario.nombre}) no tiene CUIT. Omitiendo verificación.`);
                    stats.con_fallos++;
                    continue;
                }
                
                // Llama a la función de validación modular
                await gestionarValidacion(browser, usuario, servicesToVerify);

                // Traducir resultados a los nuevos estados
                if (servicesToVerify.includes('afip')) {
                    if (usuario.claveAfipValida) {
                        usuario.estado_afip = 'validado';
                    } else if (usuario.claveAfipRequiereActualizacion) {
                        usuario.estado_afip = 'requiere_actualizacion';
                    } else {
                        usuario.estado_afip = 'invalido';
                    }
                }

                if (servicesToVerify.includes('atm')) {
                    if (usuario.claveAtmValida) {
                        usuario.estado_atm = 'validado';
                    } else if (usuario.claveAtmRequiereActualizacion) {
                        usuario.estado_atm = 'requiere_actualizacion';
                    } else if (usuario.claveAtmInvalida) {
                        usuario.estado_atm = 'invalido';
                    } else {
                        usuario.estado_atm = 'error_desconocido';
                    }
                }
                
                usuario.fechaVerificacion = new Date().toISOString();
                data.users[userIndex] = usuario;
                updatedUsers.push(usuario);

                // Actualizar estadísticas (simplificado)
                if (usuario.claveAfipValida || usuario.claveAtmValida) {
                    stats.validados++;
                } else {
                    stats.con_fallos++;
                }
            }

            userStorage.saveData(data);
            return { success: true, stats, updatedUsers };

        } catch (error) {
            console.error('Error en el proceso de verificación masiva:', error);
            return { success: false, error: error.message, stats };
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    });
}