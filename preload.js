const { contextBridge, ipcRenderer } = require('electron');
require('dotenv').config();

contextBridge.exposeInMainWorld('electronAPI', {
    sendFormData: (data) => ipcRenderer.send('formulario-enviado', data),
    onFormularioRecibido: (callback) => ipcRenderer.on('formulario-recibido', callback),
    onCodigoLocalStorageGenerado: (callback) => {
        ipcRenderer.on('codigoLocalStorageGenerado', (_event, codigo) => callback(codigo));
    },

    iniciarSesion: (url, credenciales, test) => ipcRenderer.send('formulario-enviado', { servicio: 'login', url, credenciales, test }),

    enviarNumeroEliminar: (data) => ipcRenderer.send('numero-eliminar', data),
    onResultadoNumeroEliminar: (callback) => ipcRenderer.on('resultado-numero-eliminar', (_event, resultado) => callback(resultado)),


    // metodo para manejar el envio del contenido del .env
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', callback),
    getEnv: (key) => process.env[key],

    // Métodos específicos para libro IVA
    procesarLibroIva: (data) => ipcRenderer.send('procesar-libro-iva', data),
    onLibroIvaProcesado: (callback) => ipcRenderer.on('libro-iva-procesado', callback),
    modificarSegunInforme: (data) => ipcRenderer.send('actualizar-segun-informe', data),

    // Método original para seleccionar archivos (para otras funcionalidades)
    seleccionarArchivos: () => ipcRenderer.invoke('seleccionar-archivos'),

    // NUEVO: APIs específicas para MercadoPago
    mercadoPago: {
        seleccionarArchivo: () => ipcRenderer.invoke('mercadopago:seleccionar-archivo'),
        procesarArchivo: (ruta) => {
            return ipcRenderer.invoke('mercadopago:procesar-archivo', ruta);
        }
    }
});