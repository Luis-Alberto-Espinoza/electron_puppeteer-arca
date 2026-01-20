// atm/constanciaFiscal/manager.js
// Manager para el servicio de Constancia Fiscal de ATM

const { flujoConstanciaFiscal } = require('../../puppeteer/atm/flujosDeTareas/flujo_constanciaFiscal_imprimir.js');

/**
 * Procesa un lote de usuarios para generar constancias fiscales
 * @param {Object} params - Parámetros del lote
 * @param {Array} params.usuarios - Lista de usuarios a procesar
 * @param {string} params.downloadsPath - Ruta de descargas
 * @param {Function} enviarProgreso - Callback para reportar progreso al frontend
 */
async function procesarLote({ usuarios, downloadsPath }, enviarProgreso) {
    enviarProgreso({
        status: 'general',
        mensaje: `Iniciando proceso de Constancia Fiscal para ${usuarios.length} usuario(s).`
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
        mensaje: 'El proceso de Constancia Fiscal ha finalizado.'
    });
}

/**
 * Procesa un único usuario
 */
async function procesarUsuario(usuario, downloadsPath, enviarProgreso) {
    const { cuit, claveATM, nombre = '', apellido = '', id } = usuario;
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

    enviarProgresoUsuario('iniciando', 'Iniciando proceso de Constancia Fiscal...');

    try {
        const credenciales = { cuit, clave: claveATM };

        const resultadoFlujo = await flujoConstanciaFiscal(
            credenciales,
            nombreParaArchivos,
            downloadsPath,
            enviarProgresoUsuario
        );

        if (resultadoFlujo && (resultadoFlujo.exito || resultadoFlujo.success)) {
            enviarProgresoUsuario('exito_final', 'Constancia Fiscal generada con éxito.', resultadoFlujo);
        }

    } catch (error) {
        console.error(`Error procesando Constancia Fiscal para ${nombreCompleto}:`, error);
        enviarProgresoUsuario('error', `Error: ${error.message}`);
    }
}

module.exports = { procesarLote };
