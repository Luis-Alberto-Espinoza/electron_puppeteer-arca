const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { Worker } = require('worker_threads');
const path = require('path');
const { comunicacionConLibroIVA } = require('../index.js');
// comunicacionConFactura y facturaManager movidos a afip/factura/handlers.js
const { screen } = require('electron'); // Necesitamos el módulo 'screen'
const procesarPdfConFallback = require('../extraerTablasPdf/extraerTablas_B_Manager.js'); // Importa la función orquestadora
const fs = require('fs'); // <--- Agrega esto al inicio del archivo

const { manejarEventoATM } = require('../atm_Servicios/atm_Manager.js');
// vepManager movido a afip/vep/handlers.js
const consultaDeudaManager = require('../puppeteer/consultaDeuda/consultaDeudaManager.js');

ipcMain.handle('atm:ejecutar-flujo', async (event, evento) => {
    // console.log('Evento recibido en main para manejarEventoATM:', evento);
    const downloadsPath = app.getPath('downloads'); // <-- Descomentado
    // evento = { tipo: 'planDePago', datos: { ... } }
    const resultado = await manejarEventoATM(evento, downloadsPath); // <-- Pasa la ruta
    // console.log('Resultado de manejarEventoAT desde el main:', resultado);
    return resultado; // Esto se envía al frontend
});

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

// Handler para Tasa Cero - Procesar lote de clientes
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

// Importar el sistema de usuarios
const { JsonStorage } = require('../usuario/usuario.js');
let userStorage;

// Importar los handlers de usuario modularizados
const setupUserHandlers = require('../usuario/usuarioHandlers.js');
const setupMercadoPagoHandlers = require('../extraerDemercadoPago/mercadoPagoHandlers.js');

// Importar handlers de AFIP por dominio
const setupFacturaHandlers = require('../afip/factura/handlers.js');
const setupVepHandlers = require('../afip/vep/handlers.js');

// Importar la nueva función de carga masiva
const { procesarArchivoUsuarios } = require('../usuario/cargaMasiva.js');

// Lanzador de navegador y verificador de ATM para la validación manual
const { launchBrowserAndPage } = require('../puppeteer/archivos_comunes/navegador/browserLauncher');
const verificarCredencialesATM = require('../puppeteer/ATM/flujosDeTareas/flujo_verificaCredenciales_atm');


// importar sistema de credenciales
const verificarYObtenerDatosAFIP = require('../puppeteer/verificaCredenciales/flujo_verificaCredenciales_AFIP');      

let mainWindow;
let puppeteerWindow;
// Variables de factura movidas a afip/factura/handlers.js:
// resultadoCodigo, usuarioSeleccionado, empresaElegida, ultimaEmpresaElegida

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Dimensiones basadas en tus medidas actuales, llevadas a estándar
    const windowWidth = 800;   // Tu ancho actual (mínimo)
    const windowHeight = 650;   // Tu alto actual

    // Centrar la ventana
    const x = Math.floor((width - windowWidth) / 2);
    const y = Math.floor((height - windowHeight) / 2);

    mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x: x,
        y: y,
        minWidth: 600,     // Más estrecha si es necesario  
        minHeight: 400,
        resizable: true,   // Permitir redimensionar si es necesario
        webPreferences: {
            preload: path.join(__dirname, '../../../preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            sandbox: false,  // Cambiado a false para permitir require
            experimentalFeatures: false
        }
    });

    mainWindow.loadFile('src/frontend_js/home/index.html');

    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.show();

        // COMENTADO: DevTools deshabilitadas para producción
        // mainWindow.webContents.openDevTools({ mode: 'right' });

        // Devolver el foco a la aplicación principal
        setTimeout(() => {
            mainWindow.focus();
            mainWindow.webContents.focus();

            setTimeout(() => {
                mainWindow.show();
                mainWindow.focus();
            }, 100);
        }, 300);
    });
}

function createPuppeteerWindow() {
    console.log('Intentando crear ventana de Puppeteer...');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    const puppeteerWindow = new BrowserWindow({
        width: width,
        height: height,
        x: 0,
        y: 0,
        frame: true,
        fullscreen: false,
        show: false,
        title: 'AFIP - Automatización',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            devTools: false
        }
    });

    // Cambia la ruta a absoluta si es necesario
    const puppeteerHtmlPath = path.join(__dirname, '../../frontend_js/puppeteer/index.html');
    console.log('Cargando archivo HTML de Puppeteer:', puppeteerHtmlPath);
    puppeteerWindow.loadFile(puppeteerHtmlPath);

    puppeteerWindow.once('ready-to-show', () => {
        puppeteerWindow.show();
        console.log('Ventana de Puppeteer mostrada');
    });

    puppeteerWindow.on('closed', () => {
        console.log('✅ Ventana de Puppeteer cerrada correctamente');
        puppeteerWindow = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('puppeteer-window-closed');
        }
    });

    puppeteerWindow.on('close', (event) => {
        console.log('🔄 Cerrando ventana de Puppeteer...');
    });

    return puppeteerWindow;
}

function createImageWindow(imagePath) {
    const imageWindow = new BrowserWindow({
        width: 300,
        height: 400,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    imageWindow.loadFile(imagePath);

    // Manejar cierre de ventana de imagen
    imageWindow.on('closed', () => {
        console.log('Ventana de imagen cerrada');
    });
}

// Agregar el handle para IPC
ipcMain.handle('show-screenshot', async (event, imagePath) => {
    createImageWindow(imagePath);
});

// Función para obtener la ventana de Puppeteer (para usar en facturaManager)
function getPuppeteerWindow() {
    return puppeteerWindow;
}

// Exportar la función si facturaManager la necesita
module.exports = { getPuppeteerWindow };

function setupIpcListeners() {
    // Handlers de factura movidos a: afip/factura/handlers.js

    ipcMain.on('procesar-libro-iva', async (event, data) => {
        try {
            const resultado = await comunicacionConLibroIVA(data);
            event.reply('libro-iva-procesado', { success: true, message: 'Libro IVA procesado correctamente', data: resultado });
        } catch (error) {
            console.error("Error al procesar el libro IVA:", error);
            event.reply('libro-iva-procesado', { success: false, error: error.message });
        }
    });


    ipcMain.on('actualizar-segun-informe', async (event, data) => {
        try {
            const resultado = await comunicacionConLibroIVA(data);

            event.reply('libro-iva-actualizado', { success: true, message: 'Libro IVA actualizado correctamente', data: resultado });
        } catch (error) {
            console.error("Error al procesar el libro IVA:", error);
            event.reply('libro-iva-actualizado', { success: false, error: error.message });
        }
    });

    ipcMain.on('numero-eliminar', async (event, data) => {

        try {
            const resultado = await comunicacionConLibroIVA(data);
            event.reply('resultado-numero-eliminar', { success: true, resultado });
        } catch (error) {
            console.error('Error al procesar el número:', error);
            event.reply('resultado-numero-eliminar', { success: false, error: error.message });
        }
    });

    ipcMain.on('procesar-pdf', async (event, filePath) => {
        try {
            const resultados = `Resultados del procesamiento de ${filePath}`;

            event.reply('resultados-pdf', { success: true, resultados });
        } catch (error) {
            console.error('Error al procesar el PDF:', error);
            event.reply('resultados-pdf', { success: false, error: error.message });
        }
    });

    ipcMain.on('exportar-resultados', async (event, resultados) => {
        try {
            event.reply('resultados-exportados', { success: true, message: 'Resultados exportados correctamente' });
        } catch (error) {
            console.error('Error al exportar resultados:', error);
            event.reply('resultados-exportados', { success: false, error: error.message });
        }
    });

    // Handler exclusivo para verificación de credenciales
    ipcMain.handle('user:verifyCredentials', async (event, credenciales) => {
        let browser;
        console.log('[Verificación Manual] Iniciando para CUIT:', credenciales.cuit || credenciales.cuil);

        try {
            const { browser: b, page } = await launchBrowserAndPage({ headless: true });
            browser = b;

            let finalResult = {
                success: false, // Será true si CUALQUIER credencial es válida
                empresasDisponible: [],
                cuitAsociados: [],
                error: null
            };

            // --- Verificación AFIP ---
            if (credenciales.claveAFIP) {
                console.log('[Verificación Manual] Verificando credenciales de AFIP...');
                const afipResult = await verificarYObtenerDatosAFIP(page, credenciales);
                if (afipResult.success) {
                    finalResult.success = true;
                    finalResult.empresasDisponible = afipResult.data.puntosDeVentaArray || [];
                    finalResult.cuitAsociados = afipResult.data.cuitAsociados || [];
                    console.log('[Verificación Manual] AFIP: Éxito.');
                } else {
                    finalResult.error = afipResult.error || 'Credenciales AFIP inválidas.';
                    console.log('[Verificación Manual] AFIP: Fallo.');
                }
            }

            // --- Verificación ATM ---
            if (credenciales.claveATM) {
                console.log('[Verificación Manual] Verificando credenciales de ATM...');
                const atmPage = await browser.newPage();
                const cuit = credenciales.cuit || credenciales.cuil;
                const atmResult = await verificarCredencialesATM(atmPage, cuit, credenciales.claveATM);
                await atmPage.close();

                if (atmResult.success) {
                    finalResult.success = true; // Si ATM es válido, el resultado general es un éxito
                    console.log('[Verificación Manual] ATM: Éxito.');
                } else if (!finalResult.success) { // Solo registrar error de ATM si AFIP no fue exitoso o no se probó
                    finalResult.error = atmResult.message || 'Credenciales ATM inválidas.';
                    console.log('[Verificación Manual] ATM: Fallo.');
                }
            }

            console.log('[Verificación Manual] Verificación completada. Resultado:', finalResult);
            return finalResult;

        } catch (error) {
            console.error('❌ Error catastrófico en la verificación manual:', error);
            return { success: false, error: error.message || 'Error inesperado en la verificación.' };
        } finally {
            if (browser) {
                await browser.close();
                console.log('[Verificación Manual] Navegador cerrado.');
            }
        }
    });

    // Handler para seleccionar archivo PDF para extraer tablas
    ipcMain.handle('extraerTablasPDF:seleccionar-archivo', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Archivos PDF', extensions: ['pdf'] },
                { name: 'Todos los archivos', extensions: ['*'] }
            ],
            title: 'Seleccionar archivo PDF para extraer tablas'
        });
        if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
            console.log('Ruta seleccionada (main):', result.filePaths[0]);
            return result.filePaths;
        }
        return [];
    });

    // Handler para procesar el archivo PDF (asegúrate de que esté dentro de setupIpcListeners)
    ipcMain.handle('extraerTablasPDF:procesar-archivo', async (event, rutaPDF) => {
        console.log('Procesando archivo con el nuevo orquestador en main:', rutaPDF);
        
        // Pasa la ruta raíz de la app como una opción para asegurar la correcta resolución de módulos.
        const appPath = app.getAppPath();
        const resultado = await procesarPdfConFallback(rutaPDF, { projectRoot: appPath });

        if (resultado.exito) {
            console.log(`Procesamiento exitoso con el método: ${resultado.metodo}`);
            console.log(`CSV del resultado guardado en: ${resultado.rutaCsv}`);
        } else {
            console.error('Error en el procesamiento PDF orquestado:', resultado.error);
        }

        // Devolvemos el objeto de resultado completo al frontend
        return resultado;
    });

    ipcMain.handle('abrir-archivo', async (_event, rutaArchivo) => {
        try {
            await shell.openPath(rutaArchivo);
            return true;
        } catch (err) {
            return false;
        }
    });

    ipcMain.handle('shell:open-directory', async (event, path) => {
        try {
            // showItemInFolder funciona tanto para archivos como para carpetas
            // - Archivo: abre la carpeta contenedora y selecciona el archivo
            // - Carpeta: abre la carpeta (comportamiento según el SO)
            shell.showItemInFolder(path);
            return { success: true };
        } catch (error) {
            console.error(`Failed to show item in folder: ${path}`, error);
            return { success: false, error: error.message };
        }
    });
}

// Main app initialization
app.whenReady().then(async () => {
    try {
        console.log('🚀 Iniciando aplicación...');

        // Initialize storage
        userStorage = new JsonStorage();
        console.log('✅ Storage inicializado');

        // Create window
        createWindow();
        console.log('✅ Ventana creada');

        // Setup handlers and listeners
        setupUserHandlers(ipcMain, userStorage, mainWindow, dialog);
        setupMercadoPagoHandlers(ipcMain, mainWindow, dialog);
        setupFacturaHandlers(ipcMain, userStorage, mainWindow);
        setupVepHandlers(ipcMain, userStorage, mainWindow, app);

        // Handler para la carga masiva de usuarios desde Excel
        ipcMain.handle('cargar-usuarios-masivo', async (event, fileBuffer) => {
            console.log(`[Debug Backend] IPC 'cargar-usuarios-masivo' recibido con datos.`);
            try {
                const resultado = await procesarArchivoUsuarios(fileBuffer);
                return resultado;
            } catch (error) {
                console.error('Error en el proceso de carga masiva (main.js):', error);
                return { 
                    success: false, 
                    errores: 1,
                    listaErrores: [{ fila: 'General', error: error.message }] 
                };
            }
        });

        setupIpcListeners(); // <--- asegúrate de que esta línea se ejecuta
    } catch (error) {
        console.error('❌ Error en inicialización:', error);
    }
});

// App event listeners

// Handler de VEP movido a: afip/vep/handlers.js

// ========================================
// HANDLER: CONSULTA DE DEUDA
// ========================================
ipcMain.handle('consultaDeuda:consultar', async (event, consultasData) => {
    console.log('🔵 BACKEND: Recibida solicitud para consultar deuda');
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

            console.log(`\n🔵 [${i + 1}/${consultasData.length}] Consultando ${usuario.nombre} (${usuario.cuit})`);

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
                    console.log(`  ✅ ${usuario.nombre} completado - Archivo: ${resultado.archivoExcel}`);
                    resultados.push({
                        status: 'success',
                        usuario: usuario,
                        archivoExcel: resultado.archivoExcel,
                        rutaCompleta: resultado.rutaCompleta,
                        totalFilas: resultado.totalFilas
                    });
                } else {
                    console.error(`  ❌ ${usuario.nombre} falló: ${resultado.message || resultado.error}`);
                    resultados.push({
                        status: 'error',
                        usuario: usuario,
                        error: resultado.message || resultado.error || 'Error desconocido'
                    });
                }

            } catch (error) {
                console.error(`  ❌ Error procesando ${usuario.nombre}:`, error);
                resultados.push({
                    status: 'error',
                    usuario: usuario,
                    error: error.message
                });
            }
        }

        console.log(`\n✅ BACKEND: Consulta de deuda finalizada`);
        console.log(`   Total procesados: ${resultados.filter(r => r.status === 'success').length}/${consultasData.length}`);

        return {
            success: true,
            resultados: resultados
        };

    } catch (error) {
        console.error('❌ BACKEND: Error al consultar deuda:', error);
        return {
            success: false,
            message: `Error al consultar deuda: ${error.message}`,
            error: error.toString()
        };
    }
});

// Handlers de facturas tipificadas y facturaCliente movidos a: afip/factura/handlers.js

// NOTE: El bloque de handlers de factura fue eliminado de aqui.
// Ver afip/factura/handlers.js para los handlers:
// - facturaTipificada:generar
// - facturaTipificada:generarLote
// - facturaCliente:generar

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Manejar errores no capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});
