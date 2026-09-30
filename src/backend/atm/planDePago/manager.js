// atm/planDePago/manager.js
// Manager para el servicio de Plan de Pago de ATM

const { flujoPlanDePago } = require('../../puppeteer/atm/flujosDeTareas/flujo_planDepagoIngresosBruto.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { historialRepo } = require('../../historial/historialRepo.js');

/**
 * Procesa un lote de usuarios para generar planes de pago
 * @param {Object} params - Parámetros del lote
 * @param {Array} params.usuarios - Lista de usuarios a procesar
 * @param {string} params.downloadsPath - Ruta de descargas
 * @param {boolean} [params.visible] - false = navegador oculto; si no llega, visible
 * @param {Function} enviarProgreso - Callback para reportar progreso al frontend
 */
async function procesarLote({ usuarios, downloadsPath, visible }, enviarProgreso) {
    enviarProgreso({
        status: 'general',
        mensaje: `Iniciando proceso de Plan de Pago para ${usuarios.length} usuario(s).`
    });

    for (let i = 0; i < usuarios.length; i++) {
        const usuario = usuarios[i];
        await procesarUsuario(usuario, downloadsPath, enviarProgreso, visible);

        // Pausa entre usuarios para no sobrecargar el sistema
        if (i < usuarios.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    enviarProgreso({
        status: 'finalizado',
        mensaje: 'El proceso de Plan de Pago ha finalizado.'
    });
}

/**
 * Procesa un único usuario
 */
async function procesarUsuario(usuario, downloadsPath, enviarProgreso, visible) {
    const { cuit, nombre = '', apellido = '', id } = usuario;
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

    enviarProgresoUsuario('iniciando', 'Iniciando proceso de Plan de Pago...');

    try {
        // Modelo plano: la clave ATM la resuelve el backend (no viaja del frontend).
        const acceso = await getContribuyenteRepo().resolverAcceso(String(cuit), 'atm');
        if (!acceso) throw new Error('El contribuyente no tiene clave ATM validada.');
        const credenciales = { cuit: acceso.loginCuit, clave: acceso.loginClave };

        const resultadoFlujo = await flujoPlanDePago(
            credenciales,
            nombreParaArchivos,
            downloadsPath,
            enviarProgresoUsuario,
            { visible }
        );

        if (resultadoFlujo && (resultadoFlujo.exito || resultadoFlujo.success)) {
            enviarProgresoUsuario('exito_final', 'Plan de Pago generado con éxito.', resultadoFlujo);
            historialRepo.registrar({
                dominio: 'planDePago', accion: 'generar', estado: 'exito',
                cliente: historialRepo.clienteDesdeUsuario({ id, nombre: nombreCompleto, cuit }),
                resumen: 'Plan de Pago generado',
                detalle: { archivo: resultadoFlujo.rutaArchivo || resultadoFlujo.archivo }
            });
        }

    } catch (error) {
        console.error(`Error procesando Plan de Pago para ${nombreCompleto}:`, error);
        enviarProgresoUsuario('error', `Error: ${error.message}`);
        historialRepo.registrar({
            dominio: 'planDePago', accion: 'generar', estado: 'error',
            cliente: historialRepo.clienteDesdeUsuario({ id, nombre: nombreCompleto, cuit }),
            resumen: 'Fallo al generar Plan de Pago', error: error.message
        });
    }
}

module.exports = { procesarLote };
