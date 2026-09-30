// afip/consultaComprobantes/handlers.js
// IPC handler para Consulta de Comprobantes Emitidos

const consultaComprobantesManager = require('./consultaComprobantesManager.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {Electron.App} app
 */
function setupConsultaComprobantesHandlers(ipcMain, app) {
    const repo = getContribuyenteRepo();

    ipcMain.handle('consultaComprobantes:consultar', async (event, datos) => {
        console.log('BACKEND: Recibida solicitud consultaComprobantes:consultar');

        try {
            const { cuit, puntoDeVenta, fechaDesde, fechaHasta, tipoComprobante, visible } = datos || {};

            if (!cuit) {
                return { success: false, error: 'MISSING_CUIT', message: 'Falta el contribuyente.' };
            }
            // Punto de venta OPCIONAL: si no viene, la automatización deja el
            // select en "Todos" y AFIP devuelve los comprobantes de todos los pdv.
            if (!fechaDesde || !fechaHasta) {
                return { success: false, error: 'MISSING_FECHAS', message: 'Faltan fechas desde/hasta.' };
            }

            // Modelo plano: el resolver da con qué loguear (representante si aplica)
            // y de quién es el trámite (objetivo → empresa a elegir + carpeta).
            const acceso = await repo.resolverAcceso(String(cuit), 'afip');
            if (!acceso) {
                return { success: false, error: 'SIN_ACCESO', message: 'El contribuyente no tiene acceso AFIP (ni clave propia ni representante).' };
            }

            const credenciales = {
                usuario: acceso.loginCuit,
                contrasena: acceso.loginClave,
                nombreEmpresa: acceso.objetivoNombre   // razón social a elegir en AFIP
            };

            const datosManager = {
                fechaDesde,
                fechaHasta,
                nombreEmpresa: acceso.objetivoNombre,
                puntoDeVenta,
                // Opcional: si viene vacío/undefined, la automatización no toca el
                // select de tipo y AFIP devuelve todos los comprobantes.
                tipoComprobante: tipoComprobante || null
            };

            // Carpeta por el OBJETIVO (El Papi), no por el login (Debora). Acá se
            // mata el bug histórico de carpeta login-first.
            const usuarioParaArchivo = {
                cuit: acceso.objetivoCuit,
                nombre: acceso.objetivoNombre
            };

            const downloadsPath = app.getPath('downloads');

            const resultado = await consultaComprobantesManager.iniciarConsulta(
                URL_LOGIN_AFIP,
                credenciales,
                datosManager,
                usuarioParaArchivo,
                downloadsPath,
                { visible } // false = navegador oculto
            );

            return resultado;

        } catch (error) {
            console.error('BACKEND: Error en consultaComprobantes:consultar:', error);
            return {
                success: false,
                error: 'UNEXPECTED_ERROR',
                message: error.message
            };
        }
    });
}

module.exports = setupConsultaComprobantesHandlers;
