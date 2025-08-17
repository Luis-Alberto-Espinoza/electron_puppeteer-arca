const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { comunicacionConFactura, comunicacionConLibroIVA } = require('../index.js');
const facturaManager = require('../puppeteer/facturas/codigo/facturaManager'); // Importa el manager de facturas
const { screen } = require('electron'); // Necesitamos el módulo 'screen'

// Importar el sistema de usuarios
const { JsonStorage } = require('../usuario/usuario.js');
let userStorage;

// Importar los handlers de usuario modularizados
const setupUserHandlers = require('../usuario/usuarioHandlers.js');

// importar sistema de credenciales
const { ejecutar_verificacionCredenciales } = require('../puppeteer/verificaCredenciales/flujo_verificaCredenciales');
//import { ejecutar_verificacionCredenciales } from '../puppeteer/verificaCredenciales/flujo_verificaCredenciales.js';      




let mainWindow;
let puppeteerWindow; // Variable para la ventana de Puppeteer

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
        console.log("Datos recibidos en el backend:", data);
        if (data.servicio === 'factura') {
            if (data.tipoContribuyente == null ) {
                data.tipoContribuyente = data.usuario.tipoContribuyente;
            }
            resultadoCodigo = comunicacionConFactura(data, userStorage);
            event.reply('codigoLocalStorageGenerado', resultadoCodigo);
        } else if (data.servicio === 'login') {
            try {
                const resultado = await facturaManager.iniciarProceso(data.url, data.credenciales, resultadoCodigo, data.test || false);
                event.reply('login-automatizado', resultado);
            } catch (error) {
                event.reply('login-automatizado', { success: false, error: error.message });
            }
        } else {
            event.reply('formulario-recibido', 'Datos recibidos y procesados en el backend.');
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
        try {
            let retornoCredenciales = await ejecutar_verificacionCredenciales( credenciales);
            console.log('\n\t\sRetorno de verificación de credenciales:', retornoCredenciales)
            
            // Extraer el array de empresas si existe
            let empresasArray = retornoCredenciales && retornoCredenciales.empresas ? retornoCredenciales.empresas : null;
            console.log('\n\t\sver el array de empresas:', empresasArray)

            let usuario = null;
            if (credenciales.cuit) {
                usuario = userStorage.getAll().find(u => u.cuit === credenciales.cuit);
            } else if (credenciales.cuil) {
                usuario = userStorage.getAll().find(u => u.cuil === credenciales.cuil);
            }
            if (usuario && usuario.clave === credenciales.clave) {
                return { success: true, usuario, retornoCredenciales: empresasArray };
            } else {
                return { success: false, error: 'Credenciales inválidas', retornoCredenciales: empresasArray };
            }
        } catch (error) {
            return { success: false, error: error.message || 'Error verificando credenciales', retornoCredenciales: null };
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

        // setupIpcListeners debe ir después de inicializar userStorage
        setupIpcListeners();
        console.log('✅ Manejadores IPC configurados');
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