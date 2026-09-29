const { proyectarUsersJson } = require('./proyeccionUsersJson.js');
const { getContribuyenteRepo } = require('./contribuyenteStore.js');

module.exports = function setupUserHandlers(ipcMain, mainWindow, dialog) {
    const repo = getContribuyenteRepo();

    // Estado nuevo (enum) a partir de si hay clave + si ya se verificó al crear.
    function estadoInicial(clave, verificado) {
        if (!clave) return 'no_aplica';
        return verificado === true ? 'validado' : 'pendiente';
    }

    // DTO para la TABLA del CRUD: identidad + estados + representante, SIN claves.
    // La edición trae las claves por user:get-by-id (único endpoint con claves).
    function aFilaCrud(c) {
        return {
            id: c.id, cuit: c.cuit, tipo: c.tipo,
            razonSocial: c.razonSocial, nombre: c.nombre, apellido: c.apellido,
            tipoContribuyente: c.tipoContribuyente,
            tieneClaveAFIP: !!c.claveAFIP, estado_afip: c.estado_afip,
            tieneClaveATM: !!c.claveATM, estado_atm: c.estado_atm,
            representanteAfipCuit: c.representanteAfipCuit,
            grupoId: c.grupoId || null,   // estudio al que pertenece (filtro + badge en la lista)
            cantidadPdv: Array.isArray(c.puntosDeVenta) ? c.puntosDeVenta.length : 0
        };
    }

    ipcMain.handle('user:create', async (event, userData) => {
        try {
            const c = await repo.crear({
                cuit: userData.cuit,
                tipo: userData.tipo || null,                 // null → normalizar infiere por nombre/apellido
                razonSocial: userData.razonSocial,
                nombre: userData.nombre || null,
                apellido: userData.apellido || null,
                cuil: userData.cuil || null,
                tipoContribuyente: userData.tipoContribuyente || null,
                claveAFIP: userData.claveAFIP || null,
                estado_afip: estadoInicial(userData.claveAFIP, userData.verificadoAFIP),
                claveATM: userData.claveATM || null,
                estado_atm: estadoInicial(userData.claveATM, userData.verificadoATM),
                representanteAfipCuit: userData.representanteAfipCuit || null,
                grupoId: userData.grupoId || null
            });
            return { success: true, user: c };
        } catch (error) {
            const msg = error.code === 'CUIT_DUPLICADO' ? 'Ya existe un contribuyente con ese CUIT'
                : error.code === 'CUIT_INVALIDO' ? 'El CUIT debe tener 11 dígitos'
                : error.message;
            return { success: false, error: msg };
        }
    });

    ipcMain.handle('user:getAll', async () => {
        try {
            // Shape LEGACY (proyección embed, con claveAFIP/empresas) para los
            // consumidores aún no migrados (selector legacy de Planes, etc.).
            // El CRUD nuevo usa user:listCrud (fila plana sin claves).
            return { success: true, users: proyectarUsersJson(await repo.obtenerTodos()).users };
        } catch (error) {
            return { success: false, error: error.message, users: [] };
        }
    });

    // Tabla del CRUD nuevo (modelo plano): fila DTO sin claves.
    ipcMain.handle('user:listCrud', async () => {
        try {
            const todos = await repo.obtenerTodos();
            return { success: true, contribuyentes: todos.map(aFilaCrud) };
        } catch (error) {
            return { success: false, error: error.message, contribuyentes: [] };
        }
    });

    ipcMain.handle('user:get-by-id', async (event, userId) => {
        try {
            // Único endpoint que devuelve el contribuyente COMPLETO (con claves):
            // es el editor de admin, donde se ven/editan las claves.
            const c = await repo.getById(userId);
            return c ? { success: true, user: c } : { success: false, error: 'Usuario no encontrado' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('user:update', async (event, updatedUser) => {
        try {
            // El front edita por id (transición); el repo actualiza por cuit (PK).
            const actual = await repo.getById(updatedUser.id);
            if (!actual) return { success: false, error: 'Usuario no encontrado' };

            // cuit es la PK: no se cambia por edición (si hace falta, es baja+alta).
            // repo.actualizar resetea estado_afip/atm si la clave correspondiente cambió.
            const c = await repo.actualizar(actual.cuit, {
                tipo: updatedUser.tipo || actual.tipo,
                razonSocial: updatedUser.razonSocial,
                nombre: updatedUser.nombre || null,
                apellido: updatedUser.apellido || null,
                cuil: updatedUser.cuil || null,
                tipoContribuyente: updatedUser.tipoContribuyente || null,
                claveAFIP: updatedUser.claveAFIP || null,
                claveATM: updatedUser.claveATM || null,
                representanteAfipCuit: updatedUser.representanteAfipCuit || null,
                // Solo se toca el grupo si el front mandó la clave (el form de edición
                // sí la manda). Así ningún otro camino que reuse user:update lo borra.
                ...('grupoId' in updatedUser ? { grupoId: updatedUser.grupoId || null } : {})
            });
            return { success: true, user: c };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // Cambia SOLO el tipo de contribuyente (B/C). Lo usa Factura Tipificada cuando
    // el cliente no lo tiene cargado. No reusa user:update porque ese pisa el objeto
    // entero (sin claves en el payload, las borra).
    ipcMain.handle('user:setTipoContribuyente', async (event, { id, tipoContribuyente } = {}) => {
        try {
            if (tipoContribuyente !== 'B' && tipoContribuyente !== 'C') {
                return { success: false, error: 'Tipo de contribuyente inválido (B o C)' };
            }
            const actual = await repo.getById(id);
            if (!actual) return { success: false, error: 'Usuario no encontrado' };

            const c = await repo.actualizar(actual.cuit, { tipoContribuyente });
            return { success: true, tipoContribuyente: c.tipoContribuyente };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('user:delete', async (event, userId) => {
        try {
            const actual = await repo.getById(userId);
            if (!actual) return { success: false, error: 'Usuario no encontrado' };

            const r = await repo.borrar(actual.cuit);
            // El repo NO borra si el contribuyente representa a otros (integridad FK).
            if (r && r.ok === false) {
                return { success: false, error: `No se puede borrar: es representante de ${r.dependientes.join(', ')}` };
            }
            return { success: true, user: actual };
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

    ipcMain.handle('user:verify-on-create', async (event, credenciales) => {
        console.log('[Verificación Manual] Iniciando para CUIT:', credenciales.cuit || credenciales.cuil);

        try {
            // Usuario temporal para verificar: vive solo en memoria, nunca se guarda.
            const tempUser = {
                id: 'temp_' + Date.now(),
                nombre: credenciales.nombre || 'Verificación Temporal',
                cuit: credenciales.cuit || null,
                cuil: credenciales.cuil || null,
                claveAFIP: credenciales.claveAFIP || null,
                claveATM: credenciales.claveATM || null,
                tipoContribuyente: credenciales.tipoContribuyente || null
            };

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
                    // Cada servicio (AFIP/ATM) abre y cierra su propio navegador en serie:
                    // acá no pre-abrimos nada.
                    const usuario = tempUser;
                    const servicesToVerify = verificationJobs.map(j => j.service);

                    // Modo lite: si el frontend lo pidió, solo validar credenciales sin scraping.
                    const soloLogin = credenciales.soloLogin === true;

                    await gestionarValidacion(usuario, servicesToVerify, { soloLogin });

                    // Obtener empresas y CUITs del usuario validado.
                    // En modo lite, empresas[] viene vacío (no se scrapea).
                    const empresas = Array.isArray(usuario.empresas)
                        ? usuario.empresas.map(e => e.razonSocial).filter(Boolean)
                        : [];
                    const cuitAsociados = usuario.cuitAsociados || [];

                    console.log('[Verificación Manual] Empresas obtenidas:', empresas);
                    if (cuitAsociados.length > 0) {
                        console.log('[Verificación Manual] CUITs asociados obtenidos:', cuitAsociados);
                    }

                    // Traducir resultados
                    const finalResult = {
                        success: false,
                        empresas,
                        empresasDisponible: empresas, // alias retrocompat
                        cuitAsociados,
                        nombreDetectado: usuario.nombreDetectado || null, // titular leído en el login
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
                        empresas: [],
                        empresasDisponible: [], // alias retrocompat
                        cuitAsociados: [],
                        verificaciones: {
                            afip: { intentado: !!credenciales.claveAFIP, exitoso: false, error: error.message },
                            atm: { intentado: !!credenciales.claveATM, exitoso: false, error: error.message }
                        }
                    });
                }
            });

            console.log('[Verificación Manual] Verificación completada. Resultado:', result);
            return result;

        } catch (error) {
            console.error('[Verificación Manual] Error catastrófico:', error);

            return {
                success: false,
                error: error.message,
                empresas: [],
                empresasDisponible: [], // alias retrocompat
                cuitAsociados: [],
                verificaciones: {
                    afip: { intentado: !!credenciales.claveAFIP, exitoso: false, error: error.message },
                    atm: { intentado: !!credenciales.claveATM, exitoso: false, error: error.message }
                }
            };
        }
    });

    ipcMain.handle('user:verify-credentials', async (event, { verificationJobs }) => {
        if (!verificationJobs || verificationJobs.length === 0) {
            return { success: false, error: 'No se proporcionaron trabajos de verificación.' };
        }

        // Proyección EN MEMORIA (mismo shape que user:getAll): la verificación trabaja
        // sobre el objeto legacy y el resultado se persiste al plano vía el repo.
        const data = proyectarUsersJson(await repo.obtenerTodos());
        const stats = { validados: 0, con_fallos: 0, no_encontrados: 0 };
        const updatedUsers = []; // Array para recolectar usuarios actualizados

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

        // Circuit breaker AFIP: el captcha de AFIP bloquea por IP ~15 min, así que apenas
        // un cliente lo topa, los logins AFIP siguientes también saldrán bloqueados. Una vez
        // activo, salteamos AFIP para el resto del lote (cada intento extra alimenta el bloqueo)
        // y lo marcamos 'no_verificado'. ATM no se ve afectado (es otro sitio).
        let captchaAfipActivo = false;

        try {
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

                // Circuit breaker: si el captcha ya se activó en este lote, no intentamos
                // AFIP (sería inútil y alimentaría el bloqueo). Lo marcamos 'no_verificado'
                // y seguimos validando ATM si corresponde.
                let serviciosAValidar = servicesToVerify;
                if (captchaAfipActivo && serviciosAValidar.includes('afip')) {
                    serviciosAValidar = serviciosAValidar.filter(s => s !== 'afip');
                    usuario.estado_afip = 'no_verificado';
                    usuario.claveAfipValida = false;
                    usuario.errorAfip = 'AFIP bloqueado por captcha durante el lote. Reintentar en unos minutos.';
                    console.log(`  -> AFIP salteado (captcha activo en el lote) para ${usuario.nombre}.`);
                }

                // Llama a la función de validación modular.
                // soloLogin: este handler es "Probar clave" → solo confirma que el login
                // anda. El scraping de empresas/PDV lo hace "Analizar" (empresa:analizar).
                await gestionarValidacion(usuario, serviciosAValidar, { soloLogin: true });

                // Si este cliente topó el captcha, activamos el breaker para los siguientes.
                if (usuario.claveAfipBloqueadaCaptcha) {
                    captchaAfipActivo = true;
                    console.log('  -> ⚠️ Captcha de AFIP activo: se saltearán los AFIP restantes del lote.');
                }

                // gestionarValidacion ya escribió usuario.empresas[] directamente.
                // El normalizador regenera el alias legacy puntosDeVenta[] al guardar.
                if (Array.isArray(usuario.empresas) && usuario.empresas.length > 0) {
                    console.log(`  -> Empresas guardadas: ${usuario.empresas.length}`);
                }
                if (usuario.cuitAsociados && usuario.cuitAsociados.length > 0) {
                    console.log(`  -> CUITs asociados guardados: ${usuario.cuitAsociados.length}`);
                }

                // Traducir resultados a los nuevos estados
                let userSuccess = false;
                // Usamos serviciosAValidar: si AFIP se salteó por captcha, no entra acá y
                // conserva el 'no_verificado' que le pusimos arriba.
                if (serviciosAValidar.includes('afip')) {
                    if (usuario.claveAfipValida) {
                        usuario.estado_afip = 'validado';
                        userSuccess = true;
                    } else if (usuario.claveAfipRequiereActualizacion) {
                        usuario.estado_afip = 'requiere_actualizacion';
                    } else if (usuario.claveAfipBloqueadaCaptcha) {
                        // Captcha: no se pudo comprobar. NO es inválido (la clave puede ser buena).
                        usuario.estado_afip = 'no_verificado';
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

                // Persistir los estados al modelo plano (source of truth). Solo los
                // servicios verificados, para no pisar el otro con un estado vacío.
                // El scraping de empresas/PDV que hace gestionarValidacion se
                // persistirá al plano en C3 (Analizar); acá va solo la validación.
                const cambiosEstado = {};
                if (servicesToVerify.includes('afip')) {
                    cambiosEstado.estado_afip = usuario.estado_afip;
                    cambiosEstado.errorAfip = usuario.errorAfip || null;
                    cambiosEstado.fechaVerificacionAfip = usuario.fechaVerificacion;
                }
                if (servicesToVerify.includes('atm')) {
                    cambiosEstado.estado_atm = ['validado', 'requiere_actualizacion', 'invalido'].includes(usuario.estado_atm)
                        ? usuario.estado_atm : 'invalido';
                    cambiosEstado.errorAtm = usuario.errorAtm || null;
                    cambiosEstado.fechaVerificacionAtm = usuario.fechaVerificacion;
                }
                // Si el cliente todavía no tiene nombre y lo leímos del login (titular AFIP/ATM),
                // lo guardamos como razonSocial. La proyección usa razonSocial de fallback para
                // mostrar el nombre en la lista. Solo lo hacemos si la fila está sin nombre, para
                // no pisar uno que el usuario haya cargado a mano.
                if (usuario.nombreDetectado && usuario.cuit) {
                    try {
                        const filaActual = await repo.getByCuit(String(usuario.cuit));
                        if (filaActual && !String(filaActual.razonSocial || '').trim()) {
                            cambiosEstado.razonSocial = usuario.nombreDetectado;
                        }
                    } catch (_) { /* si no se puede leer, no bloquea la persistencia del estado */ }
                }
                try {
                    if (usuario.cuit) await repo.actualizar(String(usuario.cuit), cambiosEstado);
                } catch (e) {
                    console.error('[verify-credentials] no se pudo persistir estado de', usuario.cuit, e.message);
                }

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

            // No guardamos `data` (es la proyección en memoria): lo que importa ya se
            // persistió al plano (arriba).
            return { success: true, stats, updatedUsers };

        } catch (error) {
            console.error('Error en el proceso de verificación masiva:', error);
            return { success: false, error: error.message, stats };
        }
    });
}