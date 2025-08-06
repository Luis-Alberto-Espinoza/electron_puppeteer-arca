require('dotenv').config(); // Cargar variables de entorno desde .env
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

let mainWindow;

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Usar toda la pantalla para tener más espacio
    const windowWidth = width;
    const windowHeight = height;

    mainWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x: 0,
        y: 0,
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

        // DevTools integradas en el lado derecho - MÁS CONFIABLE
        mainWindow.webContents.openDevTools({ mode: 'right' });

        // Devolver el foco a la aplicación principal después de abrir DevTools
        setTimeout(() => {
            // Intentar múltiples métodos para devolver el foco
            mainWindow.focus(); // Foco a la ventana
            mainWindow.webContents.focus(); // Foco al contenido web

            // Si eso no funciona, intentar con show() de nuevo
            setTimeout(() => {
                mainWindow.show();
                mainWindow.focus();
            }, 100);
        }, 300); // Aumenté el delay inicial

    });
}

function createImageWindow(imagePath) {
    const imageWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    imageWindow.loadFile(imagePath);
}

// Agregar el handle para IPC
ipcMain.handle('show-screenshot', async (event, imagePath) => {
    createImageWindow(imagePath);
});

// manejar las operaciones de usuario 
// Configurar los manejadores de usuario
// Esta función se encarga de manejar las operaciones CRUD de usuarios

function setupIpcListeners() {
    ipcMain.on('formulario-enviado', async (event, data) => {

        if (data.servicio === 'factura') {
            resultadoCodigo = comunicacionConFactura(data);
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

            // Enviar el resultado de vuelta al frontend
            event.reply('resultado-numero-eliminar', { success: true, resultado });
        } catch (error) {
            console.error('Error al procesar el número:', error);
            event.reply('resultado-numero-eliminar', { success: false, error: error.message });
        }
    });

    ipcMain.on('procesar-pdf', async (event, filePath) => {
        try {
            // Simulando el procesamiento del PDF y generando resultados
            const resultados = `Resultados del procesamiento de ${filePath}`;

            // Enviar los resultados de vuelta al renderer process
            event.reply('resultados-pdf', { success: true, resultados });
        } catch (error) {
            console.error('Error al procesar el PDF:', error);
            event.reply('resultados-pdf', { success: false, error: error.message });
        }
    });

    ipcMain.on('exportar-resultados', async (event, resultados) => {
        try {
            // Simulando la exportación de resultados
            event.reply('resultados-exportados', { success: true, message: 'Resultados exportados correctamente' });
        } catch (error) {
            console.error('Error al exportar resultados:', error);
            event.reply('resultados-exportados', { success: false, error: error.message });
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