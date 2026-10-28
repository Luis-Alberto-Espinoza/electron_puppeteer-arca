// atm/apremios/manager.js
// Manager de Apremios ATM: un cliente por vez (ATM no tiene representación: cada uno
// entra con su clave), cada cliente con SUS impuestos elegidos en el front.

const { flujoApremios } = require('../../puppeteer/atm/flujosDeTareas/flujo_apremios.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { historialRepo } = require('../../historial/historialRepo.js');
const { logErrorCliente } = require('../logErrorCliente.js');
const { crearAvisoProgreso } = require('../../comun/avisoProgreso.js');
const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const { IMPUESTO_POR_ID, normalizarImpuestos } = require('./tablaApremios.js');

const PAUSA_ENTRE_CLIENTES = 1000;

const formatoPesos = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Una línea por impuesto, para el front y el historial. */
function describirResultado(r) {
    const nombre = IMPUESTO_POR_ID.get(r.impuesto).hoja;
    if (!r.ok) return { impuesto: nombre, estado: 'error', texto: `${nombre}: no se pudo consultar (${r.error})` };
    const { cantidad, conSaldo, saldoTotal } = r.resumen;
    if (cantidad === 0) return { impuesto: nombre, estado: 'vacio', texto: `${nombre}: sin apremios` };
    const saldo = conSaldo > 0 ? `, ${conSaldo} con saldo ($ ${formatoPesos(saldoTotal)})` : ', ninguno con saldo';
    return { impuesto: nombre, estado: conSaldo > 0 ? 'con_saldo' : 'ok', texto: `${nombre}: ${cantidad} apremio(s)${saldo}` };
}

/**
 * @param {Object} params
 * @param {Array<{id, cuit, nombre?, apellido?, impuestos: string[]}>} params.clientes
 * @param {string} params.downloadsPath
 * @param {boolean} [params.visible]
 * @param {Function} enviarProgreso
 */
async function procesarLote({ clientes, downloadsPath, visible }, enviarProgreso) {
    const corrida = puppeteerManager.nuevaCorrida();   // "⏹ Cancelar" del lanzador
    // Aviso con el contrato de la rueda (comun/avisoProgreso.js).
    const aviso = crearAvisoProgreso(enviarProgreso, clientes.length, { corrida });
    aviso.general(`Iniciando Apremios ATM para ${clientes.length} cliente(s).`);

    try {
        for (let i = 0; i < clientes.length; i++) {
            const cliente = clientes[i];
            if (!corrida.cancelada()) await corrida.carrera(procesarCliente(cliente, downloadsPath, aviso, visible, corrida));
            // Cancelado: el que corría y los que faltan quedan CANCELADO (no FALLO).
            if (corrida.cancelada()) aviso.cancelado(cliente);
            aviso.clienteTerminado();

            // Pausa entre clientes para no sobrecargar el sistema
            if (!corrida.cancelada() && i < clientes.length - 1) {
                await new Promise(resolve => setTimeout(resolve, PAUSA_ENTRE_CLIENTES));
            }
        }
    } finally {
        corrida.terminar();
    }

    aviso.finalizado('Apremios ATM finalizado.');
}

async function procesarCliente(cliente, downloadsPath, aviso, visible, corrida) {
    const { cuit, id } = cliente;
    const nombreCompleto = `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim() || String(cuit);
    const impuestos = normalizarImpuestos(cliente.impuestos);
    const clienteHist = historialRepo.clienteDesdeUsuario({ id: id || cuit, nombre: nombreCompleto, cuit });

    const enviar = aviso.paraCliente({ id: id || cuit, cuit, nombre: nombreCompleto });

    if (impuestos.length === 0) {
        enviar.final('error', 'No se eligió ningún impuesto para consultar.');
        return;
    }

    enviar('iniciando', `Consultando: ${impuestos.map(i => IMPUESTO_POR_ID.get(i).hoja).join(', ')}...`);

    try {
        // La clave ATM la resuelve el backend (no viaja del front).
        const acceso = await getContribuyenteRepo().resolverAcceso(String(cuit), 'atm');
        if (!acceso) throw new Error('El contribuyente no tiene clave ATM cargada.');

        const r = await flujoApremios({
            credenciales: { cuit: acceso.loginCuit, clave: acceso.loginClave },
            contribuyente: { cuit: acceso.objetivoCuit, nombre: acceso.objetivoNombre || nombreCompleto },
            impuestos,
            downloadsPath,
            enviarProgreso: (estado, mensaje) => enviar(estado, mensaje),
            visible
        });
        if (corrida.cancelada()) return; // canceló mientras corría: el lote ya lo marcó

        const detalle = r.resultados.map(describirResultado);
        const fallidos = detalle.filter(d => d.estado === 'error');
        const estado = fallidos.length === 0 ? 'exito' : (fallidos.length === detalle.length ? 'error' : 'parcial');
        const mensaje = estado === 'exito'
            ? 'Excel de apremios guardado en la carpeta del cliente.'
            : estado === 'parcial'
                ? `Excel guardado, pero ${fallidos.length} impuesto(s) no se pudieron consultar.`
                : 'No se pudo consultar ningún impuesto (el Excel quedó con el detalle del error).';

        // Una línea por cliente en la terminal: lo justo para saber qué trajo.
        const porImpuesto = r.resultados.map(x => `${IMPUESTO_POR_ID.get(x.impuesto).hoja} ${x.ok ? x.resumen.cantidad : 'ERROR'}`).join(' · ');
        console.log(`[Apremios] ${cuit} ${nombreCompleto}: ${porImpuesto} → ${r.rutaExcel}`);

        enviar.final(estado, mensaje, { files: [r.rutaExcel], downloadDir: r.downloadDir, detalleApremios: detalle });
        historialRepo.registrar({
            dominio: 'apremios', accion: 'consultar', estado: estado === 'error' ? 'error' : 'exito',
            cliente: clienteHist,
            resumen: detalle.map(d => d.texto).join(' · '),
            detalle: { archivo: r.rutaExcel, impuestos },
            ...(fallidos.length ? { error: fallidos.map(d => d.texto).join(' · ') } : {})
        });

    } catch (error) {
        if (corrida.cancelada()) return; // "⏹ Cancelar": no es un error del cliente
        logErrorCliente('Apremios', nombreCompleto, error);
        enviar.final('error', error.message, { error: error.code || 'FLUJO_ERROR' });
        historialRepo.registrar({
            dominio: 'apremios', accion: 'consultar', estado: 'error',
            cliente: clienteHist, resumen: 'Fallo la consulta de apremios', error: error.message
        });
    }
}

module.exports = { procesarLote, describirResultado };
