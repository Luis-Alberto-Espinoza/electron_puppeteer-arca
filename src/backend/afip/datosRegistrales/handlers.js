// afip/datosRegistrales/handlers.js
// Handler IPC de Datos registrales (lote).
//
// El front manda los contribuyentes elegidos; acá se agrupan por LOGIN (el resolver
// dice con qué clave entra cada uno: la propia o la del representante). Un navegador
// y un login por grupo; dentro, Sistema Registral elige la persona de cada uno.
//
// datos = { contribuyentes: [{ id, cuit, nombre }], visible }
// Progreso por 'datosRegistrales:update': { tipo: 'progreso'|'resultado'|'finalizado', ... }

const datosRegistralesManager = require('./datosRegistralesManager.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { crearCorteCaptchaAfip } = require('../corteCaptchaAfip.js');
const { historialRepo } = require('../../historial/historialRepo.js');

function setupDatosRegistralesHandlers(ipcMain, mainWindow, app) {
    const repo = getContribuyenteRepo();

    ipcMain.handle('datosRegistrales:procesar', async (_event, datos) => {
        const { contribuyentes, visible } = datos || {};
        if (!Array.isArray(contribuyentes) || contribuyentes.length === 0) {
            return { success: false, error: 'MISSING_CONTRIBUYENTES', message: 'No se recibieron contribuyentes para procesar' };
        }

        const total = contribuyentes.length;
        const downloadsPath = app.getPath('downloads');
        const resultados = [];

        const enviar = (msg) => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('datosRegistrales:update', msg);
        };

        // Cierra un contribuyente: lo suma a resultados, avisa al front y al historial.
        const cerrar = (contribuyente, { success, error, message, rutaPdf, downloadDir }) => {
            resultados.push({ contribuyente, success, error, message, rutaPdf, downloadDir });
            enviar({
                tipo: 'resultado', id: contribuyente.id, cuit: contribuyente.cuit, nombre: contribuyente.nombre,
                estado: success ? 'exito' : (error === 'CANCELADO' ? 'cancelado' : 'error'), error, mensaje: message, rutaPdf, downloadDir,
                procesados: resultados.length, total
            });
            historialRepo.registrar({
                dominio: 'datosRegistrales', accion: 'descargar', estado: success ? 'exito' : 'error',
                cliente: { id: contribuyente.id, nombre: contribuyente.nombre, cuit: contribuyente.cuit },
                resumen: success ? 'PDF de datos registrales descargado' : 'Fallo al descargar datos registrales',
                detalle: success ? { archivo: rutaPdf } : null,
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

            try {
                const r = await datosRegistralesManager.procesarGrupo(
                    grupo.credenciales, grupo.items, downloadsPath, onProgreso, { visible }
                );
                corte.registrar(r);
                if (r && r.error === 'CANCELADO') {
                    cancelado = { success: false, error: r.error, message: r.message };
                    const yaCerrados = new Set(resultados.map(x => x.contribuyente.cuit));
                    grupo.items.filter(c => !yaCerrados.has(c.cuit)).forEach(c => cerrar(c, cancelado));
                } else if (!r || r.success === false) {
                    // Falló el login (o el navegador): nadie del grupo se procesó.
                    const msg = r && r.error === 'NAVEGADOR_CERRADO'
                        ? r.message
                        : `No se pudo entrar con el CUIT ${loginCuit}: ${(r && r.message) || 'error desconocido'}`;
                    const yaCerrados = new Set(resultados.map(x => x.contribuyente.cuit));
                    const error = (r && r.error) || 'LOGIN_FAILED';
                    grupo.items.filter(c => !yaCerrados.has(c.cuit)).forEach(c => cerrar(c, { success: false, error, message: msg }));
                }
            } catch (e) {
                const yaCerrados = new Set(resultados.map(x => x.contribuyente.cuit));
                grupo.items.filter(c => !yaCerrados.has(c.cuit)).forEach(c => cerrar(c, { success: false, error: 'UNEXPECTED_ERROR', message: e.message }));
            }
        }

        const exitosos = resultados.filter(r => r.success).length;
        const cancelados = resultados.filter(r => r.error === 'CANCELADO').length;
        enviar({ tipo: 'finalizado', total, exitosos, fallidos: total - exitosos - cancelados, cancelados });
        return { success: true, resultados };
    });
}

module.exports = setupDatosRegistralesHandlers;
