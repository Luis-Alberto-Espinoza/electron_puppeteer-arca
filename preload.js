const { contextBridge, ipcRenderer } = require('electron');
require('dotenv').config(); // Cargar variables de entorno desde .env

contextBridge.exposeInMainWorld('electronAPI', {
    sendFormData: (data) => ipcRenderer.send('formulario-enviado', data),
    onFormularioRecibido: (callback) => ipcRenderer.on('formulario-recibido', callback),
    onCodigoLocalStorageGenerado: (callback) => { // Intercepta el evento y llama al callback
        ipcRenderer.on('codigoLocalStorageGenerado', (_event, codigo) => callback(codigo)); // Pasa el 'codigo' al callback
    },
    abrirNavegadorPuppeteer: (url, encabezados) => ipcRenderer.send('abrir-navegador', url, encabezados), 

    iniciarSesion: (url, credenciales, test) => ipcRenderer.send('formulario-enviado', { servicio: 'login', url, credenciales, test }),
    onSesionIniciada: (callback) => ipcRenderer.on('sesion-iniciada', callback),

    enviarNumeroEliminar: (data) => ipcRenderer.send('numero-eliminar', data),
    onResultadoNumeroEliminar: (callback) => ipcRenderer.on('resultado-numero-eliminar', (_event, resultado) => callback(resultado)),

    onStatusUpdate: (callback) => ipcRenderer.on('status-update', callback), // Nueva función para recibir actualizaciones de estado
    getEnv: (key) => process.env[key], // Exponer variables de entorno al frontend

    // Métodos específicos para libro IVA
    procesarLibroIva: (data) => ipcRenderer.send('procesar-libro-iva', data),
    onLibroIvaProcesado: (callback) => ipcRenderer.on('libro-iva-procesado', callback),
    seleccionarArchivos: () => ipcRenderer.invoke('seleccionar-archivos'),
    modificarSegunInforme:(data) => ipcRenderer.send('actualizar-segun-informe', data),
    getEnv: (key) => process.env[key]
});

