require('dotenv').config(); // Cargar variables de entorno desde .env
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { comunicacionConFactura } = require('./backend/index');
const puppeteerManager = require('./puppeteer/puppeteer-manager'); // Importamos el manager
const facturaManager = require('./puppeteer/facturas/codigo/facturaManager'); // Importa el manager de facturas

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, // Recomendado: false para seguridad
            contextIsolation: true, // Recomendado: true para seguridad
            webSecurity: false,
            sandbox: false,
            allowRunningInsecureContent: false,
            experimentalFeatures: true  // Añade esta línea
        }
    });

    mainWindow.loadFile('index.html'); // <-- ESTA LÍNEA ES FUNDAMENTAL
    mainWindow.webContents.openDevTools(); // Abre las DevTools (opcional)
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('formulario-enviado', async (event, data) => {
    if (data.servicio === 'factura') {
        const resultadoCodigo = comunicacionConFactura(data);
        if (resultadoCodigo.error) {
            console.error("Error al generar codigo de local storage", resultadoCodigo.error);
            event.reply("codigoLocalStorageGenerado", resultadoCodigo);
            return;
        }
        event.reply('codigoLocalStorageGenerado', resultadoCodigo);
    } else if (data.servicio === 'login') {
        try {
            mainWindow.webContents.send('status-update', {
                status: 'iniciando',
                message: 'Iniciando navegador...'
            });

            const resultado = await facturaManager.iniciarProceso(data.url, data.credenciales, data);

            mainWindow.webContents.send('status-update', {
                status: 'completado',
                message: resultado.message
            });

            event.reply('login-automatizado', resultado);
        } catch (error) {
            console.error("Error en la automatización de login:", error);
            event.reply('login-automatizado', { success: false, error: error.message });
        }
    } else {
        event.reply('formulario-recibido', 'Datos recibidos y procesados en el backend.');
    }
});

ipcMain.on('ejecutar-automatizacion', async (event, tipoAutomatizacion, datosDelFormulario) => {
    try {
        const datosProcesados = comunicacionConFactura(datosDelFormulario);
        if (datosProcesados.error) {
            event.reply('puppeteer-finished', { success: false, error: datosProcesados.error });
            return;
        }

        const [tipoPrincipal, accion] = tipoAutomatizacion.split('/');
        let manager;

        switch (tipoPrincipal) {
            case 'facturas':
                manager = require('./puppeteer/facturas/codigo/facturaManager');
                break;
            // ... otros casos ...
            default:
                throw new Error('Tipo de automatización no válido.');
        }
        const page = await puppeteerManager.nuevaPagina('URL_DESPUES_DEL_LOGIN');
        // *** PASAMOS datosProcesados AL MANAGER ***
        const resultado = await manager[accion](page, datosProcesados);
        await puppeteerManager.cerrarNavegador();
        event.reply('automatizacion-completada', resultado);
    } catch (error) {
        // ... manejo de errores ...
    }
});

ipcMain.on('iniciar-sesion', async (event, url, credenciales) => {
    try {
        const page = await puppeteerManager.nuevaPagina(url); // Abre la página de login

        // Automatización del inicio de sesión (ejemplo)
        await page.waitForSelector('#usuario', {timeout: 5000}); // Espera a que el campo de usuario esté disponible
        await page.type('#usuario', credenciales.usuario);
        await page.type('#contrasena', credenciales.contrasena);
        await page.click('#boton-login');

        await page.waitForNavigation({waitUntil: 'networkidle2'}); // Espera a que la navegación se complete

        // Obtener información después del login (opcional)
        const loggedIn = await page.evaluate(() => {
          return document.querySelector('#elemento-que-aparece-despues-del-login') !== null;
        })

        if(loggedIn){
          event.reply('sesion-iniciada', { success: true, message: "Sesion iniciada correctamente" });
        }else{
          event.reply('sesion-iniciada', { success: false, message: "Credenciales incorrectas" });
        }
    } catch (error) {
        console.error("Error en el inicio de sesión:", error);
        event.reply('sesion-iniciada', { success: false, error: error.message });
    } finally {
        await puppeteerManager.cerrarNavegador();
    }
});

ipcMain.on('automatizar-login', async (event, url, credenciales) => {
    try {
        const resultado = await facturaManager.iniciarProceso(url, credenciales);
        event.reply('login-automatizado', resultado);
    } catch (error) {
        console.error("Error en la automatización de login:", error);
        event.reply('login-automatizado', { success: false, error: error.message });
    }
});

ipcMain.on('abrir-navegador', async (event, url, encabezados) => { // Recibe la URL
    try {
        const page = await puppeteerManager.nuevaPagina(url, encabezados); // Usamos el manager para abrir la página
        event.reply('navegador-abierto'); // Informa al frontend que el navegador se abrió
    } catch (error) {
        console.error("Error al abrir el navegador:", error);
        event.reply('abrir-navegador-error', error.message); // Envia el error al frontend
    }
});