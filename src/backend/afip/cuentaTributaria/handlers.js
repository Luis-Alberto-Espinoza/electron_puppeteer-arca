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
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { crearCorteCaptchaAfip } = require('../corteCaptchaAfip.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

async function obtenerCredenciales(repo, cuitAsociado) {
    // Modelo plano: el login sale del resolver (representante si el contribuyente
    // no tiene clave propia). Después paso_1/seleccionaCuit opera sobre cuitAsociado.
    const acceso = await repo.resolverAcceso(String(cuitAsociado), 'afip');
    if (!acceso) {
        throw new Error(`El contribuyente ${cuitAsociado} no tiene acceso AFIP (ni clave propia ni representante)`);
    }
    return { usuario: acceso.loginCuit, contrasena: acceso.loginClave };
}

/**
 * Devuelve un cliente enriquecido con `apellido` (y otros campos faltantes)
 * desde el repo. El frontend SCT pasa `{id, nombre, cuitLogin}` recortado; la
 * carpeta se arma por CUIT y el nombre queda de respaldo. Si el cliente no se
 * encuentra, se devuelve tal cual (fallback seguro).
 */
async function enriquecerCliente(repo, cliente) {
    if (!cliente || !cliente.id) return cliente;
    try {
        const c = await repo.getById(cliente.id);
        if (!c) return cliente;
        return {
            ...cliente,
            // Jurídica no tiene nombre: la razón social hace de nombre.
            nombre: cliente.nombre || c.nombre || c.razonSocial,
            apellido: cliente.apellido || c.apellido,
            cuitLogin: cliente.cuitLogin || c.cuit,
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

function setupCuentaTributariaHandlers(ipcMain, mainWindow, app) {
    const repo = getContribuyenteRepo();

    ipcMain.handle('cuentaTributaria:procesar', async (event, datos) => {
        console.log('[CuentaTributaria] Solicitud recibida. modo=', datos && datos.modo);
        // `visible` se elige una vez para todo el lote (false = navegador oculto).
        const { modo, items, seleccionFilas, visible } = datos || {};

        if (!Array.isArray(items) || items.length === 0) {
            return { success: false, message: 'No se recibieron items para procesar' };
        }

        const downloadsPath = app.getPath('downloads');
        const url = URL_LOGIN_AFIP;
        // Si AFIP pide captcha en un cliente, el resto del lote se saltea (ver corteCaptchaAfip).
        const corte = crearCorteCaptchaAfip();

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
                    cliente = await enriquecerCliente(repo, cliente);

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
                        if (corte.activo) throw new Error(corte.mensaje);
                        const credenciales = await obtenerCredenciales(repo, cuitAsociado);
                        const r = await cuentaTributariaManager.iniciarProceso(
                            url,
                            credenciales,
                            { cliente, cuitAsociado },
                            'consultarA',
                            downloadsPath,
                            { visible }
                        );
                        corte.registrar(r);

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
                    cliente = await enriquecerCliente(repo, cliente);

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
                        if (corte.activo) throw new Error(corte.mensaje);
                        const credenciales = await obtenerCredenciales(repo, cuitAsociado);
                        const r = await cuentaTributariaManager.iniciarProceso(
                            url,
                            credenciales,
                            { cliente, cuitAsociado, medioPago, idsSeleccionadas: ids },
                            'pagarA',
                            downloadsPath,
                            { visible }
                        );
                        corte.registrar(r);

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
                    cliente = await enriquecerCliente(repo, cliente);

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
                        if (corte.activo) throw new Error(corte.mensaje);
                        const credenciales = await obtenerCredenciales(repo, cuitAsociado);
                        const r = await cuentaTributariaManager.iniciarProceso(
                            url,
                            credenciales,
                            { cliente, cuitAsociado, deudasABuscar, medioPago },
                            'pagarDirectoB',
                            downloadsPath,
                            { visible }
                        );
                        corte.registrar(r);

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
