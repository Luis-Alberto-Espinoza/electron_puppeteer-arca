// contribuyenteHandlers.js
// IPC del modelo plano hacia el renderer.
//
//   contribuyente:listar  payload: { servicio? }  → { success, items: ContribuyenteListItem[] }
//
// IMPORTANTE: este es el ÚNICO endpoint que cruza al renderer, y NO lleva claves
// (es la regla del contrato). `resolverAcceso` queda backend-only (lo usan los
// handlers de sesión), para que las claves nunca salgan del main process.

const { getContribuyenteRepo } = require('./contribuyenteStore.js');

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
}

module.exports = setupContribuyenteHandlers;
