// afip/vep/handlers.js
// Handlers IPC para el dominio de VEP (Volante Electronico de Pago)

const vepManager = require('./vepManager.js');

/**
 * Configura los handlers IPC para el dominio de VEP
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 * @param {Object} userStorage - Storage de usuarios
 * @param {Electron.BrowserWindow} mainWindow - Ventana principal
 * @param {Electron.App} app - Instancia de la app
 */
function setupVepHandlers(ipcMain, userStorage, mainWindow, app) {

    // ========================================
    // HANDLER: vep:generar
    // Genera VEPs para uno o mas usuarios
    // ========================================
    ipcMain.handle('vep:generar', async (event, datos) => {
        console.log('BACKEND: Recibida solicitud para generar VEP');
        console.log('Datos recibidos:', JSON.stringify(datos, null, 2));

        const { usuarios, periodosSeleccionados, clientesSeleccionadosParaProcesar } = datos;

        if (!usuarios || !Array.isArray(usuarios) || usuarios.length === 0) {
            return {
                success: false,
                message: 'No se recibieron usuarios para procesar'
            };
        }

        try {
            const url = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

            // ==============================================
            // PRIMERA PASADA: Procesar TODOS los clientes
            // ==============================================
            if (!periodosSeleccionados && !clientesSeleccionadosParaProcesar) {
                console.log(`Primera pasada: Procesando ${usuarios.length} cliente(s)...`);

                const procesadosAuto = [];
                const requierenSeleccion = [];
                const errores = [];

                for (let i = 0; i < usuarios.length; i++) {
                    const item = usuarios[i];
                    const { usuario, medioPago } = item;

                    console.log(`\n[${i + 1}/${usuarios.length}] Procesando ${usuario.nombre} (${usuario.cuit})`);

                    try {
                        // Obtener credenciales
                        const dataBD = userStorage.loadData();
                        const usuarioCompleto = dataBD.users.find(u => String(u.id) === String(usuario.id));

                        if (!usuarioCompleto) {
                            throw new Error(`No se pudieron obtener las credenciales`);
                        }

                        const credenciales = {
                            usuario: usuarioCompleto.cuit || usuario.cuit,
                            contrasena: usuarioCompleto.claveAFIP || usuarioCompleto.clave
                        };

                        // Llamar al VEP Manager SIN periodos seleccionados
                        const downloadsPath = app.getPath('downloads');
                        const resultado = await vepManager.iniciarProceso(url, credenciales, item, null, downloadsPath);

                        if (resultado.requiereSeleccion) {
                            // Cliente con multiples periodos
                            console.log(`  ${usuario.nombre} requiere seleccion (${resultado.periodos.length} periodos)`);
                            requierenSeleccion.push({
                                usuario: usuario,
                                medioPago: medioPago,
                                periodos: resultado.periodos
                            });
                        } else if (resultado.sinDeuda) {
                            // ===== CLIENTE SIN DEUDA =====
                            // No agregar a procesadosAuto porque no se genero ningun VEP
                            console.log(`  ${usuario.nombre} sin deuda pendiente`);
                            procesadosAuto.push({
                                usuario: usuario,
                                medioPago: medioPago,
                                sinDeuda: true,
                                message: resultado.message || 'Cliente sin deuda pendiente'
                            });
                        } else if (resultado.success && resultado.autoprocesado) {
                            // Cliente con 1 periodo (procesado automaticamente)
                            console.log(`  ${usuario.nombre} procesado automaticamente`);
                            procesadosAuto.push({
                                usuario: usuario,
                                medioPago: medioPago,
                                pdfDescargado: resultado.pdfDescargado
                            });
                        } else if (resultado.success) {
                            // Completado exitosamente (segunda pasada o sin periodos)
                            console.log(`  ${usuario.nombre} completado`);
                            procesadosAuto.push({
                                usuario: usuario,
                                medioPago: medioPago,
                                pdfDescargado: resultado.pdfDescargado
                            });
                        } else {
                            // Error
                            console.error(`  ${usuario.nombre} fallo: ${resultado.message}`);
                            errores.push({
                                usuario: usuario,
                                medioPago: medioPago,
                                error: resultado.message
                            });
                        }

                    } catch (error) {
                        console.error(`Error procesando ${usuario.nombre}:`, error);
                        errores.push({
                            usuario: usuario,
                            medioPago: medioPago,
                            error: error.message
                        });
                    }

                    // Enviar progreso al frontend
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('vep:update', {
                            tipo: 'progreso',
                            usuario: usuario.nombre,
                            procesados: i + 1,
                            total: usuarios.length
                        });
                    }
                }

                console.log(`\nResumen primera pasada:`);
                console.log(`   Procesados automaticamente: ${procesadosAuto.length}`);
                console.log(`   Requieren seleccion: ${requierenSeleccion.length}`);
                console.log(`   Errores: ${errores.length}`);

                // Si todos fueron procesados automaticamente o fallaron, retornar resultado final
                if (requierenSeleccion.length === 0) {
                    return {
                        success: true,
                        message: 'Todos los clientes procesados',
                        procesadosAuto: procesadosAuto,
                        errores: errores
                    };
                }

                // Retornar agrupacion para que el usuario seleccione
                return {
                    success: true,
                    requiereSeleccion: true,
                    procesadosAuto: procesadosAuto,
                    requierenSeleccion: requierenSeleccion,
                    errores: errores
                };
            }

            // =====================================================
            // SEGUNDA PASADA: Procesar solo clientes con seleccion
            // =====================================================
            console.log(`Segunda pasada: Procesando clientes con periodos seleccionados...`);
            console.log(`   Periodos por cliente:`, periodosSeleccionados);

            const resultadosFinales = [];

            for (const clienteId of Object.keys(periodosSeleccionados)) {
                const item = usuarios.find(u => String(u.usuario.id) === String(clienteId));
                if (!item) continue;

                const { usuario, medioPago } = item;
                const periodosCliente = periodosSeleccionados[clienteId];

                console.log(`\nProcesando ${usuario.nombre} con ${periodosCliente.length} periodo(s)`);

                try {
                    const dataBD = userStorage.loadData();
                    const usuarioCompleto = dataBD.users.find(u => String(u.id) === String(usuario.id));

                    const credenciales = {
                        usuario: usuarioCompleto.cuit || usuario.cuit,
                        contrasena: usuarioCompleto.claveAFIP || usuarioCompleto.clave
                    };

                    // Llamar con los periodos seleccionados
                    const downloadsPath = app.getPath('downloads');
                    const resultado = await vepManager.iniciarProceso(url, credenciales, item, periodosCliente, downloadsPath);

                    if (resultado.success) {
                        console.log(`  ${usuario.nombre} completado`);
                        resultadosFinales.push({
                            usuario: usuario,
                            medioPago: medioPago,
                            status: 'success',
                            pdfDescargado: resultado.pdfDescargado
                        });
                    } else {
                        console.error(`  ${usuario.nombre} fallo`);
                        resultadosFinales.push({
                            usuario: usuario,
                            medioPago: medioPago,
                            status: 'error',
                            error: resultado.message
                        });
                    }

                } catch (error) {
                    console.error(`Error en segunda pasada:`, error);
                    resultadosFinales.push({
                        usuario: usuario,
                        medioPago: medioPago,
                        status: 'error',
                        error: error.message
                    });
                }
            }

            console.log(`\nSegunda pasada completada`);

            return {
                success: true,
                message: 'Procesamiento completado',
                resultados: resultadosFinales
            };

        } catch (error) {
            console.error('Error general generando VEPs:', error);
            return {
                success: false,
                message: `Error al generar VEPs: ${error.message}`,
                error: error.toString()
            };
        }
    });
}

module.exports = setupVepHandlers;
