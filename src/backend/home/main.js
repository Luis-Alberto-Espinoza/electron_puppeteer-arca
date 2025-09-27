const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { Worker } = require('worker_threads');
const path = require('path');
const { comunicacionConFactura, comunicacionConLibroIVA } = require('../index.js');
const facturaManager = require('../puppeteer/facturas/codigo/facturaManager'); // Importa el manager de facturas
const { screen } = require('electron'); // Necesitamos el módulo 'screen'
const procesarPdfConFallback = require('../extraerTablasPdf/extraerTablas_B.js'); // Importa la función orquestadora
const fs = require('fs'); // <--- Agrega esto al inicio del archivo

const { manejarEventoATM } = require('../atm_Servicios/atm_Manager.js');

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

// Importar el sistema de usuarios
const { JsonStorage } = require('../usuario/usuario.js');
let userStorage;

// Importar los handlers de usuario modularizados
const setupUserHandlers = require('../usuario/usuarioHandlers.js');

// Importar la nueva función de carga masiva
const { procesarArchivoUsuarios } = require('../usuario/cargaMasiva.js');

// Lanzador de navegador y verificador de ATM para la validación manual
const { launchBrowserAndPage } = require('../puppeteer/browserLauncher');
const verificarCredencialesATM = require('../puppeteer/ATM/flujosDeTareas/flujo_verificaCredenciales_atm');


// importar sistema de credenciales
const ejecutar_verificacionCredenciales = require('../puppeteer/verificaCredenciales/flujo_verificaCredenciales');
//import { ejecutar_verificacionCredenciales } from '../puppeteer/verificaCredenciales/flujo_verificaCredenciales.js';      

let mainWindow;
let puppeteerWindow;
let resultadoCodigo; // Variable para almacenar los datos procesados de la factura
let usuarioSeleccionado; // Variable para almacenar el usuario seleccionado
let empresaElegida; // Variable para almacenar la empresa elegida

// Variable global para guardar la última empresa elegida
let ultimaEmpresaElegida = null;

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
    ipcMain.on('formulario-enviado', async (event, data) => {
        console.log("Formulario enviado##=#=#=#=#=#=##=#=#=#=#=#=#=# desde el frontend:", data, '\nfinal\n');
        if (data.empresaElegida) {
            ultimaEmpresaElegida = data.empresaElegida;
        }
        if (data.servicio === 'factura') {
            if (data.tipoContribuyente == null) {
                data.tipoContribuyente = data.usuario.tipoContribuyente;
            }

            // Guardamos el resultado en la variable global para que el siguiente paso lo pueda usar.
            resultadoCodigo = comunicacionConFactura(data, userStorage);
            event.reply('codigoLocalStorageGenerado', resultadoCodigo);
        }
        usuarioSeleccionado = data.usuario; // Guardar el usuario seleccionado
        empresaElegida = data.empresaElegida; // Guardar la empresa elegida
    });

    // Nuevo listener dedicado para iniciar el proceso de AFIP
    ipcMain.on('iniciar-proceso-afip', async (event, data) => {
        console.log("Iniciando proceso AFIP con los siguientes datos:", data);
        try {
            if (!data.credenciales.nombreEmpresa && ultimaEmpresaElegida) {
                data.credenciales.nombreEmpresa = ultimaEmpresaElegida;
            }
            // Usamos la variable 'resultadoCodigo' que fue poblada por el evento 'formulario-enviado'
            const resultado = await facturaManager.iniciarProceso(data.url, data.credenciales, resultadoCodigo, data.test, usuarioSeleccionado, empresaElegida);
            event.reply('login-automatizado', resultado);

            // Enviar resultado de facturación al frontend por canal dedicado
            if (mainWindow && resultado && resultado.success) {
                mainWindow.webContents.send('factura:resultado', resultado);
            }
        } catch (error) {
            event.reply('login-automatizado', { success: false, error: error.message });
        }
    });

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
            const { browser: b, page } = await launchBrowserAndPage({ headless: false });
            browser = b;

            let finalResult = {
                success: false, // Será true si CUALQUIER credencial es válida
                puntosDeVentaArray: [],
                error: null
            };

            // --- Verificación AFIP ---
            if (credenciales.claveAFIP) {
                console.log('[Verificación Manual] Verificando credenciales de AFIP...');
                const afipResult = await ejecutar_verificacionCredenciales(page, credenciales);
                if (afipResult.success) {
                    finalResult.success = true;
                    finalResult.puntosDeVentaArray = afipResult.data.puntosDeVentaArray || [];
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
        
        // Llama a la nueva y única función orquestadora
        const resultado = await procesarPdfConFallback(rutaPDF);

        // La lógica de guardado de CSV ya está centralizada dentro del orquestador.
        // El resultado ahora contiene la ruta al CSV generado (`rutaCsv`).
        // Opcionalmente, guardamos un JSON aquí para depuración si es necesario.
        if (resultado.exito) {
            console.log(`Procesamiento exitoso con el método: ${resultado.metodo}`);
            console.log(`CSV del resultado guardado en: ${resultado.rutaCsv}`);
            try {
                // Guardamos los datos crudos para depuración o uso futuro
                fs.writeFileSync(
                    path.join(__dirname, 'resultadoMain.json'),
                    JSON.stringify(resultado.datos, null, 2),
                    'utf8'
                );
                console.log('Datos crudos guardados en resultadoMain.json para depuración.');
            } catch (err) {
                console.error('Error al guardar el JSON de depuración:', err);
            }
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
            await shell.openPath(path);
            return { success: true };
        } catch (error) {
            console.error(`Failed to open path: ${path}`, error);
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