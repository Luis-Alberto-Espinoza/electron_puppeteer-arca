// atm/retenciones/manager.js
// Manager para el servicio de Descarga de Retenciones de ATM

const { flujoDescargaRetenciones } = require('../../puppeteer/atm/flujosDeTareas/flujo_descargaRetenciones.js');

/**
 * Procesa un lote de usuarios para descargar retenciones
 * @param {Object} params - Parámetros del lote
 * @param {Array} params.usuarios - Lista de usuarios a procesar (cada uno con su periodo)
 * @param {string} params.downloadsPath - Ruta de descargas
 * @param {Function} enviarProgreso - Callback para reportar progreso al frontend
 */
async function procesarLote({ usuarios, downloadsPath }, enviarProgreso) {
    enviarProgreso({
        status: 'general',
        mensaje: `Iniciando proceso de Descarga de Retenciones para ${usuarios.length} usuario(s).`
    });

    for (let i = 0; i < usuarios.length; i++) {
        const usuario = usuarios[i];
        await procesarUsuario(usuario, downloadsPath, enviarProgreso);

        // Pausa entre usuarios para no sobrecargar el sistema
        if (i < usuarios.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    enviarProgreso({
        status: 'finalizado',
        mensaje: 'El proceso de Descarga de Retenciones ha finalizado.'
    });
}

/**
 * Procesa un único usuario
 */
async function procesarUsuario(usuario, downloadsPath, enviarProgreso) {
    const { cuit, claveATM, nombre = '', apellido = '', id, periodo = '' } = usuario;
    const nombreCompleto = `${nombre} ${apellido || ''}`.trim();

    // Construir nombre para archivos (evitar "null" o "undefined")
    const partesNombre = [nombre, apellido].filter(parte => parte && parte.trim());
    const nombreParaArchivos = (partesNombre.length > 0 ? partesNombre.join('_') : cuit).replace(/\s+/g, '_');

    const enviarProgresoUsuario = (status, mensaje, datosAdicionales = {}) => {
        enviarProgreso({
            userId: id,
            nombre: nombreCompleto,
            status,
            mensaje: `[Usuario: ${nombreCompleto}] ${mensaje}`,
            ...datosAdicionales
        });
    };

    enviarProgresoUsuario('iniciando', `Iniciando descarga de Retenciones (periodo: ${periodo})...`);

    try {
        const credenciales = { cuit, clave: claveATM };

        const resultadoFlujo = await flujoDescargaRetenciones(
            credenciales,
            nombreParaArchivos,
            downloadsPath,
            enviarProgresoUsuario,
            periodo
        );

        if (resultadoFlujo && (resultadoFlujo.exito || resultadoFlujo.success)) {
            enviarProgresoUsuario('exito_final', 'Retenciones descargadas con éxito.', resultadoFlujo);
        }

    } catch (error) {
        console.error(`Error descargando Retenciones para ${nombreCompleto}:`, error);
        enviarProgresoUsuario('error', `Error: ${error.message}`);
    }
}

module.exports = { procesarLote };
