// afip/importarLibroIva/handlers.js
// Handler IPC de Importar Libro IVA (lote).
//
// El front manda los contribuyentes elegidos y el período; acá se agrupan por LOGIN (el
// resolver dice con qué clave entra cada uno: la propia o la del representante). Un
// navegador y un login por grupo.
//
// datos = { contribuyentes: [{ id, cuit, nombre, origen?, archivos?, descartarPeriodo?, datosIniciales? }],
//          periodo: 'AAAAMM', visible, descartarBorrador, soloVistaPrevia }
//   soloVistaPrevia: no importa nada (ni valida archivos): abre la Vista Previa de cada cliente y
//   deja el navegador abierto para revisarla a mano.
//   origen: 'arca' (importa desde ARCA, por defecto) o 'archivos' (los txt en `archivos`, rutas; Ventas, Compras o los dos):
//   los txt se validan acá, ANTES del login; el que falla no entra al lote. respaldo: true = Excel
//   de lo que había antes de "Eliminar todo" (si no se pide, no se genera).
//   datosIniciales también puede venir de la Preparación (se usa solo si ARCA los pide).
//   descartarBorrador: casilla del formulario (descarta el borrador de otro período, sea cual sea).
//   descartarPeriodo / datosIniciales: lo que el usuario respondió en Resultados (reintento de un cliente).
// Progreso por 'importarLibroIva:update': { tipo: 'progreso'|'resultado'|'finalizado', ... }
// En 'resultado': ventas / compras = { success, encontrados, agregados, yaExistentes,
// noImportados, totalLibro, rutaExcel, aviso } o { success:false, message }, y downloadDir.
// Con origen 'archivos' además: origen, eliminados (lo que había) y rutaRespaldo (su Excel).
// También: borradorDescartado ('AAAAMM'), datosInicialesCargados y, con error, periodoBorrador
// (BORRADOR_OTRO_PERIODO) o datosIniciales (DATOS_INICIALES_PENDIENTES) para preguntar.
//
// En pantalla se llama "Portal IVA"; adentro (carpetas, IPC, dominio del Historial) sigue
// siendo importarLibroIva para no romper el historial ya guardado.

const { dialog } = require('electron');
const importarLibroIvaManager = require('./importarLibroIvaManager.js');
const { validarArchivosIva } = require('./service/validarArchivosIva.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { crearCorteCaptchaAfip } = require('../corteCaptchaAfip.js');
const { historialRepo } = require('../../historial/historialRepo.js');

function resumenLibro(nombre, l) {
    if (!l) return null;
    if (!l.success) return `${nombre}: error`;
    if (l.sinArchivos) return `${nombre}: sin archivos, no se tocó (${l.totalLibro} en ARCA)`;
    return l.origen === 'archivos'
        ? `${nombre}: desde archivos, ${l.agregados} agregados${l.noImportados ? `, ${l.noImportados} con error` : ''}${l.eliminados ? `, ${l.eliminados} eliminados antes` : ''}`
        : `${nombre}: ${l.encontrados} encontrados, ${l.agregados} agregados`;
}

function setupImportarLibroIvaHandlers(ipcMain, mainWindow, app) {
    const repo = getContribuyenteRepo();

    // Preparación: elegir los txt de un cliente y validarlos sin login.
    ipcMain.handle('importarLibroIva:elegirArchivos', async () => {
        const r = await dialog.showOpenDialog(mainWindow, {
            title: 'Los archivos del Libro IVA Digital (Ventas y/o Compras)',
            properties: ['openFile', 'multiSelections'],
            filters: [{ name: 'Libro IVA Digital', extensions: ['txt'] }]
        });
        return r.canceled ? [] : r.filePaths;
    });
    ipcMain.handle('importarLibroIva:validarArchivos', async (_event, { rutas, periodo } = {}) =>
        validarArchivosIva(rutas, periodo));

    ipcMain.handle('importarLibroIva:procesar', async (_event, datos) => {
        const { contribuyentes, periodo, visible, descartarBorrador } = datos || {};
        const soloVistaPrevia = (datos || {}).soloVistaPrevia === true;
        if (!Array.isArray(contribuyentes) || contribuyentes.length === 0) {
            return { success: false, error: 'MISSING_CONTRIBUYENTES', message: 'No se recibieron contribuyentes' };
        }
        if (!/^\d{4}(0[1-9]|1[0-2])$/.test(String(periodo || ''))) {
            return { success: false, error: 'PERIODO_INVALIDO', message: 'Falta el período (mes y año).' };
        }

        const total = contribuyentes.length;
        const downloadsPath = app.getPath('downloads');
        const resultados = [];

        const enviar = (msg) => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('importarLibroIva:update', msg);
        };

        // Cierra un contribuyente: lo suma a resultados, avisa al front y al historial.
        const cerrar = (contribuyente, { success, error, message, ventas, compras, downloadDir, vistaPrevia, sinDeclaracion,
            borradorDescartado, datosInicialesCargados, periodoBorrador, datosIniciales }) => {
            resultados.push({ contribuyente, success });
            enviar({
                tipo: 'resultado', id: contribuyente.id, cuit: contribuyente.cuit, nombre: contribuyente.nombre,
                estado: success ? 'exito' : 'error',
                error, mensaje: message, ventas, compras, downloadDir, vistaPrevia, sinDeclaracion,
                borradorDescartado, datosInicialesCargados, periodoBorrador, datosIniciales,
                procesados: resultados.length, total
            });
            historialRepo.registrar({
                dominio: 'importarLibroIva', accion: soloVistaPrevia ? 'vistaPrevia' : 'importar', estado: success ? 'exito' : 'error',
                cliente: { id: contribuyente.id, nombre: contribuyente.nombre, cuit: contribuyente.cuit },
                resumen: [
                    `Período ${periodo.slice(4, 6)}/${periodo.slice(0, 4)}`,
                    borradorDescartado ? `Borrador ${borradorDescartado.slice(4, 6)}/${borradorDescartado.slice(0, 4)} DESCARTADO` : null,
                    datosInicialesCargados ? 'Datos Iniciales cargados' : null,
                    vistaPrevia ? 'Vista Previa abierta (sin importar)' : null,
                    sinDeclaracion ? 'Sin declaración iniciada: no hay Vista Previa' : null,
                    resumenLibro('Ventas', ventas), resumenLibro('Compras', compras)
                ].filter(Boolean).join(' · '),
                detalle: { periodo, ...(downloadDir ? { carpeta: downloadDir } : {}), ...(borradorDescartado ? { borradorDescartado } : {}) },
                error: success ? null : message
            });
        };

        // 1. Agrupar por login (orden de llegada)
        const grupos = new Map(); // loginCuit → { credenciales, items }
        for (const c of contribuyentes) {
            const contribuyente = { id: c.id, cuit: String(c.cuit), nombre: c.nombre };
            // Respuestas del usuario para este cliente (reintento desde Resultados).
            if (/^\d{6}$/.test(String(c.descartarPeriodo || ''))) contribuyente.descartarPeriodo = String(c.descartarPeriodo);
            if (c.datosIniciales && typeof c.datosIniciales === 'object') contribuyente.datosIniciales = c.datosIniciales;
            if (c.origen === 'archivos' && !soloVistaPrevia) {
                // Se vuelve a validar: el archivo pudo cambiar desde que se eligió.
                const v = validarArchivosIva(c.archivos, periodo);
                if (!v.ok) {
                    cerrar(contribuyente, { success: false, error: 'ARCHIVOS_INVALIDOS', message: `Archivos con errores: ${v.errores.join(' · ')}` });
                    continue;
                }
                contribuyente.origen = 'archivos';
                contribuyente.archivos = v.archivos;
                contribuyente.libros = v.libros;
                contribuyente.respaldo = c.respaldo === true;
            }
            try {
                const acceso = await repo.resolverAcceso(contribuyente.cuit, 'afip');
                if (!acceso) {
                    cerrar(contribuyente, { success: false, error: 'SIN_ACCESO', message: 'Sin acceso AFIP (ni clave propia ni representante con clave)' });
                    continue;
                }
                contribuyente.nombre = acceso.objetivoNombre || contribuyente.nombre;
                if (!grupos.has(acceso.loginCuit)) {
                    grupos.set(acceso.loginCuit, {
                        credenciales: { usuario: acceso.loginCuit, contrasena: acceso.loginClave },
                        items: []
                    });
                }
                grupos.get(acceso.loginCuit).items.push(contribuyente);
            } catch (e) {
                cerrar(contribuyente, { success: false, error: 'UNEXPECTED_ERROR', message: e.message });
            }
        }

        // 2. Un login por grupo. Si AFIP pide captcha, el resto del lote se saltea.
        const corte = crearCorteCaptchaAfip();
        for (const [loginCuit, grupo] of grupos) {
            if (corte.activo) {
                grupo.items.forEach(c => cerrar(c, { success: false, error: 'CAPTCHA_BLOQUEO', message: corte.mensaje }));
                continue;
            }

            const onProgreso = ({ tipo, contribuyente, ...resto }) => {
                if (tipo === 'resultado') return cerrar(contribuyente, resto);
                enviar({
                    tipo, id: contribuyente.id, cuit: contribuyente.cuit, nombre: contribuyente.nombre,
                    estado: 'procesando', mensaje: resto.mensaje, procesados: resultados.length, total
                });
            };

            const pendientesDelGrupo = () => {
                const yaCerrados = new Set(resultados.map(x => x.contribuyente.cuit));
                return grupo.items.filter(c => !yaCerrados.has(c.cuit));
            };

            try {
                const r = await importarLibroIvaManager.procesarGrupo(
                    grupo.credenciales, grupo.items, { periodo, downloadsPath, descartarBorrador: descartarBorrador === true, soloVistaPrevia }, onProgreso, { visible }
                );
                corte.registrar(r);
                if (!r || r.success === false) {
                    const msg = r && r.error === 'NAVEGADOR_CERRADO'
                        ? r.message
                        : `No se pudo entrar con el CUIT ${loginCuit}: ${(r && r.message) || 'error desconocido'}`;
                    const error = (r && r.error) || 'LOGIN_FAILED';
                    pendientesDelGrupo().forEach(c => cerrar(c, { success: false, error, message: msg }));
                }
            } catch (e) {
                pendientesDelGrupo().forEach(c => cerrar(c, { success: false, error: 'UNEXPECTED_ERROR', message: e.message }));
            }
        }

        const exitosos = resultados.filter(r => r.success).length;
        enviar({ tipo: 'finalizado', total, exitosos, fallidos: total - exitosos });
        return { success: true };
    });
}

module.exports = setupImportarLibroIvaHandlers;
