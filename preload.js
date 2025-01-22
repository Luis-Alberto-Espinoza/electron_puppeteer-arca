const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendFormData: (data) => ipcRenderer.send('formulario-enviado', data),
    onFormularioRecibido: (callback) => ipcRenderer.on('formulario-recibido', callback) // Para recibir respuestas
});