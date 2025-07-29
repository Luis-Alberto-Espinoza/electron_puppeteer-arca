require('dotenv').config(); // Cargar variables de entorno desde .env
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { comunicacionConFactura, comunicacionConLibroIVA } = require('../index.js');
const facturaManager = require('../puppeteer/facturas/codigo/facturaManager'); // Importa el manager de facturas

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800, // Tamaño inicial
        height: 600, // Tamaño inicial
        webPreferences: {
            preload: path.join(__dirname, '../../../preload.js'),
            nodeIntegration: false, // Recomendado: false para seguridad
            contextIsolation: true, // Recomendado: true para seguridad
            webSecurity: false,
            sandbox: false,
            allowRunningInsecureContent: false,
            experimentalFeatures: true // Opcional: habilitar características experimentales
        }
    });

    mainWindow.loadFile('src/frontend_js/home/index.html'); // Cargar el archivo HTML principal

    // Maximizar la ventana al iniciar
    mainWindow.maximize();

    // Abrir las herramientas de desarrollo automáticamente después de cargar el contenido
    mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.openDevTools({ mode: 'detach' }); // Modo "detach" para abrir en una ventana separada
    });
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
let resultadoCodigo = "";
let test = false;
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
       // console.log("desde el main %%%%%%%% ", data)
        const resultado = await comunicacionConLibroIVA(data);
        
        event.reply('libro-iva-procesado', { success: true, message: 'Libro IVA procesado correctamente', data: resultado });
    } catch (error) {
        console.error("Error al procesar el libro IVA:", error);
        event.reply('libro-iva-procesado', { success: false, error: error.message });
    }
});//actualizar-segun-informe


ipcMain.on('actualizar-segun-informe', async (event, data) => {
    try {
        console.log("desde el main ", data)
        const resultado = await comunicacionConLibroIVA(data);
        
        event.reply('libro-iva-actualizado', { success: true, message: 'Libro IVA actualizado correctamente', data: resultado });
    } catch (error) {
        console.error("Error al procesar el libro IVA:", error);
        event.reply('libro-iva-actualizado', { success: false, error: error.message });
    }
});

ipcMain.on('numero-eliminar', async (event, data) => {
    console.log('Número recibido en el main:', data);

    try {
        const resultado = await comunicacionConLibroIVA(data);
        // Procesar el número (ejemplo: multiplicarlo por 2)

        // Enviar el resultado de vuelta al frontend
        event.reply('resultado-numero-eliminar', { success: true, resultado });
    } catch (error) {
        console.error('Error al procesar el número:', error);
        event.reply('resultado-numero-eliminar', { success: false, error: error.message });
    }
});

ipcMain.on('procesar-pdf', async (event, filePath) => {
    try {
        // Aquí puedes implementar la lógica para procesar el archivo PDF
        // Por ejemplo, utilizando una librería para leer el contenido del PDF

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
        // Aquí puedes implementar la lógica para exportar los resultados
        // Por ejemplo, guardándolos en un archivo o enviándolos por correo electrónico

        // Simulando la exportación de resultados
        console.log('Resultados exportados:', resultados);

        event.reply('resultados-exportados', { success: true, message: 'Resultados exportados correctamente' });
    } catch (error) {
        console.error('Error al exportar resultados:', error);
        event.reply('resultados-exportados', { success: false, error: error.message });
    }
});
