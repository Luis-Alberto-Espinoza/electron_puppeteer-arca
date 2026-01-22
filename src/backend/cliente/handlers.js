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

            // Determinar estado de verificación AFIP
            let estadoAFIP = 'no_aplica';
            if (userData.claveAFIP) {
                // Si fue verificado previamente, usar estado 'validado'
                if (userData.verificadoAFIP === true) {
                    estadoAFIP = 'validado';
                } else {
                    estadoAFIP = 'pendiente';
                }
            }

            // Determinar estado de verificación ATM
            let estadoATM = 'no_aplica';
            if (userData.claveATM) {
                // Si fue verificado previamente, usar estado 'validado'
                if (userData.verificadoATM === true) {
                    estadoATM = 'validado';
                } else {
                    estadoATM = 'pendiente';
                }
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
                cuitAsociados: userData.cuitAsociados || [],
                fechaCreacion: new Date().toISOString(),
                estado_afip: estadoAFIP,
                estado_atm: estadoATM,
                fechaVerificacion: (userData.verificadoAFIP || userData.verificadoATM) ? new Date().toISOString() : null
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



    const { gestionarValidacion } = require('./service/verificacion.js');
    const { launchBrowserAndPage } = require('../puppeteer/archivos_comunes/navegador/browserLauncher.js');

    const verificarYObtenerDatosAFIP = require('../puppeteer/verificaCredenciales/flujo_verificaCredenciales_AFIP.js');
    const verificarCredencialesATM = require('../puppeteer/atm/flujosDeTareas/flujo_verificaCredenciales_atm.js');

    ipcMain.handle('user:verify-on-create', async (event, credenciales) => {
        console.log('[Verificación Manual] Iniciando para CUIT:', credenciales.cuit || credenciales.cuil);

        let browser;

        try {
            // Crear un usuario temporal para verificar (sin guardarlo)
            const tempUser = {
                id: 'temp_' + Date.now(),
                nombre: credenciales.nombre || 'Verificación Temporal',
                cuit: credenciales.cuit || null,
                cuil: credenciales.cuil || null,
                claveAFIP: credenciales.claveAFIP || null,
                claveATM: credenciales.claveATM || null,
                tipoContribuyente: credenciales.tipoContribuyente || null
            };

            // Guardar usuario temporal
            const data = userStorage.loadData();
            data.users.push(tempUser);
            userStorage.saveData(data);

            // Preparar jobs de verificación
            const verificationJobs = [];
            if (credenciales.claveAFIP) {
                verificationJobs.push({ userId: tempUser.id, service: 'afip' });
            }
            if (credenciales.claveATM) {
                verificationJobs.push({ userId: tempUser.id, service: 'atm' });
            }

            // Llamar a la verificación unificada (UNA SOLA VEZ)
            console.log('[Verificación Manual] Llamando a verificación unificada...');
            const result = await new Promise(async (resolve) => {
                try {
                    // ✅ ABRIR NAVEGADOR UNA SOLA VEZ
                    const { browser: launchedBrowser } = await launchBrowserAndPage({ headless: false });
                    browser = launchedBrowser;

                    const userIndex = data.users.findIndex(u => String(u.id) === String(tempUser.id));
                    const usuario = data.users[userIndex];
                    const servicesToVerify = verificationJobs.map(j => j.service);

                    // ✅ VALIDAR UNA SOLA VEZ (obtiene puntos de venta automáticamente)
                    await gestionarValidacion(browser, usuario, servicesToVerify);

                    // ✅ Obtener puntos de venta y CUITs del usuario validado
                    const empresasDisponible = usuario.puntosDeVenta || [];
                    const cuitAsociados = usuario.cuitAsociados || [];

                    console.log('[Verificación Manual] Empresas disponibles obtenidas:', empresasDisponible);
                    if (cuitAsociados.length > 0) {
                        console.log('[Verificación Manual] CUITs asociados obtenidos:', cuitAsociados);
                    }

                    // Traducir resultados
                    const finalResult = {
                        success: false,
                        empresasDisponible,
                        cuitAsociados,
                        error: null,
                        verificaciones: {
                            afip: { intentado: false, exitoso: false, error: null },
                            atm: { intentado: false, exitoso: false, error: null }
                        }
                    };

                    if (servicesToVerify.includes('afip')) {
                        finalResult.verificaciones.afip.intentado = true;
                        if (usuario.claveAfipValida) {
                            finalResult.verificaciones.afip.exitoso = true;
                            finalResult.success = true;
                        } else {
                            finalResult.verificaciones.afip.error = usuario.errorAfip || 'Credenciales AFIP inválidas';
                        }
                    }

                    if (servicesToVerify.includes('atm')) {
                        finalResult.verificaciones.atm.intentado = true;
                        if (usuario.claveAtmValida) {
                            finalResult.verificaciones.atm.exitoso = true;
                            finalResult.success = true;
                        } else {
                            finalResult.verificaciones.atm.error = usuario.errorAtm || 'Credenciales ATM inválidas';
                        }
                    }

                    // Construir mensaje de error consolidado
                    const errores = [];
                    if (finalResult.verificaciones.afip.intentado && !finalResult.verificaciones.afip.exitoso) {
                        errores.push(`AFIP: ${finalResult.verificaciones.afip.error}`);
                    }
                    if (finalResult.verificaciones.atm.intentado && !finalResult.verificaciones.atm.exitoso) {
                        errores.push(`ATM: ${finalResult.verificaciones.atm.error}`);
                    }
                    if (errores.length > 0) {
                        finalResult.error = errores.join(' | ');
                    }

                    resolve(finalResult);
                } catch (error) {
                    console.error('[Verificación Manual] Error:', error);
                    resolve({
                        success: false,
                        error: error.message,
                        empresasDisponible: [],
                        cuitAsociados: [],
                        verificaciones: {
                            afip: { intentado: !!credenciales.claveAFIP, exitoso: false, error: error.message },
                            atm: { intentado: !!credenciales.claveATM, exitoso: false, error: error.message }
                        }
                    });
                } finally {
                    if (browser) {
                        await browser.close();
                        browser = null;
                    }
                }
            });

            // Eliminar usuario temporal
            const updatedData = userStorage.loadData();
            updatedData.users = updatedData.users.filter(u => String(u.id) !== String(tempUser.id));
            userStorage.saveData(updatedData);

            console.log('[Verificación Manual] Verificación completada. Resultado:', result);
            return result;

        } catch (error) {
            console.error('[Verificación Manual] Error catastrófico:', error);

            // Limpiar usuario temporal en caso de error
            try {
                const updatedData = userStorage.loadData();
                updatedData.users = updatedData.users.filter(u => !String(u.id).startsWith('temp_'));
                userStorage.saveData(updatedData);
            } catch (cleanupError) {
                console.error('[Verificación Manual] Error al limpiar usuario temporal:', cleanupError);
            }

            return {
                success: false,
                error: error.message,
                empresasDisponible: [],
                cuitAsociados: [],
                verificaciones: {
                    afip: { intentado: !!credenciales.claveAFIP, exitoso: false, error: error.message },
                    atm: { intentado: !!credenciales.claveATM, exitoso: false, error: error.message }
                }
            };
        } finally {
            if (browser) {
                await browser.close();
                console.log('[Verificación Manual] Navegador cerrado.');
            }
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

        const totalUsers = Object.keys(jobsByUser).length;
        let processedUsers = 0;

        try {
            const { browser: launchedBrowser } = await launchBrowserAndPage({ headless: false });
            browser = launchedBrowser;

            for (const [userId, servicesToVerify] of Object.entries(jobsByUser)) {
                const userIndex = data.users.findIndex(u => String(u.id) === String(userId));
                if (userIndex === -1) {
                    stats.no_encontrados++;
                    processedUsers++;

                    // Emitir evento de progreso
                    mainWindow.webContents.send('verification:progress', {
                        userId,
                        processed: processedUsers,
                        total: totalUsers,
                        stats: { ...stats },
                        status: 'not_found',
                        services: []  // ✅ AGREGADO: Array vacío porque no se encontró el usuario
                    });
                    continue;
                }

                const usuario = data.users[userIndex];

                // Emitir evento: iniciando verificación de este usuario
                mainWindow.webContents.send('verification:progress', {
                    userId,
                    userName: usuario.nombre,
                    processed: processedUsers,
                    total: totalUsers,
                    stats: { ...stats },
                    status: 'processing',
                    services: servicesToVerify
                });

                if (!usuario.cuit) {
                    console.error(`Usuario con ID ${userId} (${usuario.nombre}) no tiene CUIT. Omitiendo verificación.`);
                    stats.con_fallos++;
                    processedUsers++;

                    // Emitir evento de error
                    mainWindow.webContents.send('verification:progress', {
                        userId,
                        userName: usuario.nombre,
                        processed: processedUsers,
                        total: totalUsers,
                        stats: { ...stats },
                        status: 'error',
                        services: servicesToVerify,  // ✅ AGREGADO
                        error: 'Sin CUIT'
                    });
                    continue;
                }

                // Llama a la función de validación modular
                await gestionarValidacion(browser, usuario, servicesToVerify);

                // Mapear puntos de venta y CUITs asociados a los campos correctos del esquema de usuario
                if (usuario.puntosDeVenta && usuario.puntosDeVenta.length > 0) {
                    usuario.empresasDisponible = usuario.puntosDeVenta;
                    console.log(`  -> Puntos de venta mapeados a empresasDisponible: ${usuario.empresasDisponible.length}`);
                }
                if (usuario.cuitAsociados && usuario.cuitAsociados.length > 0) {
                    console.log(`  -> CUITs asociados guardados: ${usuario.cuitAsociados.length}`);
                }

                // Traducir resultados a los nuevos estados
                let userSuccess = false;
                if (servicesToVerify.includes('afip')) {
                    if (usuario.claveAfipValida) {
                        usuario.estado_afip = 'validado';
                        userSuccess = true;
                    } else if (usuario.claveAfipRequiereActualizacion) {
                        usuario.estado_afip = 'requiere_actualizacion';
                    } else {
                        usuario.estado_afip = 'invalido';
                    }
                }

                if (servicesToVerify.includes('atm')) {
                    if (usuario.claveAtmValida) {
                        usuario.estado_atm = 'validado';
                        userSuccess = true;
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

                // Actualizar estadísticas
                if (userSuccess) {
                    stats.validados++;
                } else {
                    stats.con_fallos++;
                }

                processedUsers++;

                // Emitir evento: usuario procesado exitosamente
                mainWindow.webContents.send('verification:progress', {
                    userId,
                    userName: usuario.nombre,
                    processed: processedUsers,
                    total: totalUsers,
                    stats: { ...stats },
                    status: userSuccess ? 'success' : 'failed',
                    services: servicesToVerify,  // ✅ AGREGADO: Lista de servicios verificados
                    results: {
                        afip: servicesToVerify.includes('afip') ? {
                            validado: usuario.claveAfipValida,
                            requiereActualizacion: usuario.claveAfipRequiereActualizacion,
                            error: usuario.errorAfip  // ✅ AGREGADO: Mensaje de error específico
                        } : null,
                        atm: servicesToVerify.includes('atm') ? {
                            validado: usuario.claveAtmValida,
                            requiereActualizacion: usuario.claveAtmRequiereActualizacion,
                            error: usuario.errorAtm  // ✅ AGREGADO: Mensaje de error específico
                        } : null
                    }
                });
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