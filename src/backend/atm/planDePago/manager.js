// atm/planDePago/manager.js
// Manager para el servicio de Plan de Pago de ATM

const { flujoPlanDePago } = require('../../puppeteer/atm/flujosDeTareas/flujo_planDepagoIngresosBruto.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { historialRepo } = require('../../historial/historialRepo.js');
const { logErrorCliente } = require('../logErrorCliente.js');
const { crearAvisoProgreso } = require('../../comun/avisoProgreso.js');
const { estadoDelCliente } = require('../../comun/estadoResultado.js');
const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');

/**
 * Procesa un lote de usuarios para generar planes de pago
 * @param {Object} params - Parámetros del lote
 * @param {Array} params.usuarios - Lista de usuarios a procesar
 * @param {string} params.downloadsPath - Ruta de descargas
 * @param {boolean} [params.visible] - false = navegador oculto; si no llega, visible
 * @param {boolean} [params.incluirNoVigentes] - true = todos los planes (anulados, cancelados…), no solo los VIGENTES
 * @param {string[]} [params.impuestos] - textos de los botones de ATM ("Ingresos Brutos", "Automotor"…); por defecto Ingresos Brutos
 * @param {Function} enviarProgreso - Callback para reportar progreso al frontend
 */
async function procesarLote({ usuarios, downloadsPath, visible, impuestos, incluirNoVigentes }, enviarProgreso) {
    const corrida = puppeteerManager.nuevaCorrida();   // "⏹ Cancelar" del lanzador
    // Aviso con el contrato de la rueda (comun/avisoProgreso.js).
    const aviso = crearAvisoProgreso(enviarProgreso, usuarios.length, { corrida });
    aviso.general(`Iniciando proceso de Plan de Pago para ${usuarios.length} usuario(s).`);

    try {
        for (let i = 0; i < usuarios.length; i++) {
            const usuario = usuarios[i];
            if (!corrida.cancelada()) await corrida.carrera(procesarUsuario(usuario, downloadsPath, aviso, visible, impuestos, incluirNoVigentes, corrida));
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

    aviso.finalizado('El proceso de Plan de Pago ha finalizado.');
}

/**
 * Procesa un único usuario
 */
async function procesarUsuario(usuario, downloadsPath, aviso, visible, impuestos, incluirNoVigentes, corrida) {
    const { cuit, nombre = '', apellido = '', id } = usuario;
    const nombreCompleto = `${nombre} ${apellido || ''}`.trim();

    // Construir nombre para archivos (evitar "null" o "undefined")
    const partesNombre = [nombre, apellido].filter(parte => parte && parte.trim());
    const nombreParaArchivos = (partesNombre.length > 0 ? partesNombre.join('_') : cuit).replace(/\s+/g, '_');

    // (estado, mensaje, datosExtra): el nombre va aparte, NO dentro del mensaje.
    const enviarProgresoUsuario = aviso.paraCliente({ id, cuit, nombre: nombreCompleto });

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
            // Los del cliente (si se eligieron por cliente) o los del lote.
            { visible, impuestos: (usuario.impuestos && usuario.impuestos.length) ? usuario.impuestos : impuestos, incluirNoVigentes: incluirNoVigentes === true }
        );
        if (corrida.cancelada()) return; // canceló mientras corría: el lote ya lo marcó

        if (resultadoFlujo && (resultadoFlujo.exito || resultadoFlujo.success)) {
            // El mensaje que se ve es el del flujo (cuántos planes, o "Sin planes de pago vigentes").
            const incompleta = resultadoFlujo.descargaIncompleta === true;
            enviarProgresoUsuario.final(estadoDelCliente(resultadoFlujo), resultadoFlujo.mensaje, resultadoFlujo);
            historialRepo.registrar({
                dominio: 'planDePago', accion: 'generar', estado: incompleta ? 'error' : 'exito',
                cliente: historialRepo.clienteDesdeUsuario({ id, nombre: nombreCompleto, cuit }),
                resumen: resultadoFlujo.mensaje,
                detalle: { archivos: resultadoFlujo.files }
            });
        }

    } catch (error) {
        if (corrida.cancelada()) return; // "⏹ Cancelar": no es un error del cliente
        logErrorCliente('Plan de Pago', nombreCompleto, error);
        enviarProgresoUsuario.final('error', `Error: ${error.message}`);
        historialRepo.registrar({
            dominio: 'planDePago', accion: 'generar', estado: 'error',
            cliente: historialRepo.clienteDesdeUsuario({ id, nombre: nombreCompleto, cuit }),
            resumen: 'Fallo al generar Plan de Pago', error: error.message
        });
    }
}

module.exports = { procesarLote };
