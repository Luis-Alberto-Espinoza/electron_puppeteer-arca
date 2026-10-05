// contribuyenteHandlers.js
// IPC del modelo plano hacia el renderer.
//
//   contribuyente:listar  payload: { servicio? }  → { success, items: ContribuyenteListItem[] }
//   contribuyente:titularClave    payload: { cuit, servicio }        → de quién es la clave (sin la clave)
//   contribuyente:actualizarClave payload: { cuit, servicio, clave } → la guarda en el titular
//   contribuyente:verificarClave  payload: { cuit, servicio }        → login corto (+PDV en facturación)
//   contribuyente:guardarDesdeLanzador payload: { cuit, servicio, clave, nombre } → alta o clave nueva, ya validada
//
// IMPORTANTE: ningún endpoint DEVUELVE claves (actualizarClave solo las recibe)
// (es la regla del contrato). `resolverAcceso` queda backend-only (lo usan los
// handlers de sesión), para que las claves nunca salgan del main process.

const { getContribuyenteRepo } = require('./contribuyenteStore.js');
const { verificarClave } = require('./verificarClave.js');
const { guardarDesdeLanzador } = require('./guardarDesdeLanzador.js');

function setupContribuyenteHandlers(ipcMain) {
    const repo = getContribuyenteRepo();

    ipcMain.handle('contribuyente:listar', async (event, opts) => {
        try {
            const items = await repo.listar(opts || {});
            return { success: true, items };
        } catch (e) {
            console.error('[contribuyente:listar] error:', e.message);
            return { success: false, error: e.message, items: [] };
        }
    });

    // PDV de un contribuyente (cacheados). Solo devuelve los puntos de venta,
    // NO el resto del objeto (que tiene claves).
    ipcMain.handle('contribuyente:puntosDeVenta', async (event, cuit) => {
        try {
            const c = await repo.getByCuit(String(cuit));
            if (!c) return { success: false, error: 'NO_ENCONTRADO', puntosDeVenta: [] };
            return { success: true, puntosDeVenta: c.puntosDeVenta || [] };
        } catch (e) {
            console.error('[contribuyente:puntosDeVenta] error:', e.message);
            return { success: false, error: e.message, puntosDeVenta: [] };
        }
    });

    // Para el diálogo de actualizar clave: a quién le pertenece la clave (un
    // representado de AFIP entra con la de su representante).
    ipcMain.handle('contribuyente:titularClave', async (event, { cuit, servicio } = {}) => {
        try {
            const info = await repo.titularClave(String(cuit), servicio);
            if (!info) return { success: false, error: 'NO_ENCONTRADO', message: 'No se encontró el cliente.' };
            return { success: true, ...info };
        } catch (e) {
            console.error('[contribuyente:titularClave] error:', e.message);
            return { success: false, error: e.code || 'ERROR', message: e.message };
        }
    });

    ipcMain.handle('contribuyente:actualizarClave', async (event, { cuit, servicio, clave } = {}) => {
        try {
            const info = await repo.actualizarClave(String(cuit), servicio, clave);
            console.log(`[contribuyente:actualizarClave] clave ${servicio} actualizada en ${info.titular.cuit}`);
            return { success: true, ...info };
        } catch (e) {
            console.error('[contribuyente:actualizarClave] error:', e.message);
            return { success: false, error: e.code || 'ERROR', message: e.message };
        }
    });

    // Verificación corta tras actualizar la clave: login (y PDV si es facturación) con
    // el navegador oculto. Ver verificarClave.js.
    ipcMain.handle('contribuyente:verificarClave', async (event, { cuit, servicio } = {}) => {
        try {
            return await verificarClave(repo, String(cuit), servicio);
        } catch (e) {
            console.error('[contribuyente:verificarClave] error:', e.message);
            return { success: false, error: 'ERROR', message: e.message };
        }
    });

    // Lanzador manual: tras un login exitoso, guardar el cliente o actualizar su clave.
    ipcMain.handle('contribuyente:guardarDesdeLanzador', async (event, { cuit, servicio, clave, nombre } = {}) => {
        try {
            const r = await guardarDesdeLanzador(repo, { cuit, canal: servicio, clave, nombre });
            console.log(`[contribuyente:guardarDesdeLanzador] ${servicio} ${cuit} → ${r.accion}`);
            return { success: true, ...r };
        } catch (e) {
            console.error('[contribuyente:guardarDesdeLanzador] error:', e.message);
            return { success: false, error: e.code || 'ERROR', message: e.message };
        }
    });
}

module.exports = setupContribuyenteHandlers;
