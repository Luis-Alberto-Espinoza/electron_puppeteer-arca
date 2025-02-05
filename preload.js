const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendFormData: (data) => ipcRenderer.send('formulario-enviado', data),
    onFormularioRecibido: (callback) => ipcRenderer.on('formulario-recibido', callback),
    onCodigoLocalStorageGenerado: (callback) => { // Intercepta el evento y llama al callback
        ipcRenderer.on('codigoLocalStorageGenerado', (_event, codigo) => callback(codigo)); // Pasa el 'codigo' al callback
    },
    abrirNavegadorPuppeteer: (url, encabezados) => ipcRenderer.send('abrir-navegador', url, encabezados), // Nueva función

    iniciarSesion: (url, credenciales) => ipcRenderer.send('iniciar-sesion', url, credenciales),
    onSesionIniciada: (callback) => ipcRenderer.on('sesion-iniciada', callback)
});

