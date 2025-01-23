const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { procesarDatosFactura } = require('./backend')

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
     console.log('Datos del formulario recibidos en main.js:', data);
    // Aquí procesas los datos (guardar en base de datos, etc.)
    event.reply('formulario-recibido', 'Datos recibidos y procesados en el backend.');

    // console.log('Datos recibidos del frontend:', data);

    if (data.servicio === 'factura') {
        const resultado = procesarDatosFactura(data);
        // console.log("Resultado del procesamiento de la factura", resultado);
    }

});