const { contextBridge, ipcRenderer } = require('electron');

// Combinar todas las APIs en un solo objeto
contextBridge.exposeInMainWorld('electronAPI', {
    // APIs existentes
    
    // API para manejar facturas
    sendFormData: (data) => ipcRenderer.send('formulario-enviado', data),
    onFormularioRecibido: (callback) => ipcRenderer.on('formulario-recibido', callback),
    onCodigoLocalStorageGenerado: (callback) => {
        ipcRenderer.on('codigoLocalStorageGenerado', (_event, codigo) => callback(codigo));
    },

    // manejo de seciones claves .env
    iniciarSesion: (url, credenciales, test) => ipcRenderer.send('iniciar-proceso-afip', { url, credenciales, test }),
    
    // no se para que se usa y si se usa 
    enviarNumeroEliminar: (data) => ipcRenderer.send('numero-eliminar', data),
    onResultadoNumeroEliminar: (callback) => ipcRenderer.on('resultado-numero-eliminar', (_event, resultado) => callback(resultado)),
    onStatusUpdate: (callback) => ipcRenderer.on('status-update', callback),
    
    // API para manejar el libro IVA
    procesarLibroIva: (data) => ipcRenderer.send('procesar-libro-iva', data),
    onLibroIvaProcesado: (callback) => ipcRenderer.on('libro-iva-procesado', callback),
    modificarSegunInforme: (data) => ipcRenderer.send('actualizar-segun-informe', data),
    
    // API para manejar archivos
    seleccionarArchivos: () => ipcRenderer.invoke('seleccionar-archivos'),

    // APIs de MercadoPago
    mercadoPago: {
        seleccionarArchivo: () => ipcRenderer.invoke('mercadopago:seleccionar-archivo'),
        procesarArchivo: (ruta) => ipcRenderer.invoke('mercadopago:procesar-archivo', ruta)
    },

    // APIs para extraer tablas de PDF
    extraerTablasPDF: {
        seleccionarArchivo: () => ipcRenderer.invoke('extraerTablasPDF:seleccionar-archivo'),
        procesarArchivo: (ruta) => ipcRenderer.invoke('extraerTablasPDF:procesar-archivo', ruta)
    },

    // APIs de Usuario
    user: {
        create: (userData) => ipcRenderer.invoke('user:create', userData),
        getAll: () => ipcRenderer.invoke('user:getAll'),
        update: (userData) => ipcRenderer.invoke('user:update', userData),
        delete: (userId) => ipcRenderer.invoke('user:delete', userId),
        verifyCredentials: (credenciales) => ipcRenderer.invoke('user:verifyCredentials', credenciales),
        verifyAndUpdate: (userData) => ipcRenderer.invoke('user:verifyAndUpdate', userData)
    },

    // Canal para recibir la respuesta final de facturación
    onFacturaResultado: (callback) => {
        ipcRenderer.on('factura:resultado', (_event, resultado) => callback(resultado));
    },

    abrirArchivo: (ruta) => ipcRenderer.invoke('abrir-archivo', ruta),
    abrirDirectorio: (ruta) => ipcRenderer.invoke('shell:open-directory', ruta),

    // APIs para ATM
    atm: {
        ejecutarFlujo: (datos) => ipcRenderer.invoke('atm:ejecutar-flujo', datos), // Para un solo usuario
        iniciarLote: (datos) => ipcRenderer.invoke('atm:iniciar-lote', datos),   // Para lotes
        onLoteUpdate: (callback) => ipcRenderer.on('atm:lote-update', (_event, datos) => callback(datos))
    },
});