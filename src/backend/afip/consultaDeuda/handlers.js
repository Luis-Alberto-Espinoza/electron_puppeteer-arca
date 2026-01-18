// afip/consultaDeuda/handlers.js
// Handlers IPC para el dominio de Consulta de Deuda AFIP

const consultaDeudaManager = require('../../puppeteer/consultaDeuda/consultaDeudaManager.js');

/**
 * Configura los handlers IPC para el dominio de Consulta de Deuda
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 * @param {Object} userStorage - Storage de usuarios
 * @param {Electron.App} app - Instancia de la app
 */
function setupConsultaDeudaHandlers(ipcMain, userStorage, app) {

    // ========================================
    // HANDLER: consultaDeuda:consultar
    // Consulta la deuda de uno o mas usuarios
    // ========================================
    ipcMain.handle('consultaDeuda:consultar', async (event, consultasData) => {
        console.log('BACKEND: Recibida solicitud para consultar deuda');
        console.log('Datos recibidos:', JSON.stringify(consultasData, null, 2));

        if (!consultasData || !Array.isArray(consultasData) || consultasData.length === 0) {
            return {
                success: false,
                message: 'No se recibieron consultas para procesar'
            };
        }

        try {
            const url = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';
            const resultados = [];

            for (let i = 0; i < consultasData.length; i++) {
                const consulta = consultasData[i];
                const { usuario, periodoDesde, periodoHasta, fechaCalculo } = consulta;

                console.log(`\n[${i + 1}/${consultasData.length}] Consultando ${usuario.nombre} (${usuario.cuit})`);

                try {
                    // Obtener credenciales del usuario desde el storage
                    const dataBD = userStorage.loadData();
                    const usuarioCompleto = dataBD.users.find(u => String(u.id) === String(usuario.id));

                    if (!usuarioCompleto) {
                        throw new Error(`No se pudieron obtener las credenciales del usuario`);
                    }

                    const credenciales = {
                        usuario: usuarioCompleto.cuit || usuario.cuit,
                        contrasena: usuarioCompleto.claveAFIP || usuarioCompleto.clave
                    };

                    // Llamar al Consulta Deuda Manager
                    const downloadsPath = app.getPath('downloads');
                    const consultaData = {
                        usuario: {
                            id: usuario.id,
                            nombre: usuario.nombre,
                            cuit: usuario.cuit
                        },
                        periodoDesde,
                        periodoHasta,
                        fechaCalculo
                    };

                    const resultado = await consultaDeudaManager.iniciarConsulta(url, credenciales, consultaData, downloadsPath);

                    if (resultado.success) {
                        console.log(`  ${usuario.nombre} completado - Archivo: ${resultado.archivoExcel}`);
                        resultados.push({
                            status: 'success',
                            usuario: usuario,
                            archivoExcel: resultado.archivoExcel,
                            rutaCompleta: resultado.rutaCompleta,
                            totalFilas: resultado.totalFilas
                        });
                    } else {
                        console.error(`  ${usuario.nombre} fallo: ${resultado.message || resultado.error}`);
                        resultados.push({
                            status: 'error',
                            usuario: usuario,
                            error: resultado.message || resultado.error || 'Error desconocido'
                        });
                    }

                } catch (error) {
                    console.error(`  Error procesando ${usuario.nombre}:`, error);
                    resultados.push({
                        status: 'error',
                        usuario: usuario,
                        error: error.message
                    });
                }
            }

            console.log(`\nBACKEND: Consulta de deuda finalizada`);
            console.log(`   Total procesados: ${resultados.filter(r => r.status === 'success').length}/${consultasData.length}`);

            return {
                success: true,
                resultados: resultados
            };

        } catch (error) {
            console.error('BACKEND: Error al consultar deuda:', error);
            return {
                success: false,
                message: `Error al consultar deuda: ${error.message}`,
                error: error.toString()
            };
        }
    });
}

module.exports = setupConsultaDeudaHandlers;
