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
    iniciarSesion: (url, credenciales, test, visible) => ipcRenderer.send('iniciar-proceso-afip', { url, credenciales, test, visible }),
    
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
        procesarArchivo: (ruta) => ipcRenderer.invoke('extraerTablasPDF:procesar-archivo', ruta),
        seleccionarCarpeta: () => ipcRenderer.invoke('extraerTablasPDF:seleccionar-carpeta'),
        procesarCarpeta: (ruta) => ipcRenderer.invoke('extraerTablasPDF:procesar-carpeta', ruta),
        // Reusa el canal 'abrir-archivo' de home/main.js (en el hermano: 'shell:abrir-archivo')
        abrirArchivo: (ruta) => ipcRenderer.invoke('abrir-archivo', ruta)
    },

    // APIs de Usuario
    user: {
        create: (userData) => ipcRenderer.invoke('user:create', userData),
        getAll: () => ipcRenderer.invoke('user:getAll'),
        listCrud: () => ipcRenderer.invoke('user:listCrud'),
        getById: (userId) => ipcRenderer.invoke('user:get-by-id', userId),
        update: (userData) => ipcRenderer.invoke('user:update', userData),
        setTipoContribuyente: (id, tipoContribuyente) => ipcRenderer.invoke('user:setTipoContribuyente', { id, tipoContribuyente }),
        delete: (userId) => ipcRenderer.invoke('user:delete', userId),
        verifyOnCreate: (credenciales) => ipcRenderer.invoke('user:verify-on-create', credenciales),
        verifyBatch: (jobs) => ipcRenderer.invoke('user:verify-credentials', jobs),
        onVerificationProgress: (callback) => ipcRenderer.on('verification:progress', (_event, data) => callback(data))
    },

    // Estudios/grupos: etiqueta organizativa de los clientes (independiente del
    // representante AFIP). Ver docs/modelo_cliente/plan_grupos_estudios.
    grupos: {
        listar: () => ipcRenderer.invoke('grupos:listar'),
        crear: (datos) => ipcRenderer.invoke('grupos:crear', datos),
        renombrar: (datos) => ipcRenderer.invoke('grupos:renombrar', datos),
        eliminar: (id) => ipcRenderer.invoke('grupos:eliminar', { id })
    },

    // API para carga masiva de usuarios
    cargarUsuariosMasivo: (filePath) => ipcRenderer.invoke('cargar-usuarios-masivo', filePath),
    descargarPlantillaClientes: () => ipcRenderer.invoke('descargar-plantilla-clientes'),
    exportarClientesExcel: (opciones) => ipcRenderer.invoke('exportar-clientes-excel', opciones || {}),

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

    // APIs para Historial de acciones (bitacora persistente, solo lectura)
    historial: {
        listar: (filtros) => ipcRenderer.invoke('historial:listar', filtros),
        buscar: (texto, filtros) => ipcRenderer.invoke('historial:buscar', { texto, filtros })
    },

    // Plantillas Excel: cada plantilla transforma el Excel original de un cliente en
    // un archivo nuevo al lado. Ver docs/herramientas_archivos/plantillas_excel.md
    plantillasExcel: {
        listar: () => ipcRenderer.invoke('plantillasExcel:listar'),
        elegirArchivo: () => ipcRenderer.invoke('plantillasExcel:elegirArchivo'),
        detectar: (archivo) => ipcRenderer.invoke('plantillasExcel:detectar', { archivo }),
        procesar: (idPlantilla, archivo) => ipcRenderer.invoke('plantillasExcel:procesar', { idPlantilla, archivo })
    },

    // APIs para Consulta de Deuda
    consultaDeuda: {
        consultar: (datos, opciones) => ipcRenderer.invoke('consultaDeuda:consultar', datos, opciones),
        onConsultaDeudaUpdate: (callback) => ipcRenderer.on('consultaDeuda:update', (_event, datos) => callback(datos))
    },

    // APIs para Consulta de Comprobantes Emitidos
    consultaComprobantes: {
        consultar: (datos) => ipcRenderer.invoke('consultaComprobantes:consultar', datos)
    },

    // APIs para Notas de Crédito/Débito (listar/leer Excels + generar el lote de notas)
    notaCreditoDebito: {
        listarExcels: (datos) => ipcRenderer.invoke('notaCreditoDebito:listarExcels', datos),
        elegirExcel: (datos) => ipcRenderer.invoke('notaCreditoDebito:elegirExcel', datos),
        leerExcel: (datos) => ipcRenderer.invoke('notaCreditoDebito:leerExcel', datos),
        generarNotas: (datos) => ipcRenderer.invoke('notaCreditoDebito:generarNotas', datos)
    },

    // APIs para operaciones sobre Empresa (lectura on-demand desde AFIP)
    empresa: {
        analizarContribuyente: (datos) => ipcRenderer.invoke('empresa:analizarContribuyente', datos),
        // Lote: un login por credencial. Progreso por grupo vía onAnalizarLoteProgreso.
        analizarLote: (cuits, opciones = {}) => ipcRenderer.invoke('empresa:analizarLote', { cuits, ...opciones }),
        onAnalizarLoteProgreso: (callback) => ipcRenderer.on('empresa:analizarLote:progreso', (_event, data) => callback(data))
    },

    // Carpeta de datos: ver/cambiar dónde viven los .json (Fase 2).
    datos: {
        getInfo:      ()     => ipcRenderer.invoke('datos:getInfo'),
        abrirCarpeta: ()     => ipcRenderer.invoke('datos:abrirCarpeta'),
        elegirCarpeta:()     => ipcRenderer.invoke('datos:elegirCarpeta'),
        setCarpeta:   (ruta) => ipcRenderer.invoke('datos:setCarpeta', ruta),
        reiniciar:    ()     => ipcRenderer.invoke('datos:reiniciar')
    },

    // Modelo plano de contribuyente (Tareas 3-7). `listar` NO devuelve claves.
    contribuyente: {
        listar: (opts) => ipcRenderer.invoke('contribuyente:listar', opts),
        puntosDeVenta: (cuit) => ipcRenderer.invoke('contribuyente:puntosDeVenta', cuit)
    },

    // Lanzador de sesión: elige un contribuyente y abre el navegador ya logueado.
    // Ahora recibe el CUIT (el backend resuelve el acceso con resolverAcceso).
    sesion: {
        afip: (cuit) => ipcRenderer.invoke('afip:abrirSesion', cuit),
        atm:  (cuit) => ipcRenderer.invoke('atm:abrirSesion',  cuit),
        // Modo manual: recibe { cuit, clave } tipeados a mano (no busca en la base).
        afipManual: (datos) => ipcRenderer.invoke('afip:abrirSesionManual', datos),
        atmManual:  (datos) => ipcRenderer.invoke('atm:abrirSesionManual',  datos)
    },

    // APIs para Cuenta Tributaria (SCT)
    // modos: 'consultarA' | 'pagarA' | 'pagarDirectoB'
    cuentaTributaria: {
        procesar: (datos) => ipcRenderer.invoke('cuentaTributaria:procesar', datos),
        onUpdate: (callback) => ipcRenderer.on('cuentaTributaria:update', (_event, datos) => callback(datos))
    },

    // Servicio Declaración Jurada (carga de DDJJ desde Excel en Mis Aplicaciones Web).
    declaracionJurada: {
        probarAcceso: (datos) => ipcRenderer.invoke('declaracionJurada:probarAcceso', datos),
        cargar: (datos) => ipcRenderer.invoke('declaracionJurada:cargar', datos),
        elegirExcel: () => ipcRenderer.invoke('declaracionJurada:elegirExcel'),
        parsearHoja: (datos) => ipcRenderer.invoke('declaracionJurada:parsearHoja', datos),
        elegirTxt: (datos) => ipcRenderer.invoke('declaracionJurada:elegirTxt', datos),
        elegirCarpetaRetenciones: (datos) => ipcRenderer.invoke('declaracionJurada:elegirCarpetaRetenciones', datos),
        sugerirRetenciones: (datos) => ipcRenderer.invoke('declaracionJurada:sugerirRetenciones', datos),
        escribirDeducciones: (datos) => ipcRenderer.invoke('declaracionJurada:escribirDeducciones', datos),
        buscar: (datos) => ipcRenderer.invoke('declaracionJurada:buscar', datos)
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