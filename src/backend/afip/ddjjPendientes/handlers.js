// afip/ddjjPendientes/handlers.js
// Handler IPC de DDJJ pendientes (lote).
//
// El front manda los contribuyentes elegidos; acá se agrupan por LOGIN (el resolver
// dice con qué clave entra cada uno: la propia o la del representante). Un navegador,
// un login y una pestaña de Seti por grupo; dentro, cada cliente se elige en el desplegable.
//
// datos = { contribuyentes: [{ id, cuit, nombre }], visible }
// Progreso por 'ddjjPendientes:update': { tipo: 'progreso'|'resultado'|'finalizado', ... }
// En 'resultado': pendientes (vacío = al día: solo Excel), rutaPdf, rutaExcel, downloadDir, aviso.

const ddjjPendientesManager = require('./ddjjPendientesManager.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { crearCorteCaptchaAfip } = require('../corteCaptchaAfip.js');
const { historialRepo } = require('../../historial/historialRepo.js');

function setupDdjjPendientesHandlers(ipcMain, mainWindow, app) {
    const repo = getContribuyenteRepo();

    ipcMain.handle('ddjjPendientes:procesar', async (_event, datos) => {
        const { contribuyentes, visible } = datos || {};
        if (!Array.isArray(contribuyentes) || contribuyentes.length === 0) {
            return { success: false, error: 'MISSING_CONTRIBUYENTES', message: 'No se recibieron contribuyentes para consultar' };
        }

        const total = contribuyentes.length;
        const downloadsPath = app.getPath('downloads');
        const resultados = [];

        const enviar = (msg) => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ddjjPendientes:update', msg);
        };

        // Cierra un contribuyente: lo suma a resultados, avisa al front y al historial.
        const cerrar = (contribuyente, { success, error, message, pendientes = [], rutaPdf, rutaExcel, downloadDir, aviso }) => {
            resultados.push({ contribuyente, success, error });
            enviar({
                tipo: 'resultado', id: contribuyente.id, cuit: contribuyente.cuit, nombre: contribuyente.nombre,
                estado: success ? (pendientes.length ? 'pendientes' : 'exito') : (error === 'CANCELADO' ? 'cancelado' : 'error'),
                error, mensaje: message, pendientes, rutaPdf, rutaExcel, downloadDir, aviso,
                procesados: resultados.length, total
            });
            historialRepo.registrar({
                dominio: 'ddjjPendientes', accion: 'consultar', estado: success ? 'exito' : 'error',
                cliente: { id: contribuyente.id, nombre: contribuyente.nombre, cuit: contribuyente.cuit },
                resumen: success
                    ? (pendientes.length ? `${pendientes.length} DDJJ pendiente(s); PDF y Excel descargados` : 'Sin DDJJ pendientes; Excel de constancia')
                    : 'Fallo al consultar DDJJ pendientes',
                detalle: success && (rutaPdf || rutaExcel) ? { archivo: rutaPdf || rutaExcel, excel: rutaExcel } : null,
                error: success ? null : message
            });
        };

        // 1. Agrupar por login (orden de llegada)
        const grupos = new Map(); // loginCuit → { credenciales, items }
        for (const c of contribuyentes) {
            const contribuyente = { id: c.id, cuit: String(c.cuit), nombre: c.nombre };
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
        let cancelado = null; // "⏹ Cancelar" del lanzador: los grupos que faltan no arrancan
        for (const [loginCuit, grupo] of grupos) {
            if (cancelado) {
                grupo.items.forEach(c => cerrar(c, cancelado));
                continue;
            }
            if (corte.activo) {
                grupo.items.forEach(c => cerrar(c, { success: false, error: 'CAPTCHA_BLOQUEO', message: corte.mensaje }));
                continue;
            }

            const onProgreso = ({ tipo, contribuyente, ...resto }) => {
                // Tras "⏹ Cancelar" el flujo sigue un rato por detrás: sus avisos ya no cuentan.
                if (cancelado) return;
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
                const r = await ddjjPendientesManager.procesarGrupo(
                    grupo.credenciales, grupo.items, downloadsPath, onProgreso, { visible }
                );
                corte.registrar(r);
                if (r && r.error === 'CANCELADO') {
                    cancelado = { success: false, error: r.error, message: r.message };
                    pendientesDelGrupo().forEach(c => cerrar(c, cancelado));
                } else if (!r || r.success === false) {
                    // Falló el login o no abrió Seti: nadie del grupo se procesó.
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
        const cancelados = resultados.filter(r => r.error === 'CANCELADO').length;
        enviar({ tipo: 'finalizado', total, exitosos, fallidos: total - exitosos - cancelados, cancelados });
        return { success: true };
    });
}

module.exports = setupDdjjPendientesHandlers;
