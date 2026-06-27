// afip/factura/handlers.js
// Handlers IPC para el dominio de facturacion AFIP

const { procesarDatosFactura: comunicacionConFactura } = require('./service/procesarFactura.js');
const facturaManagerUnificado = require('./facturaManagerUnificado.js');
const { listarRazonesSociales } = require('../../cliente/model.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { historialRepo } = require('../../historial/historialRepo.js');

// En facturas el CUIT puede venir como `cuit` o `cuil`; normalizamos acá.
const clienteFactura = (u) => historialRepo.clienteDesdeUsuario(
    u ? { id: u.id, nombre: u.nombre, cuit: u.cuit || u.cuil } : null
);

// Variables de estado (antes globales en main.js)
// Usadas por el flujo antiguo de facturacion
let resultadoCodigo = null;
let usuarioSeleccionado = null;
let empresaElegida = null;
let ultimaEmpresaElegida = null;

/**
 * Configura los handlers IPC para el dominio de facturacion
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 * @param {Object} userStorage - Storage de usuarios
 * @param {Electron.BrowserWindow} mainWindow - Ventana principal
 */
function setupFacturaHandlers(ipcMain, userStorage, mainWindow) {
    const repo = getContribuyenteRepo();

    // ========================================
    // FLUJO ANTIGUO DE FACTURACION
    // ========================================

    // Handler: formulario-enviado
    // Procesa datos del formulario y los guarda para el siguiente paso
    ipcMain.on('formulario-enviado', async (event, data) => {
        console.log("Formulario enviado desde el frontend:", data, '\nfinal\n');
        if (data.empresaElegida) {
            ultimaEmpresaElegida = data.empresaElegida;
        }
        if (data.servicio === 'factura') {
            if (data.tipoContribuyente == null) {
                data.tipoContribuyente = data.usuario.tipoContribuyente;
            }

            // Guardamos el resultado en la variable para que el siguiente paso lo pueda usar
            resultadoCodigo = comunicacionConFactura(data, userStorage);
            event.reply('codigoLocalStorageGenerado', resultadoCodigo);
        }
        usuarioSeleccionado = data.usuario;
        empresaElegida = data.empresaElegida;
    });

    // Handler: iniciar-proceso-afip
    // Inicia el proceso de facturacion usando los datos guardados
    ipcMain.on('iniciar-proceso-afip', async (event, data) => {
        console.log("Iniciando proceso AFIP con los siguientes datos:", data);
        try {
            if (!data.credenciales.nombreEmpresa && ultimaEmpresaElegida) {
                data.credenciales.nombreEmpresa = ultimaEmpresaElegida;
            }

            // Modelo plano: el LOGIN lo resuelve el backend con resolverAcceso (no
            // se confía en la clave que mandó el frontend → además deja de viajar
            // por el renderer). Para un representado entra por su representante.
            const cuitObjetivo = (usuarioSeleccionado && usuarioSeleccionado.cuit) || data.credenciales.usuario;
            const acceso = await repo.resolverAcceso(String(cuitObjetivo), 'afip');
            if (!acceso) {
                event.reply('login-automatizado', { success: false, error: `El contribuyente ${cuitObjetivo} no tiene acceso AFIP (ni clave propia ni representante)` });
                return;
            }
            const credenciales = {
                usuario: acceso.loginCuit,
                contrasena: acceso.loginClave,
                nombreEmpresa: data.credenciales.nombreEmpresa
            };

            // Usamos el manager unificado con resultadoCodigo ya procesado
            // Nota: resultadoCodigo ya viene procesado, el unificado lo detectará como 'simple'
            const resultado = await facturaManagerUnificado.iniciarProceso(
                data.url,
                credenciales,
                resultadoCodigo,  // datos ya procesados
                data.test,
                usuarioSeleccionado,
                empresaElegida
            );
            event.reply('login-automatizado', resultado);

            // Enviar resultado de facturacion al frontend por canal dedicado
            if (mainWindow && resultado && resultado.success) {
                mainWindow.webContents.send('factura:resultado', resultado);
            }
        } catch (error) {
            event.reply('login-automatizado', { success: false, error: error.message });
        }
    });

    // ========================================
    // FLUJO NUEVO: FACTURA TIPIFICADA
    // ========================================

    // Handler: facturaTipificada:generar
    // Genera una factura tipificada individual
    ipcMain.handle('facturaTipificada:generar', async (event, datos) => {
        console.log('BACKEND: Recibida solicitud para generar factura tipificada');
        console.log('Datos recibidos:', JSON.stringify(datos, null, 2));

        const { usuarioSeleccionado, ...datosFactura } = datos;

        if (!usuarioSeleccionado) {
            return {
                success: false,
                message: 'No se recibio informacion del usuario seleccionado'
            };
        }

        try {
            // Modelo plano: el login lo resuelve el backend (representante si aplica).
            // No se confía en la claveAFIP del frontend.
            const acceso = await repo.resolverAcceso(String(usuarioSeleccionado.cuit || usuarioSeleccionado.cuil), 'afip');
            if (!acceso) {
                return {
                    success: false,
                    message: 'El contribuyente no tiene acceso AFIP (ni clave propia ni representante)'
                };
            }
            const credenciales = {
                usuario: acceso.loginCuit,
                contrasena: acceso.loginClave,
                nombreEmpresa: acceso.objetivoNombre   // razón social del contribuyente
            };

            console.log(`Generando factura para: ${usuarioSeleccionado.nombre} (${credenciales.usuario})`);

            // Agregar modulo para que el unificado detecte el tipo
            datosFactura.modulo = 'facturaCliente';

            // Llamar al manager unificado
            const resultado = await facturaManagerUnificado.iniciarProceso(
                'https://auth.afip.gob.ar/contribuyente_/login.xhtml',
                credenciales,
                datosFactura,
                false, // test mode = false
                usuarioSeleccionado,
                // Priorizar el puntoVenta elegido por el usuario en el selector frontend.
                // El fallback al primer nombre de empresa queda por retrocompatibilidad
                // con flujos viejos que no mandaban puntoVenta explícito.
                datosFactura.puntoVenta || listarRazonesSociales(usuarioSeleccionado)[0] || '0001'
            );

            console.log('Resultado de facturacion:', resultado);

            historialRepo.registrar({
                dominio: 'factura', accion: 'generar', estado: resultado?.success ? 'exito' : 'error',
                cliente: clienteFactura(usuarioSeleccionado),
                resumen: resultado?.success ? 'Factura tipificada generada' : 'Fallo al generar factura',
                error: resultado?.success ? null : (resultado?.message || null)
            });

            return resultado;

        } catch (error) {
            console.error('BACKEND: Error al generar factura tipificada:', error);
            historialRepo.registrar({
                dominio: 'factura', accion: 'generar', estado: 'error',
                cliente: clienteFactura(usuarioSeleccionado),
                resumen: 'Fallo al generar factura', error: error.message
            });
            return {
                success: false,
                message: `Error al generar factura: ${error.message}`,
                error: error.toString()
            };
        }
    });

    // ========================================
    // FLUJO NUEVO: LOTE DE FACTURAS TIPIFICADAS
    // ========================================

    // Handler: facturaTipificada:generarLote
    // Genera un lote de facturas tipificadas
    ipcMain.handle('facturaTipificada:generarLote', async (event, datos) => {
        console.log('BACKEND: Recibida solicitud para generar LOTE de facturas tipificadas');

        // Normalizar al shape nuevo { grupos: [{ datosComunes, facturas }, ...] }.
        // Compat: shape viejo { datosComunes, facturas } -> un solo grupo.
        let grupos = datos.grupos;
        if (!Array.isArray(grupos)) {
            if (datos.datosComunes && Array.isArray(datos.facturas)) {
                grupos = [{ datosComunes: datos.datosComunes, facturas: datos.facturas }];
            } else {
                return { success: false, message: 'No hay facturas para generar' };
            }
        }

        // El usuario logueado es el mismo para todos los grupos (cambia el cabezal,
        // no la cuenta AFIP). Lo tomamos del primer grupo.
        const usuario = grupos[0]?.datosComunes?.usuarioSeleccionado;
        if (!usuario) {
            return {
                success: false,
                message: 'No se recibio informacion del usuario seleccionado'
            };
        }

        // Total de comprobantes sumando todos los grupos.
        const totalComprobantes = grupos.reduce((s, g) => s + (g.facturas?.length || 0), 0);
        if (totalComprobantes === 0) {
            return {
                success: false,
                message: 'No hay facturas para generar'
            };
        }

        // Modo prueba global (lo setea el frontend igual en todos los grupos).
        const modoTest = grupos[0]?.datosComunes?.modoTest || false;

        console.log(`Generando ${grupos.length} factura(s) distinta(s), ${totalComprobantes} comprobante(s) para: ${usuario.nombre}`);

        const resultados = [];
        let indiceGlobal = 0; // 1..N a través de todos los grupos (id de progreso unico)

        // Recorrer cada factura distinta (cabezal propio) y dentro sus comprobantes.
        for (const grupo of grupos) {
            const datosComunes = grupo.datosComunes;
            const facturas = grupo.facturas || [];

            // Credenciales por grupo: el login lo resuelve el backend (modelo plano).
            const accesoGrupo = await repo.resolverAcceso(String(datosComunes.usuarioSeleccionado.cuit || datosComunes.usuarioSeleccionado.cuil), 'afip');
            if (!accesoGrupo) {
                return {
                    success: false,
                    message: 'El contribuyente no tiene acceso AFIP (ni clave propia ni representante)'
                };
            }
            const credenciales = {
                usuario: accesoGrupo.loginCuit,
                contrasena: accesoGrupo.loginClave,
                nombreEmpresa: datosComunes.nombreEmpresa || accesoGrupo.objetivoNombre
            };

            for (let i = 0; i < facturas.length; i++) {
                indiceGlobal++;
                const factura = facturas[i];
                const primeraLinea = factura.lineasDetalle[0];
                const descripcion = primeraLinea?.descripcion || 'Sin descripcion';

                try {
                    // Notificar que esta en progreso
                    event.sender.send('facturaTipificada:progreso', {
                        actual: indiceGlobal,
                        total: totalComprobantes,
                        numeroFactura: indiceGlobal,
                        descripcion: descripcion,
                        status: 'en_progreso',
                        mensaje: 'Generando...'
                    });

                    console.log(`[${indiceGlobal}/${totalComprobantes}] Generando comprobante: ${descripcion}`);

                    // Combinar el cabezal de ESTE grupo con las lineas de este comprobante
                    const datosFactura = {
                        ...datosComunes,
                        lineasDetalle: factura.lineasDetalle,
                        usuarioSeleccionado: datosComunes.usuarioSeleccionado,
                        modulo: 'facturaCliente'  // Para que el unificado detecte el tipo
                    };

                    // Modo prueba: solo el primer comprobante global, sin confirmar.
                    const usarModoTest = indiceGlobal === 1 && modoTest;

                    if (usarModoTest) {
                        console.log('🧪 MODO PRUEBA: Solo se procesará el primer comprobante sin confirmar');
                    }

                    // Generar usando el manager unificado
                    const resultado = await facturaManagerUnificado.iniciarProceso(
                        'https://auth.afip.gob.ar/contribuyente_/login.xhtml',
                        credenciales,
                        datosFactura,
                        usarModoTest,
                        datosComunes.usuarioSeleccionado,
                        // Priorizar el puntoVenta elegido en el selector frontend.
                        datosComunes.puntoVenta || listarRazonesSociales(datosComunes.usuarioSeleccionado)[0] || '0001'
                    );

                    // Si es modo test, cortar despues del primer comprobante
                    if (usarModoTest) {
                        console.log('🧪 MODO PRUEBA completado - Revisa la captura');
                        return {
                            success: true,
                            modoTest: true,
                            message: 'Modo PRUEBA completado - Revisa la captura para verificar los datos',
                            screenshotPath: resultado.screenshotPath,
                            resultados: [{
                                success: true,
                                modoTest: true,
                                numeroFactura: indiceGlobal,
                                message: 'Modo prueba - factura NO confirmada'
                            }]
                        };
                    }

                    // IMPORTANTE: el manager NO lanza excepción cuando falla; atrapa
                    // el error y devuelve { success:false }. Por eso hay que mirar
                    // resultado.success en vez de asumir éxito por no haber throw.
                    // (Si no, en un equipo donde la automatización falla —p. ej. el
                    // .exe en Windows— se reportaba "factura realizada" sin serlo.)
                    const detalle = resultado?.data?.resultados?.[0] || {};
                    const pdfPath = detalle.pdfPath || resultado?.pdfPath || null;
                    const exito = !!resultado && resultado.success === true;

                    if (!exito) {
                        const mensajeError = detalle.error
                            || resultado?.message
                            || 'La factura no se pudo generar (AFIP no confirmó el comprobante)';

                        event.sender.send('facturaTipificada:progreso', {
                            actual: indiceGlobal,
                            total: totalComprobantes,
                            numeroFactura: indiceGlobal,
                            descripcion: descripcion,
                            status: 'error',
                            mensaje: mensajeError
                        });

                        console.warn(`[${indiceGlobal}/${totalComprobantes}] Comprobante NO generado: ${mensajeError}`);

                        resultados.push({
                            success: false,
                            numeroFactura: indiceGlobal,
                            message: mensajeError,
                            error: mensajeError
                        });

                        // Pausa antes del siguiente, igual que en el caso exitoso.
                        if (indiceGlobal < totalComprobantes) {
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                        continue;
                    }

                    // Notificar exito
                    event.sender.send('facturaTipificada:progreso', {
                        actual: indiceGlobal,
                        total: totalComprobantes,
                        numeroFactura: indiceGlobal,
                        descripcion: descripcion,
                        status: 'completada',
                        mensaje: resultado.message || 'Completada',
                        pdfPath: pdfPath
                    });

                    console.log(`[${indiceGlobal}/${totalComprobantes}] Comprobante generado exitosamente`);

                    resultados.push({
                        success: true,
                        numeroFactura: indiceGlobal,
                        message: resultado.message,
                        pdfPath: pdfPath
                    });

                    // Pausa de 2 segundos entre comprobantes (excepto el ultimo)
                    if (indiceGlobal < totalComprobantes) {
                        console.log('Pausa de 2 segundos antes del siguiente comprobante...');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                } catch (error) {
                    console.error(`[${indiceGlobal}/${totalComprobantes}] Error en comprobante:`, error);

                    // Notificar error
                    event.sender.send('facturaTipificada:progreso', {
                        actual: indiceGlobal,
                        total: totalComprobantes,
                        numeroFactura: indiceGlobal,
                        descripcion: descripcion,
                        status: 'error',
                        mensaje: error.message
                    });

                    resultados.push({
                        success: false,
                        numeroFactura: indiceGlobal,
                        message: error.message,
                        error: error.toString()
                    });

                    // Continuar con el siguiente comprobante aunque este haya fallado
                }
            }
        }

        // Resumen final
        const exitosas = resultados.filter(r => r.success).length;
        const fallidas = resultados.filter(r => !r.success).length;

        console.log(`\nRESUMEN DEL LOTE:`);
        console.log(`   Total: ${resultados.length}`);
        console.log(`   Exitosas: ${exitosas}`);
        console.log(`   Fallidas: ${fallidas}\n`);

        // Una sola entrada-resumen por lote (no una por comprobante: sería ruido).
        const estadoLote = fallidas === 0 ? 'exito' : (exitosas === 0 ? 'error' : 'parcial');
        historialRepo.registrar({
            dominio: 'factura', accion: 'generarLote', estado: estadoLote,
            cliente: clienteFactura(usuario),
            resumen: `Lote de facturas: ${exitosas} ok, ${fallidas} fallida/s`,
            detalle: { total: resultados.length, exitosas, fallidas }
        });

        return {
            success: true,
            message: `Lote procesado: ${exitosas} exitosas, ${fallidas} fallidas`,
            resultados: resultados,
            resumen: {
                total: resultados.length,
                exitosas: exitosas,
                fallidas: fallidas
            }
        };
    });

    // ========================================
    // FLUJO NUEVO: FACTURAS DE CLIENTE
    // ========================================

    // Handler: facturaCliente:generar
    // Genera facturas de cliente con progreso en tiempo real
    ipcMain.handle('facturaCliente:generar', async (event, datos) => {
        console.log('--- DATOS RECIBIDOS (facturaCliente:generar) ---');
        console.log(JSON.stringify(datos, null, 2));
        console.log('-------------------------------------------------');

        const { usuarioSeleccionado, facturas, modoTest, ...datosComunes } = datos;

        if (!usuarioSeleccionado) {
            return {
                success: false,
                message: 'No se recibio informacion del usuario seleccionado'
            };
        }

        // Modelo plano: el login lo resuelve el backend (representante si aplica).
        const acceso = await repo.resolverAcceso(String(usuarioSeleccionado.cuit || usuarioSeleccionado.cuil), 'afip');
        if (!acceso) {
            return {
                success: false,
                message: 'El contribuyente no tiene acceso AFIP (ni clave propia ni representante)'
            };
        }
        const credenciales = {
            usuario: acceso.loginCuit,
            contrasena: acceso.loginClave,
            nombreEmpresa: acceso.objetivoNombre
        };

        try {
            // Funcion callback para enviar progreso
            const enviarProgreso = (datosProgreso) => {
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('facturaCliente:progreso', datosProgreso);
                }
            };

            // Preparar datos para el flujo (pueden ser array o objeto unico)
            const datosParaFlujo = facturas || datos;

            // Agregar modulo para que el unificado detecte el tipo
            if (Array.isArray(datosParaFlujo)) {
                datosParaFlujo.forEach(f => f.modulo = 'facturaCliente');
            } else {
                datosParaFlujo.modulo = 'facturaCliente';
            }

            // Ejecutar el flujo de facturacion usando el manager unificado
            const resultado = await facturaManagerUnificado.iniciarProceso(
                'https://auth.afip.gob.ar/contribuyente_/login.xhtml',
                credenciales,
                datosParaFlujo,
                modoTest || false,
                usuarioSeleccionado,
                // Priorizar el puntoVenta elegido en el selector frontend.
                datosComunes.puntoVenta || listarRazonesSociales(usuarioSeleccionado)[0] || '0001',
                enviarProgreso
            );

            // Enviar resultado final
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('facturaCliente:resultado', resultado);
            }

            historialRepo.registrar({
                dominio: 'factura', accion: 'generarCliente', estado: resultado?.success ? 'exito' : 'error',
                cliente: clienteFactura(usuarioSeleccionado),
                resumen: resultado?.success ? 'Factura(s) de cliente generada(s)' : 'Fallo al generar factura de cliente',
                error: resultado?.success ? null : (resultado?.message || null)
            });

            return resultado;

        } catch (error) {
            console.error('Error en facturaCliente:generar:', error);

            const errorResult = {
                success: false,
                message: error.message,
                error: error.toString()
            };

            // Enviar resultado de error
            if (event.sender && !event.sender.isDestroyed()) {
                event.sender.send('facturaCliente:resultado', errorResult);
            }

            historialRepo.registrar({
                dominio: 'factura', accion: 'generarCliente', estado: 'error',
                cliente: clienteFactura(usuarioSeleccionado),
                resumen: 'Fallo al generar factura de cliente', error: error.message
            });

            return errorResult;
        }
    });
}

module.exports = setupFacturaHandlers;
