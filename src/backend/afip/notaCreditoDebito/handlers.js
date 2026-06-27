// afip/notaCreditoDebito/handlers.js
// IPC handlers para el flujo de Notas de Crédito/Débito (capa de datos):
//   - listar los Excel de consulta disponibles para el emisor
//   - leer un Excel y devolver sus facturas estructuradas
// La generación de las notas reusa el flujo de Factura Tipificada (otro dominio).

const fs = require('fs');
const { dialog } = require('electron');
const { getDownloadPathContribuyente } = require('../../cliente/carpetaContribuyente.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { listarExcelsConsulta } = require('./service/listarExcelsConsulta.js');
const { leerExcelComprobantes } = require('./service/leerExcelComprobantes.js');
const { armarNotaDesdeFactura } = require('./service/armarNotaDesdeFactura.js');
const facturaManagerUnificado = require('../factura/facturaManagerUnificado.js');
const { listarRazonesSociales } = require('../../cliente/model.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} userStorage
 * @param {Electron.App} app
 */
function setupNotaCreditoDebitoHandlers(ipcMain, userStorage, app) {
    const repo = getContribuyenteRepo();

    // Lista los Excel de consulta del emisor (más reciente primero). Lista vacía
    // = el frontend bloquea la generación de notas con mensaje claro.
    ipcMain.handle('notaCreditoDebito:listarExcels', async (event, datos) => {
        try {
            const { usuario } = datos || {};
            if (!usuario || !usuario.id) {
                return { success: false, error: 'MISSING_USER', message: 'Falta el usuario.' };
            }

            const dataBD = userStorage.loadData();
            const usuarioCompleto = dataBD.users.find(u => String(u.id) === String(usuario.id));
            if (!usuarioCompleto) {
                return { success: false, error: 'USER_NOT_FOUND', message: 'No se encontró el usuario en la base.' };
            }

            const downloadsPath = app.getPath('downloads');
            const excels = await listarExcelsConsulta(downloadsPath, {
                cuit: usuarioCompleto.cuit,
                nombre: usuarioCompleto.nombre,
                apellido: usuarioCompleto.apellido
            });

            return { success: true, excels };

        } catch (error) {
            console.error('BACKEND: Error en notaCreditoDebito:listarExcels:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });

    // Abre un buscador de archivos para que el usuario elija el Excel de consulta
    // a mano. Es la vía robusta cuando la lista automática no lo encuentra
    // (carpeta distinta, datos viejos): devuelve la ruta y el frontend la usa
    // igual que una opción del select. Abre por defecto en la carpeta canónica
    // del contribuyente si nos pasan el cuit.
    ipcMain.handle('notaCreditoDebito:elegirExcel', async (event, datos) => {
        try {
            const { cuit, nombre } = datos || {};
            let defaultPath;
            if (cuit) {
                try {
                    defaultPath = await getDownloadPathContribuyente(
                        app.getPath('downloads'), cuit, nombre, 'archivos_afip'
                    );
                } catch (_) { /* sin defaultPath: el diálogo abre donde el SO decida */ }
            }

            const r = await dialog.showOpenDialog({
                title: 'Elegí el Excel de consulta',
                defaultPath,
                properties: ['openFile'],
                filters: [{ name: 'Excel', extensions: ['xlsx'] }]
            });
            if (r.canceled || !r.filePaths || !r.filePaths.length) {
                return { success: false, canceled: true };
            }
            return { success: true, archivo: r.filePaths[0] };

        } catch (error) {
            console.error('BACKEND: Error en notaCreditoDebito:elegirExcel:', error);
            return { success: false, error: 'DIALOG_ERROR', message: error.message };
        }
    });

    // Lee un Excel de consulta y devuelve sus facturas estructuradas.
    ipcMain.handle('notaCreditoDebito:leerExcel', async (event, datos) => {
        try {
            const { ruta } = datos || {};
            if (!ruta) {
                return { success: false, error: 'MISSING_PATH', message: 'Falta la ruta del Excel.' };
            }
            if (!ruta.toLowerCase().endsWith('.xlsx') || !fs.existsSync(ruta)) {
                return { success: false, error: 'FILE_NOT_FOUND', message: 'El Excel no existe o no es un .xlsx válido.' };
            }

            const { facturas, leidasTotal } = leerExcelComprobantes(ruta);
            return { success: true, facturas, leidasTotal };

        } catch (error) {
            console.error('BACKEND: Error en notaCreditoDebito:leerExcel:', error);
            return { success: false, error: 'PARSE_ERROR', message: error.message };
        }
    });

    // Genera el lote de notas: arma cada NC/ND desde su factura del Excel (paso 3)
    // y la emite reusando el mismo motor que Factura Tipificada (manager unificado).
    // Robusto: si una falla, NO corta el lote (la registra y sigue). Modo prueba:
    // procesa solo la primera sin confirmar (igual que el modoTest de facturas).
    ipcMain.handle('notaCreditoDebito:generarNotas', async (event, datos) => {
        try {
            const { usuario, nombreEmpresa, tipoNota, fechaComprobante, modoTest, notas } = datos || {};

            if (!usuario || !usuario.id) {
                return { success: false, error: 'MISSING_USER', message: 'Falta el usuario.' };
            }
            if (!Array.isArray(notas) || notas.length === 0) {
                return { success: false, message: 'No hay notas para generar.' };
            }

            const dataBD = userStorage.loadData();
            const usuarioCompleto = dataBD.users.find(u => String(u.id) === String(usuario.id));
            if (!usuarioCompleto) {
                return { success: false, error: 'USER_NOT_FOUND', message: 'No se encontró el usuario en la base.' };
            }

            // Modelo plano: el login lo resuelve el backend (representante si aplica).
            // No se confía en la claveAFIP del objeto gordo — un representado como
            // El Papi no tiene clave propia y entra por su representante (Debora).
            const acceso = await repo.resolverAcceso(String(usuarioCompleto.cuit || usuarioCompleto.cuil), 'afip');
            if (!acceso) {
                return { success: false, message: 'El contribuyente no tiene acceso AFIP (ni clave propia ni representante).' };
            }
            const credenciales = {
                usuario: acceso.loginCuit,
                contrasena: acceso.loginClave,
                nombreEmpresa: nombreEmpresa || acceso.objetivoNombre
            };

            const total = notas.length;
            const resultados = [];

            // Reusamos el canal de progreso de Factura Tipificada (el frontend ya lo escucha).
            const enviarProgreso = (payload) => {
                if (event.sender && !event.sender.isDestroyed()) {
                    event.sender.send('facturaTipificada:progreso', payload);
                }
            };

            for (let i = 0; i < notas.length; i++) {
                const idx = i + 1;
                const nota = notas[i] || {};
                const factura = nota.factura || {};
                let descripcion = `${factura.tipoComprobante || 'Factura'} ${factura.puntoVenta}-${factura.comprobanteNumero}`;

                try {
                    // Armar la nota (líneas por alícuota, comprobante asociado, letra).
                    const { data, warnings } = armarNotaDesdeFactura(factura, {
                        tipoNota,
                        fechaComprobante,
                        montoOverride: nota.montoOverride,
                        puntoVenta: factura.puntoVenta
                    });
                    if (warnings && warnings.length) {
                        console.warn(`[${idx}/${total}] Avisos al armar la nota:`, warnings);
                    }
                    descripcion = data.lineasDetalle[0]?.descripcion || descripcion;

                    enviarProgreso({
                        actual: idx, total, numeroFactura: idx, descripcion,
                        status: 'en_progreso', mensaje: 'Generando nota...'
                    });

                    // Modo prueba: solo la primera nota, sin confirmar.
                    const usarModoTest = idx === 1 && !!modoTest;

                    const datosFactura = { ...data, usuarioSeleccionado: usuarioCompleto, modulo: 'facturaCliente' };

                    const resultado = await facturaManagerUnificado.iniciarProceso(
                        URL_LOGIN_AFIP,
                        credenciales,
                        datosFactura,
                        usarModoTest,
                        usuarioCompleto,
                        factura.puntoVenta || listarRazonesSociales(usuarioCompleto)[0] || '0001'
                    );

                    if (usarModoTest) {
                        return {
                            success: true,
                            modoTest: true,
                            message: 'Modo PRUEBA completado - Revisá la captura para verificar los datos',
                            screenshotPath: resultado.screenshotPath,
                            resultados: [{ success: true, modoTest: true, numeroFactura: idx, message: 'Modo prueba - nota NO confirmada' }]
                        };
                    }

                    // El manager NO tira excepción al fallar: devuelve { success:false }.
                    const detalle = resultado?.data?.resultados?.[0] || {};
                    const pdfPath = detalle.pdfPath || resultado?.pdfPath || null;
                    const exito = !!resultado && resultado.success === true;

                    if (!exito) {
                        const mensajeError = detalle.error
                            || resultado?.message
                            || 'La nota no se pudo generar (AFIP no confirmó el comprobante)';
                        enviarProgreso({ actual: idx, total, numeroFactura: idx, descripcion, status: 'error', mensaje: mensajeError });
                        resultados.push({ success: false, numeroFactura: idx, message: mensajeError, error: mensajeError });
                        if (idx < total) await new Promise(r => setTimeout(r, 2000));
                        continue;
                    }

                    enviarProgreso({ actual: idx, total, numeroFactura: idx, descripcion, status: 'completada', mensaje: resultado.message || 'Completada', pdfPath });
                    resultados.push({ success: true, numeroFactura: idx, message: resultado.message, pdfPath });

                    if (idx < total) await new Promise(r => setTimeout(r, 2000));

                } catch (error) {
                    console.error(`[${idx}/${total}] Error en nota:`, error);
                    enviarProgreso({ actual: idx, total, numeroFactura: idx, descripcion, status: 'error', mensaje: error.message });
                    resultados.push({ success: false, numeroFactura: idx, message: error.message, error: error.toString() });
                    // Seguir con la siguiente aunque esta haya fallado (lote robusto).
                }
            }

            const exitosas = resultados.filter(r => r.success).length;
            const fallidas = resultados.filter(r => !r.success).length;
            console.log(`\nRESUMEN LOTE NOTAS: total ${resultados.length}, exitosas ${exitosas}, fallidas ${fallidas}\n`);

            return {
                success: true,
                message: `Lote de notas procesado: ${exitosas} exitosas, ${fallidas} fallidas`,
                resultados,
                resumen: { total: resultados.length, exitosas, fallidas }
            };

        } catch (error) {
            console.error('BACKEND: Error en notaCreditoDebito:generarNotas:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });
}

module.exports = setupNotaCreditoDebitoHandlers;
