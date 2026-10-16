// afip/importarLibroIva/handlers.js
// Handler IPC de Importar Libro IVA (lote).
//
// El front manda los contribuyentes elegidos y el período; acá se agrupan por LOGIN (el
// resolver dice con qué clave entra cada uno: la propia o la del representante). Un
// navegador y un login por grupo.
//
// datos = { contribuyentes: [{ id, cuit, nombre }], periodo: 'AAAAMM', visible }
// Progreso por 'importarLibroIva:update': { tipo: 'progreso'|'resultado'|'finalizado', ... }
// En 'resultado': ventas / compras = { success, encontrados, agregados, yaExistentes,
// noImportados, totalLibro, rutaExcel, aviso } o { success:false, message }, y downloadDir.
//
// No vive en afip/libroIVA/: esa carpeta es el Libro IVA local (otro servicio) y en Windows
// libroIva y libroIVA serían la misma carpeta.

const importarLibroIvaManager = require('./importarLibroIvaManager.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { crearCorteCaptchaAfip } = require('../corteCaptchaAfip.js');
const { historialRepo } = require('../../historial/historialRepo.js');

function resumenLibro(nombre, l) {
    if (!l) return null;
    return l.success
        ? `${nombre}: ${l.encontrados} encontrados, ${l.agregados} agregados`
        : `${nombre}: error`;
}

function setupImportarLibroIvaHandlers(ipcMain, mainWindow, app) {
    const repo = getContribuyenteRepo();

    ipcMain.handle('importarLibroIva:procesar', async (_event, datos) => {
        const { contribuyentes, periodo, visible } = datos || {};
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
        const cerrar = (contribuyente, { success, error, message, ventas, compras, downloadDir }) => {
            resultados.push({ contribuyente, success });
            enviar({
                tipo: 'resultado', id: contribuyente.id, cuit: contribuyente.cuit, nombre: contribuyente.nombre,
                estado: success ? 'exito' : 'error',
                error, mensaje: message, ventas, compras, downloadDir,
                procesados: resultados.length, total
            });
            historialRepo.registrar({
                dominio: 'importarLibroIva', accion: 'importar', estado: success ? 'exito' : 'error',
                cliente: { id: contribuyente.id, nombre: contribuyente.nombre, cuit: contribuyente.cuit },
                resumen: [`Período ${periodo.slice(4, 6)}/${periodo.slice(0, 4)}`, resumenLibro('Ventas', ventas), resumenLibro('Compras', compras)]
                    .filter(Boolean).join(' · '),
                detalle: downloadDir ? { periodo, carpeta: downloadDir } : { periodo },
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
                    grupo.credenciales, grupo.items, { periodo, downloadsPath }, onProgreso, { visible }
                );
                corte.registrar(r);
                if (!r || r.success === false) {
                    const msg = `No se pudo entrar con el CUIT ${loginCuit}: ${(r && r.message) || 'error desconocido'}`;
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
