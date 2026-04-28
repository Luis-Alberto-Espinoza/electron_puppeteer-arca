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
                    const { cliente, cuitAsociado } = item;

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
            // FLUJO A — SEGUNDA PASADA  (pendiente fase 4)
            // ============================================================
            if (modo === 'consulta-con-seleccion' && seleccionFilas) {
                return {
                    success: false,
                    modo,
                    pasada: 2,
                    message: 'Segunda pasada aún no implementada (fase 4)',
                    notImplemented: true
                };
            }

            // ============================================================
            // FLUJO B — GENERAR DIRECTO  (pendiente fase 5)
            // ============================================================
            if (modo === 'generar-directo') {
                return {
                    success: false,
                    modo,
                    message: 'Flujo B (generar-directo) aún no implementado (fase 5)',
                    notImplemented: true
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
