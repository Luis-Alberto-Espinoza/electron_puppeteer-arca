// afip/consultaComprobantes/handlers.js
// IPC handler para Consulta de Comprobantes Emitidos

const consultaComprobantesManager = require('./consultaComprobantesManager.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} userStorage
 * @param {Electron.App} app
 */
function setupConsultaComprobantesHandlers(ipcMain, userStorage, app) {

    ipcMain.handle('consultaComprobantes:consultar', async (event, datos) => {
        console.log('BACKEND: Recibida solicitud consultaComprobantes:consultar');

        try {
            const { usuario, nombreEmpresa, puntoDeVenta, fechaDesde, fechaHasta, tipoComprobante } = datos || {};

            if (!usuario || !usuario.id) {
                return { success: false, error: 'MISSING_USER', message: 'Falta el usuario.' };
            }
            if (!nombreEmpresa) {
                return { success: false, error: 'MISSING_EMPRESA', message: 'Falta la empresa.' };
            }
            // Punto de venta OPCIONAL: si no viene, la automatización deja el
            // select en "Todos" y AFIP devuelve los comprobantes de todos los pdv.
            if (!fechaDesde || !fechaHasta) {
                return { success: false, error: 'MISSING_FECHAS', message: 'Faltan fechas desde/hasta.' };
            }

            const dataBD = userStorage.loadData();
            const usuarioCompleto = dataBD.users.find(u => String(u.id) === String(usuario.id));
            if (!usuarioCompleto) {
                return { success: false, error: 'USER_NOT_FOUND', message: 'No se encontró el usuario en la base.' };
            }

            const credenciales = {
                usuario: usuarioCompleto.cuit,
                contrasena: usuarioCompleto.claveAFIP || usuarioCompleto.clave,
                nombreEmpresa
            };

            const datosManager = {
                fechaDesde,
                fechaHasta,
                nombreEmpresa,
                puntoDeVenta,
                // Opcional: si viene vacío/undefined, la automatización no toca el
                // select de tipo y AFIP devuelve todos los comprobantes.
                tipoComprobante: tipoComprobante || null
            };

            const usuarioParaArchivo = {
                cuit: usuarioCompleto.cuit,
                nombre: usuarioCompleto.nombre,
                apellido: usuarioCompleto.apellido
            };

            const downloadsPath = app.getPath('downloads');

            const resultado = await consultaComprobantesManager.iniciarConsulta(
                URL_LOGIN_AFIP,
                credenciales,
                datosManager,
                usuarioParaArchivo,
                downloadsPath
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
