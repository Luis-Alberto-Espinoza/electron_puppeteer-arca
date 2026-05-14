// afip/cuentaTributaria/handlers.js
// Handlers IPC para Cuenta Tributaria (Sistema de Cuenta Tributaria — SCT).
//
// Contrato de alto nivel (ver docs/nuevo_servicio_Afip/flujo_cuentaTributaria_Consulta_VEP.md §8):
//
//   payload.modo = 'consulta-con-seleccion'
//     - Si payload.seleccionFilas == null          → PRIMERA PASADA (Flujo A.1)
//     - Si payload.seleccionFilas trae datos       → SEGUNDA PASADA (Flujo A.2) [pendiente fase 4]
//
//   payload.modo = 'generar-directo'                → Flujo B [pendiente fase 5]
//
// payload.items: [{ cliente: {id, nombre, cuitLogin}, cuitAsociado, medioPago?, deudasABuscar? }, ...]

const cuentaTributariaManager = require('./cuentaTributariaManager.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

function obtenerCredenciales(userStorage, cliente) {
    const dataBD = userStorage.loadData();
    const u = dataBD.users.find(x => String(x.id) === String(cliente.id));
    if (!u) {
        throw new Error(`No se pudieron obtener las credenciales del cliente ${cliente.nombre || cliente.id}`);
    }
    return {
        usuario: u.cuit || cliente.cuitLogin || cliente.cuit,
        contrasena: u.claveAFIP || u.clave
    };
}

/**
 * Devuelve un cliente enriquecido con `apellido` (y otros campos faltantes)
 * desde el storage. El frontend SCT pasa `{id, nombre, cuitLogin}` recortado;
 * el paso_12 (descarga PDF) necesita además `apellido` para armar la carpeta
 * canónica `${cuit}_${nombre}_${apellido}`. Si el cliente no se encuentra en
 * storage, se devuelve tal cual (fallback seguro).
 */
function enriquecerCliente(userStorage, cliente) {
    if (!cliente || !cliente.id) return cliente;
    try {
        const dataBD = userStorage.loadData();
        const u = dataBD.users.find(x => String(x.id) === String(cliente.id));
        if (!u) return cliente;
        return {
            ...cliente,
            nombre: cliente.nombre || u.nombre,
            apellido: cliente.apellido || u.apellido,
            cuitLogin: cliente.cuitLogin || u.cuit,
        };
    } catch (_) {
        return cliente;
    }
}

function emitirUpdate(mainWindow, datos) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cuentaTributaria:update', datos);
    }
}

function claveItem(item) {
    const cliId = item && item.cliente && item.cliente.id;
    const cuit = item && item.cuitAsociado;
    return `${cliId}-${cuit}`;
}

function setupCuentaTributariaHandlers(ipcMain, userStorage, mainWindow, app) {

    ipcMain.handle('cuentaTributaria:procesar', async (event, datos) => {
        console.log('[CuentaTributaria] Solicitud recibida. modo=', datos && datos.modo);
        const { modo, items, seleccionFilas } = datos || {};

        if (!Array.isArray(items) || items.length === 0) {
            return { success: false, message: 'No se recibieron items para procesar' };
        }

        const downloadsPath = app.getPath('downloads');
        const url = URL_LOGIN_AFIP;

        try {
            // ============================================================
            // FLUJO A — PRIMERA PASADA
            // ============================================================
            if (modo === 'consulta-con-seleccion' && !seleccionFilas) {
                const procesadosAuto = [];
                const requierenSeleccion = [];
                const errores = [];

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    let { cliente, cuitAsociado } = item;
                    cliente = enriquecerCliente(userStorage, cliente);

                    emitirUpdate(mainWindow, {
                        tipo: 'progreso',
                        modo,
                        pasada: 1,
                        cliente: cliente.nombre,
                        cuitAsociado,
                        procesados: i,
                        total: items.length
                    });

                    try {
                        const credenciales = obtenerCredenciales(userStorage, cliente);
                        const r = await cuentaTributariaManager.iniciarProceso(
                            url,
                            credenciales,
                            { cliente, cuitAsociado },
                            'consultarA',
                            downloadsPath
                        );

                        if (!r || r.success === false) {
                            errores.push({
                                cliente, cuitAsociado,
                                error: (r && r.message) || 'Error desconocido',
                                codigo: r && r.error
                            });
                            continue;
                        }

                        if (r.sinDeuda) {
                            procesadosAuto.push({
                                cliente, cuitAsociado,
                                sinDeuda: true,
                                message: r.message || 'Sin deuda pendiente'
                            });
                            continue;
                        }

                        if (r.requiereSeleccion) {
                            requierenSeleccion.push({
                                cliente, cuitAsociado,
                                excelDescargado: r.excelDescargado,
                                excelError: r.excelError || null,
                                deudas: r.deudas,
                                totales: r.totales
                            });
                        }

                    } catch (err) {
                        console.error(`[CuentaTributaria] Error en (${cliente && cliente.nombre}, ${cuitAsociado}):`, err);
                        errores.push({
                            cliente, cuitAsociado,
                            error: err.message
                        });
                    }
                }

                emitirUpdate(mainWindow, {
                    tipo: 'progreso',
                    modo,
                    pasada: 1,
                    procesados: items.length,
                    total: items.length
                });

                return {
                    success: true,
                    modo,
                    requiereSeleccion: requierenSeleccion.length > 0,
                    procesadosAuto,
                    requierenSeleccion,
                    errores
                };
            }

            // ============================================================
            // FLUJO A — SEGUNDA PASADA
            // ============================================================
            // Cada item viene con seleccionFilas:{modo:'ids', ids:[...]} y medioPago.
            if (modo === 'consulta-con-seleccion' && seleccionFilas) {
                const resultados = [];

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    let { cliente, cuitAsociado, medioPago, seleccionFilas: selItem } = item;
                    cliente = enriquecerCliente(userStorage, cliente);

                    emitirUpdate(mainWindow, {
                        tipo: 'progreso',
                        modo,
                        pasada: 2,
                        cliente: cliente && cliente.nombre,
                        cuitAsociado,
                        procesados: i,
                        total: items.length
                    });

                    // Validaciones por item.
                    if (!medioPago || !medioPago.id) {
                        resultados.push({
                            cliente, cuitAsociado,
                            status: 'error',
                            error: 'Falta medioPago para este grupo'
                        });
                        continue;
                    }
                    const ids = selItem && Array.isArray(selItem.ids) ? selItem.ids : [];
                    if (ids.length === 0) {
                        resultados.push({
                            cliente, cuitAsociado,
                            status: 'error',
                            error: 'No hay filas seleccionadas para este grupo'
                        });
                        continue;
                    }

                    try {
                        const credenciales = obtenerCredenciales(userStorage, cliente);
                        const r = await cuentaTributariaManager.iniciarProceso(
                            url,
                            credenciales,
                            { cliente, cuitAsociado, medioPago, idsSeleccionadas: ids },
                            'pagarA',
                            downloadsPath
                        );

                        if (!r || r.success === false) {
                            resultados.push({
                                cliente, cuitAsociado,
                                medioPago,
                                status: r && r.status ? r.status : 'error',
                                error: (r && (r.message || r.error)) || 'Error desconocido'
                            });
                            continue;
                        }

                        resultados.push({
                            cliente, cuitAsociado,
                            medioPago,
                            status: 'success',
                            pdfDescargado: r.pdfDescargado,
                            marcadas: r.marcadas,
                            noEncontradas: r.noEncontradas || []
                        });

                    } catch (err) {
                        console.error(`[CuentaTributaria] Error 2da pasada (${cliente && cliente.nombre}, ${cuitAsociado}):`, err);
                        resultados.push({
                            cliente, cuitAsociado,
                            medioPago,
                            status: 'error',
                            error: err.message
                        });
                    }
                }

                emitirUpdate(mainWindow, {
                    tipo: 'progreso',
                    modo,
                    pasada: 2,
                    procesados: items.length,
                    total: items.length
                });

                return {
                    success: true,
                    modo,
                    pasada: 2,
                    resultados
                };
            }

            // ============================================================
            // FLUJO B — GENERAR DIRECTO
            // ============================================================
            // Cada item viene con deudasABuscar:[{periodo, impuesto}, ...] y medioPago.
            if (modo === 'generar-directo') {
                const resultados = [];

                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    let { cliente, cuitAsociado, deudasABuscar, medioPago } = item;
                    cliente = enriquecerCliente(userStorage, cliente);

                    emitirUpdate(mainWindow, {
                        tipo: 'progreso',
                        modo,
                        cliente: cliente && cliente.nombre,
                        cuitAsociado,
                        procesados: i,
                        total: items.length
                    });

                    if (!medioPago || !medioPago.id) {
                        resultados.push({
                            cliente, cuitAsociado,
                            status: 'error',
                            error: 'Falta medioPago para este grupo'
                        });
                        continue;
                    }
                    if (!Array.isArray(deudasABuscar) || deudasABuscar.length === 0) {
                        resultados.push({
                            cliente, cuitAsociado,
                            status: 'error',
                            error: 'No hay deudas a buscar para este grupo'
                        });
                        continue;
                    }

                    try {
                        const credenciales = obtenerCredenciales(userStorage, cliente);
                        const r = await cuentaTributariaManager.iniciarProceso(
                            url,
                            credenciales,
                            { cliente, cuitAsociado, deudasABuscar, medioPago },
                            'pagarDirectoB',
                            downloadsPath
                        );

                        if (!r || r.success === false) {
                            resultados.push({
                                cliente, cuitAsociado,
                                medioPago,
                                status: r && r.status ? r.status : 'error',
                                error: (r && (r.message || r.error)) || 'Error desconocido',
                                noMatcheadas: r && r.noMatcheadas ? r.noMatcheadas : undefined
                            });
                            continue;
                        }

                        resultados.push({
                            cliente, cuitAsociado,
                            medioPago,
                            status: 'success',
                            pdfDescargado: r.pdfDescargado,
                            matcheadas: r.matcheadas,
                            noMatcheadas: r.noMatcheadas || []
                        });

                    } catch (err) {
                        console.error(`[CuentaTributaria] Error generar-directo (${cliente && cliente.nombre}, ${cuitAsociado}):`, err);
                        resultados.push({
                            cliente, cuitAsociado,
                            medioPago,
                            status: 'error',
                            error: err.message
                        });
                    }
                }

                emitirUpdate(mainWindow, {
                    tipo: 'progreso',
                    modo,
                    procesados: items.length,
                    total: items.length
                });

                return {
                    success: true,
                    modo,
                    resultados
                };
            }

            return { success: false, message: `Modo no reconocido: ${modo}` };

        } catch (error) {
            console.error('[CuentaTributaria] Error general:', error);
            return {
                success: false,
                message: `Error en cuentaTributaria:procesar: ${error.message}`,
                error: error.toString()
            };
        }
    });
}

module.exports = setupCuentaTributariaHandlers;
