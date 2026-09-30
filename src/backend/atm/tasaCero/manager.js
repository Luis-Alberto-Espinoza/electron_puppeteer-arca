// atm/tasaCero/manager.js
// Manager para el servicio de Tasa Cero de ATM

const { ejecutarFlujoPuppeteerTasaCero } = require('../../puppeteer/atm/flujosDeTareas/flujo_tasaCero_puppeteer.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { historialRepo } = require('../../historial/historialRepo.js');

// Constantes de configuración
const CONSTANTS = {
    PAUSA_ENTRE_CLIENTES: 2000 // 2 segundos entre cada cliente
};

/**
 * Procesa un lote de clientes para generar comprobantes de Tasa Cero
 * @param {Object} params - Parámetros del lote
 * @param {Array} params.clientes - Lista de clientes a procesar (cada uno con su periodo)
 * @param {string} params.downloadsPath - Ruta de descargas
 * @param {boolean} [params.visible] - false = navegador oculto; si no llega, visible
 * @param {Function} enviarProgreso - Callback para reportar progreso al frontend
 */
async function procesarLote({ clientes, downloadsPath, visible }, enviarProgreso) {
    enviarProgreso({
        estado: 'general',
        mensaje: `Iniciando proceso de Tasa Cero para ${clientes.length} cliente(s).`
    });

    for (let i = 0; i < clientes.length; i++) {
        const cliente = clientes[i];

        enviarProgreso({
            estado: 'general',
            mensaje: `Procesando cliente ${i + 1} de ${clientes.length}...`
        });

        await procesarCliente(cliente, downloadsPath, enviarProgreso, visible);

        // Pausa entre clientes para no sobrecargar el sistema
        if (i < clientes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, CONSTANTS.PAUSA_ENTRE_CLIENTES));
        }
    }

    enviarProgreso({
        estado: 'finalizado',
        mensaje: 'El proceso de Tasa Cero ha finalizado para todos los clientes.'
    });
}

/**
 * Procesa un único cliente
 */
async function procesarCliente(cliente, downloadsPath, enviarProgreso, visible) {
    const { cuit, nombre = '', apellido = '', id, periodo } = cliente;
    const nombreCompleto = `${nombre} ${apellido || ''}`.trim();

    // Construir nombre para archivos (evitar "null" o "undefined")
    const partesNombre = [nombre, apellido].filter(parte => parte && parte.trim());
    const nombreParaArchivos = (partesNombre.length > 0 ? partesNombre.join('_') : cuit).replace(/\s+/g, '_');

    const enviarProgresoCliente = (estado, mensaje, datosAdicionales = {}) => {
        enviarProgreso({
            clienteId: id || cuit,
            nombre: nombreCompleto,
            estado,
            mensaje: `[Cliente: ${nombreCompleto}] ${mensaje}`,
            ...datosAdicionales
        });
    };

    enviarProgresoCliente('iniciando', `Iniciando proceso de Tasa Cero para periodo ${periodo}...`);

    try {
        // Modelo plano: la clave ATM la resuelve el backend (no viaja del frontend).
        const acceso = await getContribuyenteRepo().resolverAcceso(String(cuit), 'atm');
        if (!acceso) throw new Error('El contribuyente no tiene clave ATM validada.');
        const resultadoFlujo = await ejecutarFlujoPuppeteerTasaCero({
            credenciales: {
                cuit: acceso.loginCuit,
                clave: acceso.loginClave
            },
            nombreCliente: nombreCompleto,
            clienteId: id || cuit,
            downloadsPath: downloadsPath,
            nombreUsuario: nombreParaArchivos,
            periodo: periodo,
            enviarProgreso: enviarProgresoCliente,
            constants: CONSTANTS,
            visible
        });

        const clienteHist = historialRepo.clienteDesdeUsuario({ id: id || cuit, nombre: nombreCompleto, cuit });

        if (resultadoFlujo && (resultadoFlujo.exito || resultadoFlujo.success)) {
            enviarProgresoCliente('exito', 'Comprobante Tasa Cero descargado exitosamente.', {
                archivoPdf: resultadoFlujo.rutaArchivo,
                downloadDir: resultadoFlujo.carpetaDestino,
                periodo: resultadoFlujo.periodo,
                caso: resultadoFlujo.caso
            });
            historialRepo.registrar({
                dominio: 'tasaCero', accion: 'generar', estado: 'exito',
                cliente: clienteHist,
                resumen: `Comprobante Tasa Cero descargado${resultadoFlujo.periodo ? ' ' + resultadoFlujo.periodo : ''}`,
                detalle: { periodo: resultadoFlujo.periodo, archivo: resultadoFlujo.rutaArchivo, caso: resultadoFlujo.caso }
            });
        } else {
            const msg = resultadoFlujo?.mensaje || 'Error desconocido al procesar Tasa Cero.';
            enviarProgresoCliente('error', msg);
            historialRepo.registrar({
                dominio: 'tasaCero', accion: 'generar', estado: 'error',
                cliente: clienteHist,
                resumen: 'Fallo al generar Tasa Cero', error: msg
            });
        }

    } catch (error) {
        console.error(`Error procesando Tasa Cero para ${nombreCompleto}:`, error);

        // Categorizar el error
        let mensajeError = `Error: ${error.message}`;

        if (error.message.includes('Credenciales inválidas')) {
            mensajeError = 'Credenciales inválidas. Verifique usuario y contraseña.';
        } else if (error.message.includes('Cambio de contraseña')) {
            mensajeError = 'Se requiere cambio de contraseña y no se pudo omitir.';
        } else if (error.message.includes('timeout')) {
            mensajeError = 'Tiempo de espera agotado. El sitio no respondió a tiempo.';
        }

        enviarProgresoCliente('error', mensajeError);
        historialRepo.registrar({
            dominio: 'tasaCero', accion: 'generar', estado: 'error',
            cliente: historialRepo.clienteDesdeUsuario({ id: id || cuit, nombre: nombreCompleto, cuit }),
            resumen: 'Fallo al generar Tasa Cero', error: mensajeError
        });
    }
}

module.exports = { procesarLote };
