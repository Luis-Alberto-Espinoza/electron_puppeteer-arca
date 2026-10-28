// atm/retenciones/manager.js
// Manager para el servicio de Descarga de Retenciones de ATM

const { flujoDescargaRetenciones } = require('../../puppeteer/atm/flujosDeTareas/flujo_descargaRetenciones.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { historialRepo } = require('../../historial/historialRepo.js');
const { logErrorCliente } = require('../logErrorCliente.js');
const { crearAvisoProgreso } = require('../../comun/avisoProgreso.js');
const { estadoDelCliente } = require('../../comun/estadoResultado.js');
const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');

/**
 * Procesa un lote de usuarios para descargar retenciones
 * @param {Object} params - Parámetros del lote
 * @param {Array} params.usuarios - Lista de usuarios a procesar (cada uno con su periodo)
 * @param {string} params.downloadsPath - Ruta de descargas
 * @param {boolean} [params.visible] - false = navegador oculto; si no llega, visible
 * @param {Function} enviarProgreso - Callback para reportar progreso al frontend
 */
async function procesarLote({ usuarios, downloadsPath, visible }, enviarProgreso) {
    const corrida = puppeteerManager.nuevaCorrida();   // "⏹ Cancelar" del lanzador
    // Aviso con el contrato de la rueda (comun/avisoProgreso.js).
    const aviso = crearAvisoProgreso(enviarProgreso, usuarios.length, { corrida });
    aviso.general(`Iniciando proceso de Descarga de Retenciones para ${usuarios.length} usuario(s).`);

    try {
        for (let i = 0; i < usuarios.length; i++) {
            const usuario = usuarios[i];
            if (!corrida.cancelada()) await corrida.carrera(procesarUsuario(usuario, downloadsPath, aviso, visible, corrida));
            // Cancelado: el que corría y los que faltan quedan CANCELADO (no FALLO).
            if (corrida.cancelada()) aviso.cancelado(usuario);
            aviso.clienteTerminado();

            // Pausa entre clientes para no sobrecargar el sistema
            if (!corrida.cancelada() && i < usuarios.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    } finally {
        corrida.terminar();
    }

    aviso.finalizado('El proceso de Descarga de Retenciones ha finalizado.');
}

/**
 * Procesa un único usuario
 */
async function procesarUsuario(usuario, downloadsPath, aviso, visible, corrida) {
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

    // (estado, mensaje, datosExtra): el nombre va aparte, NO dentro del mensaje.
    const enviarProgresoUsuario = aviso.paraCliente({ id, cuit, nombre: nombreCompleto });

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
            listaPeriodos,
            { visible }
        );
        if (corrida.cancelada()) return; // canceló mientras corría: el lote ya lo marcó

        if (resultadoFlujo && (resultadoFlujo.exito || resultadoFlujo.success)) {
            // Que el proceso haya terminado no quiere decir que esten todos los
            // archivos ni que todas las consultas hayan andado: eso NO puede salir
            // como exito (ver retenciones/resumenConsultas.js).
            const incompleta = resultadoFlujo.descargaIncompleta === true;

            // El mensaje que se ve es el del flujo (viene en resultadoFlujo y pisa este).
            enviarProgresoUsuario.final(estadoDelCliente(resultadoFlujo), resultadoFlujo.mensaje, resultadoFlujo);

            historialRepo.registrar({
                dominio: 'retenciones', accion: 'descargar',
                estado: incompleta ? 'error' : 'exito',
                cliente: historialRepo.clienteDesdeUsuario({ id, nombre: nombreCompleto, cuit }),
                resumen: incompleta
                    ? `Retenciones INCOMPLETAS${listaPeriodos.length ? ' (' + descripcionPeriodos + ')' : ''}: ${resultadoFlujo.mensaje}`
                    : `Retenciones descargadas${listaPeriodos.length ? ' (' + descripcionPeriodos + ')' : ''}`,
                detalle: {
                    periodos: listaPeriodos,
                    archivos: (resultadoFlujo.files || []).length,
                    archivosEsperados: resultadoFlujo.archivosEsperados,
                    incompletas: resultadoFlujo.incompletas,
                    consultasFallidas: resultadoFlujo.consultasFallidas,
                    archivo: resultadoFlujo.rutaArchivo || resultadoFlujo.archivo
                }
            });
        }

    } catch (error) {
        if (corrida.cancelada()) return; // "⏹ Cancelar": no es un error del cliente
        logErrorCliente('Retenciones', nombreCompleto, error);
        enviarProgresoUsuario.final('error', `Error: ${error.message}`);
        historialRepo.registrar({
            dominio: 'retenciones', accion: 'descargar', estado: 'error',
            cliente: historialRepo.clienteDesdeUsuario({ id, nombre: nombreCompleto, cuit }),
            resumen: 'Fallo al descargar Retenciones', error: error.message
        });
    }
}

module.exports = { procesarLote };
