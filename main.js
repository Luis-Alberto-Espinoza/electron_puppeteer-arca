const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

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
});



/*
function getDiasHabiles(mes, anio) {
    const diasEnMes = new Date(anio, mes, 0).getDate();
    let diasHabiles = 0;
    
    for (let dia = 1; dia <= diasEnMes; dia++) {
        const fecha = new Date(anio, mes - 1, dia);
        const diaSemana = fecha.getDay();
        
        // 0 es domingo, 6 es sábado
        if (diaSemana !== 0 && diaSemana !== 6) {
            diasHabiles++;
        }
    }
    
    return diasHabiles;
}*/
