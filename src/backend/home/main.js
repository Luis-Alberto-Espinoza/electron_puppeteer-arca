require('dotenv').config(); // Cargar variables de entorno desde .env
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { comunicacionConFactura, comunicacionConLibroIVA } = require('../index.js');
const facturaManager = require('../puppeteer/facturas/codigo/facturaManager'); // Importa el manager de facturas
const { screen } = require('electron'); // Necesitamos el módulo 'screen'

// Importar el sistema de usuarios
const { JsonStorage } = require('../usuario/usuario.js');
let userStorage;

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

// Move all handlers outside of the whenReady block
function setupUserHandlers() {
    ipcMain.handle('user:create', async (event, userData) => {
        try {
            const data = userStorage.loadData();
            const existingUser = data.users.find(user => user.nombre === userData.nombre);
            if (existingUser) {
                return { success: false, error: 'El usuario ya existe' };
            }

            const newUser = {
                id: userStorage.generateId(),
                nombre: userData.nombre,
                clave: userData.clave,
                fechaCreacion: new Date().toISOString()
            };

            data.users.push(newUser);
            return userStorage.saveData(data)
                ? { success: true, user: newUser }
                : { success: false, error: 'Error al guardar' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('user:getAll', async () => {
        try {
            const data = userStorage.loadData();
            return { success: true, users: data.users };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('user:update', async (event, updatedUser) => {
        try {
            console.log('Recibiendo actualización:', updatedUser); // Debug
            
            const data = userStorage.loadData();
            console.log('Datos actuales:', data); // Debug
            
            const index = data.users.findIndex(user => String(user.id) === String(updatedUser.id));
            console.log('Usuario encontrado en índice:', index); // Debug
            
            if (index === -1) {
                console.log('Usuario no encontrado:', updatedUser.id); // Debug
                return { success: false, error: 'Usuario no encontrado' };
            }

            data.users[index] = {
                ...data.users[index],
                nombre: updatedUser.nombre,
                clave: updatedUser.clave,
                fechaModificacion: new Date().toISOString()
            };

            const saveResult = userStorage.saveData(data);
            console.log('Resultado de guardado:', saveResult); // Debug

            return saveResult
                ? { success: true, user: data.users[index] }
                : { success: false, error: 'Error al guardar' };
        } catch (error) {
            console.error('Error en update:', error); // Debug
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('user:delete', async (event, userId) => {
        try {
            console.log('Intentando eliminar usuario:', userId); // Debug
            
            const data = userStorage.loadData();
            const index = data.users.findIndex(user => String(user.id) === String(userId));
            
            console.log('Usuario encontrado en índice:', index); // Debug

            if (index === -1) {
                console.log('Usuario no encontrado:', userId); // Debug
                return { success: false, error: 'Usuario no encontrado' };
            }

            const deletedUser = data.users.splice(index, 1)[0];
            const saveResult = userStorage.saveData(data);
            
            console.log('Usuario eliminado:', deletedUser); // Debug
            console.log('Resultado de guardado:', saveResult); // Debug

            return saveResult
                ? { success: true, user: deletedUser }
                : { success: false, error: 'Error al guardar' };
        } catch (error) {
            console.error('Error en delete:', error); // Debug
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('seleccionar-archivos', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Text Files', extensions: ['txt'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });
        return result.filePaths;
    });

    ipcMain.handle('mercadopago:seleccionar-archivo', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Archivos PDF MercadoPago', extensions: ['pdf'] }, // Solo PDFs
                { name: 'Todos los archivos', extensions: ['*'] }
            ],
            title: 'Seleccionar archivo PDF de MercadoPago'
        });
        return result.canceled ? [] : result.filePaths;
    });

    ipcMain.handle('mercadopago:procesar-archivo', async (event, ruta) => {
        // console.log('=== HANDLER MAIN.JS INICIADO ===');
        // console.log('Parámetros recibidos:', arguments.length);
        // console.log('event:', typeof event);
        // console.log('ruta:', ruta);
        // console.log('typeof ruta:', typeof ruta);
        // console.log('arguments completos:', [...arguments]);

        try {
            // console.log('Ruta recibida en handler:', ruta);
            // console.log('Tipo de ruta en handler:', typeof ruta);
            // console.log('Ruta es válida:', ruta && ruta.length > 0);

            if (!ruta || ruta.trim() === '') {
                console.error('Ruta inválida detectada en handler');
                throw new Error('No se recibió una ruta válida para procesar');
            }
            // console.log('Directorio actual:', __dirname);

            const fs = require('fs');
            const archivoServicio = path.join(__dirname, '..', 'extraerDemercadoPago', 'leer_procesar_resumen_MercadoPago.js');

            if (!fs.existsSync(ruta)) {
                throw new Error(`El archivo PDF no existe en la ruta: ${ruta}`);
            }

            // Cargar el servicio
            const PDFProcessorService = require(archivoServicio);

            const pdfService = new PDFProcessorService();

            // Procesar el PDF
            const resultado = await pdfService.procesarPDF(ruta);
            return resultado;

        } catch (error) {
            console.error('=== ERROR EN PROCESAMIENTO MERCADOPAGO ===');
            console.error('Error completo:', error);
            console.error('Stack:', error.stack);
            console.error('=== FIN ERROR ===');

            return {
                success: false,
                error: {
                    message: error.message,
                    stack: error.stack,
                    codigo: 'MERCADOPAGO_PDF_ERROR'
                },
                archivo: ruta ? path.basename(ruta) : 'desconocido',
                procesadoEn: new Date().toISOString()
            };
        }
    });
}

// Move all IPC listeners outside of the whenReady block
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
        setupUserHandlers();
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