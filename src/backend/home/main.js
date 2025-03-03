require('dotenv').config(); // Cargar variables de entorno desde .env
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { comunicacionConFactura, comunicacionConLibroIVA } = require('../index.js');
const facturaManager = require('../puppeteer/facturas/codigo/facturaManager'); // Importa el manager de facturas

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, '../../../preload.js'),
            nodeIntegration: false, // Recomendado: false para seguridad
            contextIsolation: true, // Recomendado: true para seguridad
            webSecurity: false,
            sandbox: false,
            allowRunningInsecureContent: false,
            experimentalFeatures: true  // Añade esta línea
        }
    });

    mainWindow.loadFile('src/frontend_js/home/index.html'); // <-- ESTA LÍNEA ES FUNDAMENTAL
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



let resultadoCodigo;

ipcMain.on('formulario-enviado', async (event, data) => {

    if (data.servicio === 'factura') {
        resultadoCodigo = comunicacionConFactura(data);
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

            const resultado = await facturaManager.iniciarProceso(data.url, data.credenciales, resultadoCodigo);

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

// Nuevo método para procesar el libro IVA
ipcMain.on('procesar-libro-iva', async (event, data) => {
    try {
        // Aquí puedes agregar la lógica para procesar el libro IVA
        // Por ejemplo, llamar a un módulo específico para manejar el libro IVA
        const resultado = await comunicacionConLibroIVA(data);

        event.reply('libro-iva-procesado', { success: true, message: 'Libro IVA procesado correctamente', data: resultado });
    } catch (error) {
        console.error("Error al procesar el libro IVA:", error);
        event.reply('libro-iva-procesado', { success: false, error: error.message });
    }
});

