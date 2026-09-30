// afip/consultaDeuda/handlers.js
// Handlers IPC para el dominio de Consulta de Deuda AFIP

const consultaDeudaManager = require('./consultaDeudaManager.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { historialRepo } = require('../../historial/historialRepo.js');
const clienteHist = historialRepo.clienteDesdeUsuario;

/**
 * Configura los handlers IPC para el dominio de Consulta de Deuda
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 * @param {Electron.App} app - Instancia de la app
 */
function setupConsultaDeudaHandlers(ipcMain, app) {
    const repo = getContribuyenteRepo();

    // ========================================
    // HANDLER: consultaDeuda:consultar
    // Consulta la deuda de uno o mas usuarios
    // ========================================
    // `opciones.visible` se elige una vez para todo el lote (false = navegador oculto).
    ipcMain.handle('consultaDeuda:consultar', async (event, consultasData, opciones = {}) => {
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
                    // Modelo plano: el resolver da el login (representante si aplica)
                    // y el objetivo. El objetivo se enhebra como `usuario` →
                    // seleccionaCuit (paso_1b en el flujo) opera sobre él y la
                    // carpeta queda en el objetivo (no en el login).
                    const acceso = await repo.resolverAcceso(String(usuario.cuit), 'afip');
                    if (!acceso) {
                        throw new Error('El contribuyente no tiene acceso AFIP (ni clave propia ni representante)');
                    }

                    const credenciales = {
                        usuario: acceso.loginCuit,
                        contrasena: acceso.loginClave
                    };

                    // Llamar al Consulta Deuda Manager
                    const downloadsPath = app.getPath('downloads');
                    const consultaData = {
                        usuario: {
                            id: usuario.id,
                            nombre: acceso.objetivoNombre,
                            cuit: acceso.objetivoCuit,
                            apellido: ''
                        },
                        periodoDesde,
                        periodoHasta,
                        fechaCalculo
                    };

                    const resultado = await consultaDeudaManager.iniciarConsulta(url, credenciales, consultaData, downloadsPath, { visible: opciones.visible });

                    if (resultado.success) {
                        console.log(`  ${usuario.nombre} completado - Archivo: ${resultado.archivoExcel}`);
                        resultados.push({
                            status: 'success',
                            usuario: usuario,
                            archivoExcel: resultado.archivoExcel,
                            rutaCompleta: resultado.rutaCompleta,
                            totalFilas: resultado.totalFilas
                        });
                        historialRepo.registrar({
                            dominio: 'consultaDeuda', accion: 'consultar', estado: 'exito',
                            cliente: clienteHist(usuario),
                            resumen: `Deuda consultada (${resultado.totalFilas ?? 0} fila/s)`,
                            detalle: { archivo: resultado.archivoExcel, periodoDesde, periodoHasta, fechaCalculo }
                        });
                    } else {
                        console.error(`  ${usuario.nombre} fallo: ${resultado.message || resultado.error}`);
                        const msg = resultado.message || resultado.error || 'Error desconocido';
                        resultados.push({
                            status: 'error',
                            usuario: usuario,
                            error: msg
                        });
                        historialRepo.registrar({
                            dominio: 'consultaDeuda', accion: 'consultar', estado: 'error',
                            cliente: clienteHist(usuario),
                            resumen: 'Fallo al consultar deuda',
                            error: msg
                        });
                    }

                } catch (error) {
                    console.error(`  Error procesando ${usuario.nombre}:`, error);
                    resultados.push({
                        status: 'error',
                        usuario: usuario,
                        error: error.message
                    });
                    historialRepo.registrar({
                        dominio: 'consultaDeuda', accion: 'consultar', estado: 'error',
                        cliente: clienteHist(usuario),
                        resumen: 'Fallo al consultar deuda',
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
