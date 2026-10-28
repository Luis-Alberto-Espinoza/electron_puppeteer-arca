// atm/constanciaFiscal/manager.js
// Manager para el servicio de Constancia Fiscal de ATM

const { flujoConstanciaFiscal } = require('../../puppeteer/atm/flujosDeTareas/flujo_constanciaFiscal_imprimir.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { historialRepo } = require('../../historial/historialRepo.js');
const { logErrorCliente } = require('../logErrorCliente.js');
const { crearAvisoProgreso } = require('../../comun/avisoProgreso.js');
const { estadoDelCliente } = require('../../comun/estadoResultado.js');
const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');

/**
 * Procesa un lote de usuarios para generar constancias fiscales
 * @param {Object} params - Parámetros del lote
 * @param {Array} params.usuarios - Lista de usuarios a procesar
 * @param {string} params.downloadsPath - Ruta de descargas
 * @param {boolean} [params.visible] - false = navegador oculto; si no llega, visible
 * @param {string[]} [params.documentos] - 'cumplimiento' | 'deuda' | 'inscripcion' (por defecto cumplimiento + deuda)
 * @param {Function} enviarProgreso - Callback para reportar progreso al frontend
 */
async function procesarLote({ usuarios, downloadsPath, visible, documentos }, enviarProgreso) {
    const corrida = puppeteerManager.nuevaCorrida();   // "⏹ Cancelar" del lanzador
    // Aviso con el contrato de la rueda (comun/avisoProgreso.js).
    const aviso = crearAvisoProgreso(enviarProgreso, usuarios.length, { corrida });
    aviso.general(`Iniciando proceso de Constancia Fiscal para ${usuarios.length} usuario(s).`);

    try {
        for (let i = 0; i < usuarios.length; i++) {
            const usuario = usuarios[i];
            if (!corrida.cancelada()) await corrida.carrera(procesarUsuario(usuario, downloadsPath, aviso, visible, documentos, corrida));
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

    aviso.finalizado('El proceso de Constancia Fiscal ha finalizado.');
}

/**
 * Procesa un único usuario
 */
async function procesarUsuario(usuario, downloadsPath, aviso, visible, documentos, corrida) {
    const { cuit, nombre = '', apellido = '', id } = usuario;
    const nombreCompleto = `${nombre} ${apellido || ''}`.trim();

    // Construir nombre para archivos (evitar "null" o "undefined")
    const partesNombre = [nombre, apellido].filter(parte => parte && parte.trim());
    const nombreParaArchivos = (partesNombre.length > 0 ? partesNombre.join('_') : cuit).replace(/\s+/g, '_');

    // (estado, mensaje, datosExtra): el nombre va aparte, NO dentro del mensaje.
    const enviarProgresoUsuario = aviso.paraCliente({ id, cuit, nombre: nombreCompleto });

    enviarProgresoUsuario('iniciando', 'Iniciando proceso de Constancia Fiscal...');

    try {
        // Modelo plano: la clave ATM la resuelve el backend (no viaja del frontend).
        const acceso = await getContribuyenteRepo().resolverAcceso(String(cuit), 'atm');
        if (!acceso) throw new Error('El contribuyente no tiene clave ATM validada.');
        const credenciales = { cuit: acceso.loginCuit, clave: acceso.loginClave };

        const resultadoFlujo = await flujoConstanciaFiscal(
            credenciales,
            nombreParaArchivos,
            downloadsPath,
            enviarProgresoUsuario,
            { visible, documentos }
        );
        if (corrida.cancelada()) return; // canceló mientras corría: el lote ya lo marcó

        if (resultadoFlujo && (resultadoFlujo.exito || resultadoFlujo.success)) {
            // El mensaje que se ve es el del flujo (viene en resultadoFlujo y pisa este).
            const incompleta = resultadoFlujo.descargaIncompleta === true;
            enviarProgresoUsuario.final(estadoDelCliente(resultadoFlujo), resultadoFlujo.mensaje, resultadoFlujo);
            historialRepo.registrar({
                dominio: 'constanciaFiscal', accion: 'generar', estado: incompleta ? 'error' : 'exito',
                cliente: historialRepo.clienteDesdeUsuario({ id, nombre: nombreCompleto, cuit }),
                resumen: incompleta ? `Constancias INCOMPLETAS: ${resultadoFlujo.mensaje}` : resultadoFlujo.mensaje,
                detalle: { documentos, archivos: resultadoFlujo.files, deudas: resultadoFlujo.deudas, fallos: resultadoFlujo.fallos }
            });
        }

    } catch (error) {
        if (corrida.cancelada()) return; // "⏹ Cancelar": no es un error del cliente
        logErrorCliente('Constancia Fiscal', nombreCompleto, error);
        enviarProgresoUsuario.final('error', `Error: ${error.message}`);
        historialRepo.registrar({
            dominio: 'constanciaFiscal', accion: 'generar', estado: 'error',
            cliente: historialRepo.clienteDesdeUsuario({ id, nombre: nombreCompleto, cuit }),
            resumen: 'Fallo al generar Constancia Fiscal', error: error.message
        });
    }
}

module.exports = { procesarLote };
