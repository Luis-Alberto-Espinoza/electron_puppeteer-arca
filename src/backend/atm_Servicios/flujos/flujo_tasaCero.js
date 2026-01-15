const { parentPort, workerData } = require('worker_threads');
const { ejecutarFlujoPuppeteerTasaCero } = require('../../puppeteer/ATM/flujosDeTareas/flujo_tasaCero_puppeteer.js');

// ============================================================================
// CONSTANTS - SELECTORES CSS Y CONFIGURACIÓN
// ============================================================================
const CONSTANTS = {
    // URLs
    URL_LOGIN_ATM: 'https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp',

    // NOTA: Los selectores de login YA ESTÁN en login_atm.js, no es necesario duplicarlos aquí

    // Navegación al servicio
    SELECTOR_MENU_APLICATIVOS: '', // TODO: Rellenar (ej: '#menu-aplicativos' o 'a[title="Aplicativos"]')
    SELECTOR_OPCION_TASA_CERO: '', // TODO: Rellenar (ej: 'a:has-text("Tasa Cero")')

    // Modal de formulario ya descargado (CASO B)
    SELECTOR_AVISO_YA_DESCARGADO: '', // TODO: Rellenar
    TEXTO_AVISO_YA_DESCARGADO: 'Formulario ya descargado', // Texto a buscar
    SELECTOR_BTN_CERRAR_AVISO: '', // TODO: Rellenar (ej: botón cerrar del modal)

    // Estado de Solicitudes (CASO B - Reimpresión)
    SELECTOR_BTN_ESTADO_SOLICITUDES: '', // TODO: Rellenar
    SELECTOR_TABLA_SOLICITUDES: '', // TODO: Rellenar (ej: 'table.solicitudes')
    SELECTOR_FILA_TABLA: '', // TODO: Rellenar (ej: 'table tbody tr')
    SELECTOR_BTN_REIMPRIMIR: '', // TODO: Rellenar (ej: 'button.reimprimir' o 'a.reimprimir')

    // Formulario Tasa Cero (CASO A - Generación)
    // NOTA: El periodo se selecciona automáticamente (última opción del select)
    SELECTOR_BTN_GENERAR: '', // TODO: Rellenar

    // Configuración
    TIMEOUT_NAVEGACION: 30000, // 30 segundos
    TIMEOUT_SELECTOR: 10000,   // 10 segundos
    PAUSA_ENTRE_CLIENTES: 2000, // 2 segundos entre cada cliente
};

// ============================================================================
// FUNCIÓN: procesarCliente
// Procesa un cliente individual siguiendo todo el flujo de Tasa Cero
// ============================================================================
async function procesarCliente(cliente, downloadsPath) {
    const { cuit, claveATM, nombre = '', apellido = '', id, periodo } = cliente;
    const nombreCompleto = `${nombre} ${apellido || ''}`.trim();
    // Construir nombre para archivos (evitar "null" o "undefined")
    const partesNombre = [nombre, apellido].filter(parte => parte && parte.trim());
    const nombreParaArchivos = (partesNombre.length > 0 ? partesNombre.join('_') : cuit).replace(/\s+/g, '_');

    // Función para enviar progreso al hilo principal
    const enviarProgreso = (estado, mensaje, datosAdicionales = {}) => {
        parentPort.postMessage({
            clienteId: id || cuit,
            nombre: nombreCompleto,
            estado,
            mensaje: `[Cliente: ${nombreCompleto}] ${mensaje}`,
            ...datosAdicionales
        });
    };

    enviarProgreso('iniciando', `Iniciando proceso de Tasa Cero para periodo ${periodo}...`);

    try {
        // Delegar al flujo de Puppeteer
        const resultadoFlujo = await ejecutarFlujoPuppeteerTasaCero({
            credenciales: {
                cuit,
                clave: claveATM
            },
            nombreCliente: nombreCompleto,
            clienteId: id || cuit,
            downloadsPath: downloadsPath,
            nombreUsuario: nombreParaArchivos,
            periodo: periodo, // Pasar el periodo seleccionado
            enviarProgreso, // Callback para reportar progreso
            constants: CONSTANTS
        });

        // Enviar mensaje final según el resultado
        if (resultadoFlujo && (resultadoFlujo.exito || resultadoFlujo.success)) {
            enviarProgreso('exito_final', 'Comprobante Tasa Cero descargado exitosamente.', {
                archivoPdf: resultadoFlujo.rutaArchivo,
                downloadDir: resultadoFlujo.carpetaDestino, // Para botón "Abrir Carpeta"
                periodo: resultadoFlujo.periodo,
                caso: resultadoFlujo.caso // 'GENERACION' o 'REIMPRESION'
            });
        } else {
            enviarProgreso('error', resultadoFlujo.mensaje || 'Error desconocido al procesar Tasa Cero.');
        }

    } catch (error) {
        console.error(`Error fatal procesando al cliente ${nombreCompleto}:`, error);

        // Categorizar el error
        let mensajeError = `Error: ${error.message}`;

        if (error.message.includes('Credenciales inválidas')) {
            mensajeError = 'Credenciales inválidas. Verifique usuario y contraseña.';
        } else if (error.message.includes('Cambio de contraseña')) {
            mensajeError = 'Se requiere cambio de contraseña y no se pudo omitir.';
        } else if (error.message.includes('timeout')) {
            mensajeError = 'Tiempo de espera agotado. El sitio no respondió a tiempo.';
        }

        enviarProgreso('error', mensajeError);
    }
}

// ============================================================================
// FUNCIÓN: iniciarProcesoLote
// Orquesta el procesamiento de múltiples clientes en secuencia
// ============================================================================
const iniciarProcesoLote = async () => {
    const { clientes, downloadsPath } = workerData;

    parentPort.postMessage({
        estado: 'general',
        mensaje: `Iniciando proceso de Tasa Cero para ${clientes.length} cliente(s).`
    });

    // Procesar clientes UNO POR UNO en secuencia (no paralelo)
    for (let i = 0; i < clientes.length; i++) {
        const cliente = clientes[i];

        parentPort.postMessage({
            estado: 'general',
            mensaje: `Procesando cliente ${i + 1} de ${clientes.length}...`
        });

        await procesarCliente(cliente, downloadsPath);

        // Pausa entre clientes para no sobrecargar el sistema
        if (i < clientes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, CONSTANTS.PAUSA_ENTRE_CLIENTES));
        }
    }

    parentPort.postMessage({
        estado: 'finalizado',
        mensaje: 'El proceso de Tasa Cero ha finalizado para todos los clientes.'
    });
};

// ============================================================================
// INICIAR PROCESO
// ============================================================================
iniciarProcesoLote().catch(error => {
    console.error('Error crítico en el flujo de Tasa Cero:', error);
    parentPort.postMessage({
        estado: 'error_fatal',
        mensaje: `Error crítico: ${error.message}`
    });
});
