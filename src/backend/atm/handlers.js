// atm/handlers.js
// Handlers IPC para el dominio de ATM (Mendoza)

const { Worker } = require('worker_threads');
const path = require('path');
const { manejarEventoATM } = require('../atm_Servicios/atm_Manager.js');

/**
 * Configura los handlers IPC para el dominio de ATM
 * @param {Electron.IpcMain} ipcMain - Instancia de ipcMain
 * @param {Electron.BrowserWindow} mainWindow - Ventana principal
 * @param {Electron.App} app - Instancia de la app
 */
function setupAtmHandlers(ipcMain, mainWindow, app) {

    // ========================================
    // HANDLER: atm:ejecutar-flujo
    // Ejecuta un flujo individual de ATM
    // ========================================
    ipcMain.handle('atm:ejecutar-flujo', async (event, evento) => {
        // console.log('Evento recibido en main para manejarEventoATM:', evento);
        const downloadsPath = app.getPath('downloads');
        // evento = { tipo: 'planDePago', datos: { ... } }
        const resultado = await manejarEventoATM(evento, downloadsPath);
        // console.log('Resultado de manejarEventoAT desde el main:', resultado);
        return resultado; // Esto se envía al frontend
    });

    // ========================================
    // HANDLER: atm:iniciar-lote
    // Procesa lote de clientes usando Worker threads
    // ========================================
    ipcMain.handle('atm:iniciar-lote', async (evento, datos) => {
        // console.log('BACKEND MAIN: Recibida solicitud (handle) para iniciar lote.', datos);
        const { usuarios, tipoAccion } = datos;

        try {
            // console.log('BACKEND MAIN: Creando worker en segundo plano...');
            const worker = new Worker(path.join(__dirname, '../atm_Servicios/atm_worker.js'), {
                workerData: {
                    usuarios: usuarios,
                    tipoAccion: tipoAccion,
                    downloadsPath: app.getPath('downloads')
                }
            });

            worker.on('message', (mensaje) => {
                // console.log('BACKEND MAIN: Mensaje recibido del worker:', mensaje);
                // Reenviar el mensaje de progreso a la ventana del frontend
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('atm:lote-update', mensaje);
                }
            });

            worker.on('error', (error) => {
                console.error('BACKEND MAIN: Error en el worker de ATM:', error);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('atm:lote-update', {
                        status: 'error_fatal',
                        mensaje: `Error crítico en el worker: ${error.message}`
                    });
                }
            });

            worker.on('exit', (code) => {
                if (code !== 0) {
                    console.error(`BACKEND MAIN: El worker de ATM se detuvo con el código de salida ${code}`);
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('atm:lote-update', {
                            status: 'error_fatal',
                            mensaje: `El worker se detuvo inesperadamente con el código ${code}.`
                        });
                    }
                } else {
                    // console.log('El worker de ATM ha finalizado correctamente.');
                }
            });

            // Responder inmediatamente al frontend que el proceso ha comenzado
            return { success: true, message: 'El proceso por lote ha comenzado.' };

        } catch (error) {
            console.error('BACKEND MAIN: Error al iniciar el worker de ATM:', error);
            return { success: false, error: `No se pudo iniciar el proceso por lote: ${error.message}` };
        }
    });

    // ========================================
    // HANDLER: atm:iniciar-lote-tasa-cero
    // Procesa lote de Tasa Cero usando Worker threads
    // ========================================
    ipcMain.handle('atm:iniciar-lote-tasa-cero', async (evento, datos) => {
        console.log('[BACKEND MAIN] Recibida solicitud para iniciar lote de Tasa Cero:', datos);
        const { clientes } = datos;

        try {
            console.log('[BACKEND MAIN] Creando worker para Tasa Cero en segundo plano...');
            const workerTasaCero = new Worker(path.join(__dirname, '../atm_Servicios/flujos/flujo_tasaCero.js'), {
                workerData: {
                    clientes: clientes,
                    downloadsPath: app.getPath('downloads')
                    // NOTA: El periodo se selecciona automáticamente (último disponible)
                }
            });

            workerTasaCero.on('message', (mensaje) => {
                console.log('[BACKEND MAIN] Mensaje recibido del worker de Tasa Cero:', mensaje);
                // Reenviar el mensaje de progreso a la ventana del frontend
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('atm:tasa-cero-update', mensaje);
                }
            });

            workerTasaCero.on('error', (error) => {
                console.error('[BACKEND MAIN] Error en el worker de Tasa Cero:', error);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('atm:tasa-cero-update', {
                        estado: 'error_fatal',
                        mensaje: `Error crítico en el worker de Tasa Cero: ${error.message}`
                    });
                }
            });

            workerTasaCero.on('exit', (codigoSalida) => {
                if (codigoSalida !== 0) {
                    console.error(`[BACKEND MAIN] El worker de Tasa Cero se detuvo con el código de salida ${codigoSalida}`);
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('atm:tasa-cero-update', {
                            estado: 'error_fatal',
                            mensaje: `El worker de Tasa Cero se detuvo inesperadamente con el código ${codigoSalida}.`
                        });
                    }
                } else {
                    console.log('[BACKEND MAIN] El worker de Tasa Cero ha finalizado correctamente.');
                }
            });

            // Responder inmediatamente al frontend que el proceso ha comenzado
            return { exito: true, mensaje: 'El proceso de Tasa Cero por lote ha comenzado.' };

        } catch (error) {
            console.error('[BACKEND MAIN] Error al iniciar el worker de Tasa Cero:', error);
            return { exito: false, error: `No se pudo iniciar el proceso de Tasa Cero: ${error.message}` };
        }
    });
}

module.exports = setupAtmHandlers;
