const { contextBridge, ipcRenderer } = require('electron');
require('dotenv').config(); // Cargar variables de entorno desde .env

contextBridge.exposeInMainWorld('electronAPI', {
    sendFormData: (data) => ipcRenderer.send('formulario-enviado', data),
    onFormularioRecibido: (callback) => ipcRenderer.on('formulario-recibido', callback),
    onCodigoLocalStorageGenerado: (callback) => { // Intercepta el evento y llama al callback
        ipcRenderer.on('codigoLocalStorageGenerado', (_event, codigo) => callback(codigo)); // Pasa el 'codigo' al callback
    },
  
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', callback), // Nueva función para recibir actualizaciones de estado
    getEnv: (key) => process.env[key] // Exponer variables de entorno al frontend
});

