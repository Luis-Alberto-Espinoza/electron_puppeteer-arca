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
        getById: (userId) => ipcRenderer.invoke('user:get-by-id', userId),
        update: (userData) => ipcRenderer.invoke('user:update', userData),
        delete: (userId) => ipcRenderer.invoke('user:delete', userId),
        verifyOnCreate: (credenciales) => ipcRenderer.invoke('user:verify-on-create', credenciales),
        verifyBatch: (jobs) => ipcRenderer.invoke('user:verify-credentials', jobs),
        onVerificationProgress: (callback) => ipcRenderer.on('verification:progress', (_event, data) => callback(data))
    },

    // API para carga masiva de usuarios
    cargarUsuariosMasivo: (filePath) => ipcRenderer.invoke('cargar-usuarios-masivo', filePath),

    // Canal para recibir la respuesta final de facturación
    onFacturaResultado: (callback) => {
        ipcRenderer.on('factura:resultado', (_event, resultado) => callback(resultado));
    },

    abrirArchivo: (ruta) => ipcRenderer.invoke('abrir-archivo', ruta),
    abrirDirectorio: (ruta) => ipcRenderer.invoke('shell:open-directory', ruta),

    // APIs para ATM (por servicio)
    atm: {
        constanciaFiscal: {
            generarLote: (datos) => ipcRenderer.invoke('atm:constanciaFiscal:generarLote', datos),
            onUpdate: (callback) => ipcRenderer.on('atm:constanciaFiscal:update', (_event, datos) => callback(datos))
        },
        planDePago: {
            generarLote: (datos) => ipcRenderer.invoke('atm:planDePago:generarLote', datos),
            onUpdate: (callback) => ipcRenderer.on('atm:planDePago:update', (_event, datos) => callback(datos))
        },
        retenciones: {
            generarLote: (datos) => ipcRenderer.invoke('atm:retenciones:generarLote', datos),
            onUpdate: (callback) => ipcRenderer.on('atm:retenciones:update', (_event, datos) => callback(datos))
        },
        tasaCero: {
            generarLote: (datos) => ipcRenderer.invoke('atm:tasaCero:generarLote', datos),
            onUpdate: (callback) => ipcRenderer.on('atm:tasaCero:update', (_event, datos) => callback(datos))
        },
        listas: {
            get:      (subservicio) => ipcRenderer.invoke('atm:listas:get', subservicio),
            guardar:  (datos)       => ipcRenderer.invoke('atm:listas:guardar', datos),
            renombrar:(datos)       => ipcRenderer.invoke('atm:listas:renombrar', datos),
            eliminar: (datos)       => ipcRenderer.invoke('atm:listas:eliminar', datos)
        }
    },

    // APIs para Planes de Pago (CUITs asociados + ejecución + listas)
    planesDePago: {
        cuits: {
            get:      (cuit)  => ipcRenderer.invoke('planesDePago:cuits:get', cuit),
            guardar:  (datos) => ipcRenderer.invoke('planesDePago:cuits:guardar', datos),
            editar:   (datos) => ipcRenderer.invoke('planesDePago:cuits:editar', datos),
            eliminar: (datos) => ipcRenderer.invoke('planesDePago:cuits:eliminar', datos)
        },
        listas: {
            get:       ()     => ipcRenderer.invoke('planesDePago:listas:get'),
            guardar:   (datos) => ipcRenderer.invoke('planesDePago:listas:guardar', datos),
            renombrar: (datos) => ipcRenderer.invoke('planesDePago:listas:renombrar', datos),
            eliminar:  (datos) => ipcRenderer.invoke('planesDePago:listas:eliminar', datos)
        },
        generar:      (datos) => ipcRenderer.invoke('planesDePago:generar', datos),
        generarLote:  (datos) => ipcRenderer.invoke('planesDePago:generarLote', datos),
        onUpdate: (callback) => ipcRenderer.on('planesDePago:update', (_event, datos) => callback(datos))
    },

    // APIs para VEP (Volante Electrónico de Pago)
    vep: {
        generar: (datos) => ipcRenderer.invoke('vep:generar', datos),
        onVEPUpdate: (callback) => ipcRenderer.on('vep:update', (_event, datos) => callback(datos))
    },

    // APIs para Consulta de Deuda
    consultaDeuda: {
        consultar: (datos) => ipcRenderer.invoke('consultaDeuda:consultar', datos),
        onConsultaDeudaUpdate: (callback) => ipcRenderer.on('consultaDeuda:update', (_event, datos) => callback(datos))
    },

    // APIs para Facturas Tipificadas
    facturaTipificada: {
        generar: (datos) => ipcRenderer.invoke('facturaTipificada:generar', datos),
        generarLote: (datos) => ipcRenderer.invoke('facturaTipificada:generarLote', datos),
        onFacturaTipificadaUpdate: (callback) => ipcRenderer.on('facturaTipificada:update', (_event, datos) => callback(datos)),
        onProgreso: (callback) => ipcRenderer.on('facturaTipificada:progreso', (_event, datos) => callback(datos))
    },

    // APIs para Facturas de Cliente (con progreso en tiempo real)
    facturaCliente: {
        generar: (datos) => ipcRenderer.invoke('facturaCliente:generar', datos),
        onProgreso: (callback) => ipcRenderer.on('facturaCliente:progreso', (_event, datos) => callback(datos)),
        onResultado: (callback) => ipcRenderer.on('facturaCliente:resultado', (_event, datos) => callback(datos))
    },
});