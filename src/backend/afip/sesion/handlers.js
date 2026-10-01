// afip/sesion/handlers.js
// Handler IPC del lanzador de sesión AFIP.
//
//   afip:abrirSesion  payload: cuit (string)
//     → resuelve el acceso (propio o por representante) y abre el navegador logueado.
//
// Usa el modelo plano: resolverAcceso(cuit, 'afip') devuelve con qué CUIT/clave
// entrar. Para un representado (ej. El Papi) entra con la clave del representante
// (Debora) y avisa que hay que elegir empresa en AFIP. Las claves nunca salen del
// main process.

const sesionAfipManager = require('./sesionAfipManager.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { registrarResultadoLogin } = require('../../cliente/registrarResultadoLogin.js');

function setupSesionAfipHandlers(ipcMain) {
    const repo = getContribuyenteRepo();

    ipcMain.handle('afip:abrirSesion', async (event, cuit) => {
        console.log('[SesionAFIP] Solicitud de apertura para CUIT:', cuit);
        try {
            const acceso = await repo.resolverAcceso(String(cuit), 'afip');
            if (!acceso) {
                return {
                    success: false,
                    error: 'SIN_ACCESO',
                    message: 'El contribuyente no tiene acceso AFIP (ni clave propia ni representante).'
                };
            }
            const credenciales = { usuario: acceso.loginCuit, contrasena: acceso.loginClave };
            const r = await sesionAfipManager.abrirSesion(credenciales);
            await registrarResultadoLogin(repo, acceso.loginCuit, 'afip', r);
            // Le pasamos al front si tiene que elegir empresa (caso representado).
            return {
                ...r,
                requiereElegirEmpresa: acceso.requiereElegirEmpresa,
                objetivoNombre: acceso.objetivoNombre
            };
        } catch (error) {
            console.error('[SesionAFIP] Error:', error.message);
            return { success: false, error: 'ABRIR_SESION_ERROR', message: error.message };
        }
    });

    // Modo manual: el usuario tipea CUIT + clave y abrimos el navegador logueado con
    // eso, sin pasar por resolverAcceso (no hay representación: se loguea tal cual).
    ipcMain.handle('afip:abrirSesionManual', async (event, datos) => {
        const cuit  = String((datos && datos.cuit)  || '').trim();
        const clave = String((datos && datos.clave) || '');
        console.log('[SesionAFIP] Solicitud de apertura MANUAL para CUIT:', cuit);
        if (!cuit || !clave) {
            return { success: false, error: 'DATOS_INCOMPLETOS', message: 'Ingresá CUIT y clave fiscal.' };
        }
        try {
            const credenciales = { usuario: cuit, contrasena: clave };
            return await sesionAfipManager.abrirSesion(credenciales);
        } catch (error) {
            console.error('[SesionAFIP] Error (manual):', error.message);
            return { success: false, error: 'ABRIR_SESION_ERROR', message: error.message };
        }
    });
}

module.exports = setupSesionAfipHandlers;
