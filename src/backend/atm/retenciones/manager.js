// atm/retenciones/manager.js
// Manager para el servicio de Descarga de Retenciones de ATM

const { flujoDescargaRetenciones } = require('../../puppeteer/atm/flujosDeTareas/flujo_descargaRetenciones.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { historialRepo } = require('../../historial/historialRepo.js');

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
    const { cuit, nombre = '', apellido = '', id, periodo = '', periodos } = usuario;
    const nombreCompleto = `${nombre} ${apellido || ''}`.trim();

    // El frontend manda un rango (periodos); si viniera el formato viejo, lo envolvemos.
    const listaPeriodos = Array.isArray(periodos) && periodos.length > 0
        ? periodos
        : (periodo ? [periodo] : []);

    const descripcionPeriodos = listaPeriodos.length === 0
        ? 'sin periodo'
        : (listaPeriodos.length === 1
            ? listaPeriodos[0]
            : `${listaPeriodos[0]} a ${listaPeriodos[listaPeriodos.length - 1]}, ${listaPeriodos.length} periodos`);

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

    enviarProgresoUsuario('iniciando', `Iniciando descarga de Retenciones (${descripcionPeriodos})...`);

    try {
        // Modelo plano: la clave ATM la resuelve el backend (no viaja del frontend).
        const acceso = await getContribuyenteRepo().resolverAcceso(String(cuit), 'atm');
        if (!acceso) throw new Error('El contribuyente no tiene clave ATM validada.');
        const credenciales = { cuit: acceso.loginCuit, clave: acceso.loginClave };

        const resultadoFlujo = await flujoDescargaRetenciones(
            credenciales,
            nombreParaArchivos,
            downloadsPath,
            enviarProgresoUsuario,
            listaPeriodos
        );

        if (resultadoFlujo && (resultadoFlujo.exito || resultadoFlujo.success)) {
            // Que el proceso haya terminado no quiere decir que esten todos los
            // archivos: si ATM informo registros y no entrego los 2 archivos de
            // alguna consulta, esto NO puede salir como exito.
            const incompleta = resultadoFlujo.descargaIncompleta === true;

            enviarProgresoUsuario(
                incompleta ? 'error' : 'exito_final',
                incompleta
                    ? `⚠️ Descarga INCOMPLETA para ${nombreCompleto}: ${resultadoFlujo.mensaje}`
                    : 'Retenciones descargadas con éxito.',
                resultadoFlujo
            );

            historialRepo.registrar({
                dominio: 'retenciones', accion: 'descargar',
                estado: incompleta ? 'error' : 'exito',
                cliente: historialRepo.clienteDesdeUsuario({ id, nombre: nombreCompleto, cuit }),
                resumen: incompleta
                    ? `Retenciones INCOMPLETAS${listaPeriodos.length ? ' (' + descripcionPeriodos + ')' : ''}: faltaron ${resultadoFlujo.archivosFaltantes} archivo(s)`
                    : `Retenciones descargadas${listaPeriodos.length ? ' (' + descripcionPeriodos + ')' : ''}`,
                detalle: {
                    periodos: listaPeriodos,
                    archivos: (resultadoFlujo.files || []).length,
                    archivosEsperados: resultadoFlujo.archivosEsperados,
                    incompletas: resultadoFlujo.incompletas,
                    archivo: resultadoFlujo.rutaArchivo || resultadoFlujo.archivo
                }
            });
        }

    } catch (error) {
        console.error(`Error descargando Retenciones para ${nombreCompleto}:`, error);
        enviarProgresoUsuario('error', `Error: ${error.message}`);
        historialRepo.registrar({
            dominio: 'retenciones', accion: 'descargar', estado: 'error',
            cliente: historialRepo.clienteDesdeUsuario({ id, nombre: nombreCompleto, cuit }),
            resumen: 'Fallo al descargar Retenciones', error: error.message
        });
    }
}

module.exports = { procesarLote };
