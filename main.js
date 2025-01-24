const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { comunicacionConFactura } = require('./backend/index')
const { pStorage } = require('./backend/facturas/paraStorage')

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, // Recomendado: false para seguridad
            contextIsolation: true // Recomendado: true para seguridad
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

ipcMain.on('formulario-enviado', (event, data) => {

    if (data.servicio === 'factura') {
        const facturaProcesada = comunicacionConFactura(data);
        if (facturaProcesada.error) { // manejo de error en caso de que exista
            console.error("Error al generar factura", facturaProcesada.error)
            event.reply("codigoLocalStorageGenerado", facturaProcesada)
            return
        }
        const resultadoCodigo = pStorage(facturaProcesada);
        if (resultadoCodigo.error) {
            console.error("Error al generar codigo de local storage", resultadoCodigo.error)
            event.reply("codigoLocalStorageGenerado", resultadoCodigo)
            return
        }

        event.reply('codigoLocalStorageGenerado', resultadoCodigo);
    } else {
        event.reply('formulario-recibido', 'Datos recibidos y procesados en el backend.');
    }
});
