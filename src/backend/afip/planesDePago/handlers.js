// afip/planesDePago/handlers.js
// Handlers IPC para el CRUD de CUITs asociados y ejecución - Planes de Pago

const { CuitsAsociadosStorage } = require('./storage_cuits.js');
const planesDePagoManager = require('./planesDePagoManager.js');
const consolidadoExcel = require('./consolidadoExcel.js');

function setupPlanesDePagoHandlers(ipcMain, userStorage, mainWindow, app) {
    const storage = new CuitsAsociadosStorage();

    // Obtener CUITs asociados de un representante
    ipcMain.handle('planesDePago:cuits:get', async (_event, cuitRepresentante) => {
        try {
            const asociados = storage.getAsociados(cuitRepresentante);
            return { exito: true, asociados };
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });

    // Agregar un CUIT asociado
    ipcMain.handle('planesDePago:cuits:guardar', async (_event, { cuitRepresentante, nombreRepresentante, asociado }) => {
        try {
            return storage.guardarAsociado(cuitRepresentante, nombreRepresentante, asociado);
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });

    // Editar un CUIT asociado
    ipcMain.handle('planesDePago:cuits:editar', async (_event, { cuitRepresentante, cuitViejo, datosNuevos }) => {
        try {
            return storage.editarAsociado(cuitRepresentante, cuitViejo, datosNuevos);
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });

    // Eliminar un CUIT asociado
    ipcMain.handle('planesDePago:cuits:eliminar', async (_event, { cuitRepresentante, cuitAsociado }) => {
        try {
            return storage.eliminarAsociado(cuitRepresentante, cuitAsociado);
        } catch (error) {
            return { exito: false, error: error.message };
        }
    });

    // ========================================
    // HANDLER: planesDePago:generar
    // Ejecuta la automatización para uno o más CUITs
    // ========================================
    ipcMain.handle('planesDePago:generar', async (_event, datos) => {
        console.log('[PlanesDePago Handler] Solicitud recibida');
        const { representante, cuitsAProcesar } = datos;

        if (!cuitsAProcesar || cuitsAProcesar.length === 0) {
            return { success: false, message: 'No se recibieron CUITs para procesar' };
        }

        try {
            // Obtener credenciales del representante
            const dataBD = userStorage.loadData();
            const usuarioCompleto = dataBD.users.find(u => String(u.id) === String(representante.id));

            if (!usuarioCompleto) {
                return { success: false, message: 'No se encontraron las credenciales del representante' };
            }

            const credenciales = {
                usuario: usuarioCompleto.cuit || representante.cuit,
                contrasena: usuarioCompleto.claveAFIP || usuarioCompleto.clave
            };

            const downloadsPath = app.getPath('downloads');
            const resultados = [];

            for (let i = 0; i < cuitsAProcesar.length; i++) {
                const cuitConsulta = cuitsAProcesar[i];
                console.log(`[PlanesDePago Handler] Procesando ${i + 1}/${cuitsAProcesar.length}: ${cuitConsulta.alias} (${cuitConsulta.cuit})`);

                // Enviar progreso al frontend
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('planesDePago:update', {
                        tipo: 'progreso',
                        cuit: cuitConsulta.cuit,
                        alias: cuitConsulta.alias,
                        procesados: i,
                        total: cuitsAProcesar.length,
                        estado: 'procesando',
                        mensaje: `Procesando ${cuitConsulta.alias} (${cuitConsulta.cuit})...`
                    });
                }

                try {
                    const resultado = await planesDePagoManager.iniciarProceso(
                        credenciales,
                        representante,
                        cuitConsulta,
                        downloadsPath
                    );

                    resultados.push({
                        cuitConsulta,
                        ...resultado
                    });

                    // Extraer downloadDir del primer plan exitoso
                    let downloadDir = null;
                    if (resultado.planes) {
                        const planConPdf = resultado.planes.find(p => p.pdf && p.pdf.downloadDir);
                        if (planConPdf) downloadDir = planConPdf.pdf.downloadDir;
                    }

                    // Enviar resultado parcial
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('planesDePago:update', {
                            tipo: 'resultado',
                            cuit: cuitConsulta.cuit,
                            alias: cuitConsulta.alias,
                            procesados: i + 1,
                            total: cuitsAProcesar.length,
                            estado: resultado.success ? 'exito' : 'error',
                            mensaje: resultado.message,
                            downloadDir,
                            resumenCliente: resultado.resumenCliente || null
                        });
                    }

                } catch (error) {
                    console.error(`[PlanesDePago Handler] Error procesando ${cuitConsulta.cuit}:`, error.message);
                    resultados.push({
                        cuitConsulta,
                        success: false,
                        message: error.message
                    });

                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('planesDePago:update', {
                            tipo: 'resultado',
                            cuit: cuitConsulta.cuit,
                            alias: cuitConsulta.alias,
                            procesados: i + 1,
                            total: cuitsAProcesar.length,
                            estado: 'error',
                            mensaje: error.message
                        });
                    }
                }
            }

            // Enviar finalización
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('planesDePago:update', {
                    tipo: 'finalizado',
                    estado: 'finalizado',
                    total: cuitsAProcesar.length,
                    exitosos: resultados.filter(r => r.success).length,
                    fallidos: resultados.filter(r => !r.success).length
                });
            }

            return {
                success: true,
                message: 'Procesamiento completado',
                resultados
            };

        } catch (error) {
            console.error('[PlanesDePago Handler] Error general:', error);
            return { success: false, message: error.message };
        }
    });

    // ========================================
    // HANDLER: planesDePago:generarLote
    // Procesa múltiples representantes, cada uno con sus CUITs
    // ========================================
    ipcMain.handle('planesDePago:generarLote', async (_event, datos) => {
        console.log('[PlanesDePago Handler Lote] Solicitud recibida');
        const { loteRepresentantes } = datos;

        if (!loteRepresentantes || loteRepresentantes.length === 0) {
            return { success: false, message: 'No se recibieron representantes para procesar' };
        }

        const resultadosGlobales = [];

        for (let r = 0; r < loteRepresentantes.length; r++) {
            const { representante, cuitsAProcesar } = loteRepresentantes[r];

            console.log(`[PlanesDePago Handler Lote] Representante ${r + 1}/${loteRepresentantes.length}: ${representante.nombre}`);

            // Notificar inicio de representante
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('planesDePago:update', {
                    tipo: 'representante-inicio',
                    representanteId: representante.id,
                    representanteNombre: representante.nombre,
                    representanteCuit: representante.cuit,
                    totalRepresentantes: loteRepresentantes.length,
                    indiceRepresentante: r,
                    totalCuits: cuitsAProcesar.length
                });
            }

            try {
                // Obtener credenciales del representante
                const dataBD = userStorage.loadData();
                const usuarioCompleto = dataBD.users.find(u => String(u.id) === String(representante.id));

                if (!usuarioCompleto) {
                    const errorMsg = `No se encontraron las credenciales de ${representante.nombre}`;
                    resultadosGlobales.push({
                        representante,
                        success: false,
                        message: errorMsg,
                        resultados: []
                    });

                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('planesDePago:update', {
                            tipo: 'representante-error',
                            representanteId: representante.id,
                            representanteNombre: representante.nombre,
                            estado: 'error',
                            mensaje: errorMsg
                        });
                    }
                    continue;
                }

                const credenciales = {
                    usuario: usuarioCompleto.cuit || representante.cuit,
                    contrasena: usuarioCompleto.claveAFIP || usuarioCompleto.clave
                };

                const downloadsPath = app.getPath('downloads');

                // Callback de progreso por CUIT (reenvía al frontend)
                const onProgreso = (progresoDatos) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('planesDePago:update', {
                            ...progresoDatos,
                            representanteId: representante.id,
                            representanteNombre: representante.nombre
                        });
                    }
                };

                // Usar iniciarProcesoLote: login una vez, procesar todos los CUITs
                const resultado = await planesDePagoManager.iniciarProcesoLote(
                    credenciales,
                    representante,
                    cuitsAProcesar,
                    downloadsPath,
                    onProgreso
                );

                resultadosGlobales.push({
                    representante,
                    ...resultado
                });

                // Notificar fin de representante
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('planesDePago:update', {
                        tipo: 'representante-fin',
                        representanteId: representante.id,
                        representanteNombre: representante.nombre,
                        estado: resultado.success ? 'exito' : 'error',
                        mensaje: resultado.message
                    });
                }

            } catch (error) {
                console.error(`[PlanesDePago Handler Lote] Error representante ${representante.nombre}:`, error.message);
                resultadosGlobales.push({
                    representante,
                    success: false,
                    message: error.message,
                    resultados: []
                });

                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('planesDePago:update', {
                        tipo: 'representante-error',
                        representanteId: representante.id,
                        representanteNombre: representante.nombre,
                        estado: 'error',
                        mensaje: error.message
                    });
                }
            }
        }

        // Generar Excel consolidado con los resultados
        let consolidado = null;
        try {
            const downloadsPath = app.getPath('downloads');
            consolidado = consolidadoExcel.generar(resultadosGlobales, downloadsPath);
            if (consolidado.success) {
                console.log(`[PlanesDePago Handler Lote] Consolidado Excel: ${consolidado.path}`);
            } else {
                console.warn(`[PlanesDePago Handler Lote] No se pudo generar consolidado: ${consolidado.message}`);
            }
        } catch (e) {
            console.error('[PlanesDePago Handler Lote] Error generando consolidado:', e.message);
            consolidado = { success: false, message: e.message };
        }

        // Notificar finalización global
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('planesDePago:update', {
                tipo: 'finalizado',
                estado: 'finalizado',
                totalRepresentantes: loteRepresentantes.length,
                exitosos: resultadosGlobales.filter(r => r.success).length,
                fallidos: resultadosGlobales.filter(r => !r.success).length,
                consolidado: consolidado && consolidado.success ? {
                    path: consolidado.path,
                    nombre: consolidado.nombre,
                    totales: consolidado.totales
                } : null
            });
        }

        return {
            success: true,
            message: 'Procesamiento por lote completado',
            resultados: resultadosGlobales,
            consolidado
        };
    });
}

module.exports = setupPlanesDePagoHandlers;
