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
const { loteEnUnaSesion } = require('../factura/corteLote.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {Electron.App} app
 */
function setupNotaCreditoDebitoHandlers(ipcMain, app) {
    const repo = getContribuyenteRepo();

    // Lista los Excel de consulta del emisor (más reciente primero). Lista vacía
    // = el frontend bloquea la generación de notas con mensaje claro.
    ipcMain.handle('notaCreditoDebito:listarExcels', async (event, datos) => {
        try {
            const { usuario } = datos || {};
            if (!usuario || !usuario.id) {
                return { success: false, error: 'MISSING_USER', message: 'Falta el usuario.' };
            }

            const contribuyente = await repo.getById(usuario.id);
            if (!contribuyente) {
                return { success: false, error: 'USER_NOT_FOUND', message: 'No se encontró el usuario en la base.' };
            }

            const downloadsPath = app.getPath('downloads');
            const excels = await listarExcelsConsulta(downloadsPath, {
                cuit: contribuyente.cuit,
                nombre: contribuyente.nombre || contribuyente.razonSocial,
                apellido: contribuyente.apellido
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
            // Archivo de ENTRADA al log del día (ver nombreNuevoFlujo.md §11).
            console.log(`[Notas de crédito/débito] Archivo de entrada: ${ruta}`);
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
    // y las emite todas en UN login con el mismo motor que Factura Tipificada.
    // Robusto: si una falla, NO corta el lote (la registra y sigue). Modo prueba:
    // procesa solo la primera sin confirmar (igual que el modoTest de facturas).
    ipcMain.handle('notaCreditoDebito:generarNotas', async (event, datos) => {
        try {
            const { usuario, nombreEmpresa, tipoNota, fechaComprobante, modoTest, notas, visible } = datos || {};

            if (!usuario || !usuario.id) {
                return { success: false, error: 'MISSING_USER', message: 'Falta el usuario.' };
            }
            if (!Array.isArray(notas) || notas.length === 0) {
                return { success: false, message: 'No hay notas para generar.' };
            }

            const contribuyente = await repo.getById(usuario.id);
            if (!contribuyente) {
                return { success: false, error: 'USER_NOT_FOUND', message: 'No se encontró el usuario en la base.' };
            }

            // Modelo plano: el login lo resuelve el backend (representante si aplica).
            // Un representado como El Papi no tiene clave propia y entra por su
            // representante (Debora).
            const acceso = await repo.resolverAcceso(String(contribuyente.cuit), 'afip');
            // El motor de factura usa cuit/tipoContribuyente/nombre (este último solo de
            // respaldo para la carpeta). Jurídica no tiene nombre: va la razón social.
            const usuarioFactura = { ...contribuyente, nombre: contribuyente.nombre || contribuyente.razonSocial };
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

            // Armar cada nota (líneas por alícuota, comprobante asociado, letra). La
            // que no se puede armar queda fallida sin gastar AFIP; el resto va en UN login.
            const armadas = [];
            notas.forEach((nota, i) => {
                const factura = (nota || {}).factura || {};
                try {
                    const { data, warnings } = armarNotaDesdeFactura(factura, {
                        tipoNota,
                        fechaComprobante,
                        montoOverride: nota.montoOverride,
                        puntoVenta: factura.puntoVenta,
                        cuitEmisor: contribuyente.cuit
                    });
                    if (warnings && warnings.length) {
                        console.warn(`[${i + 1}/${total}] Avisos al armar la nota:`, warnings);
                    }
                    armadas.push({
                        indice: i,
                        cliente: (factura.razonSocialReceptor || '').trim() || factura.cuitReceptor || '',
                        datosFactura: { ...data, usuarioSeleccionado: usuarioFactura, modulo: 'facturaCliente' },
                        puntoVenta: factura.puntoVenta
                    });
                } catch (error) {
                    console.error(`[${i + 1}/${total}] No se pudo armar la nota:`, error.message);
                    resultados.push({ success: false, indice: i, numeroFactura: i + 1, message: error.message, error: error.message });
                }
            });

            // Modo prueba: solo la primera nota, sin confirmar.
            const aCorrer = modoTest ? armadas.slice(0, 1) : armadas;
            let cortadoPor = null;

            if (aCorrer.length) {
                const corrida = await loteEnUnaSesion({
                    sender: event.sender, canal: 'facturaTipificada:update', queEs: 'Nota',
                    nombres: aCorrer.map(n => n.cliente),
                    correr: (enviarProgreso) => facturaManagerUnificado.iniciarProceso(
                        URL_LOGIN_AFIP,
                        credenciales,
                        aCorrer.map(n => n.datosFactura),
                        !!modoTest,
                        usuarioFactura,
                        aCorrer[0].puntoVenta || '0001',
                        enviarProgreso,
                        { visible } // una sola elección para todo el lote
                    )
                });
                cortadoPor = corrida.cortadoPor;
                const resultado = corrida.resultado;

                if (modoTest) {
                    if (cortadoPor || !resultado || resultado.success === false) {
                        return { success: false, modoTest: true, error: resultado?.error,
                            message: resultado?.message || 'La nota de prueba no se pudo generar.' };
                    }
                    return {
                        success: true,
                        modoTest: true,
                        message: 'Modo PRUEBA completado - Revisá la captura para verificar los datos',
                        screenshotPath: resultado.screenshotPath,
                        resultados: [{ success: true, modoTest: true, numeroFactura: aCorrer[0].indice + 1, message: 'Modo prueba - nota NO confirmada' }]
                    };
                }

                corrida.resultados.forEach((r, j) => {
                    if (!r) return; // no se intentó
                    const i = aCorrer[j].indice;
                    const mensaje = r.success ? 'Nota generada' : (r.error || r.message || 'La nota no se pudo generar');
                    resultados.push({
                        success: !!r.success, indice: i, numeroFactura: i + 1, message: mensaje,
                        ...(r.success ? { pdfPath: r.pdfPath || null } : { dudosa: !!r.dudosa, error: mensaje }),
                        ...(r.cortado ? { cortado: r.cortado } : {})
                    });
                });
                resultados.sort((a, b) => a.indice - b.indice);
            } else if (modoTest) {
                return { success: false, modoTest: true, message: resultados[0]?.message || 'No se pudo armar la nota de prueba.' };
            }

            const exitosas = resultados.filter(r => r.success).length;
            const fallidas = resultados.filter(r => !r.success).length;
            console.log(`\nRESUMEN LOTE NOTAS: total ${resultados.length}, exitosas ${exitosas}, fallidas ${fallidas}\n`);

            return {
                success: true,
                message: `Lote de notas procesado: ${exitosas} exitosas, ${fallidas} fallidas`,
                resultados,
                // 'cancelado' | 'cerrado' | null: las notas sin resultado no se intentaron.
                cortadoPor,
                resumen: { total: resultados.length, exitosas, fallidas }
            };

        } catch (error) {
            console.error('BACKEND: Error en notaCreditoDebito:generarNotas:', error);
            return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
        }
    });
}

module.exports = setupNotaCreditoDebitoHandlers;
