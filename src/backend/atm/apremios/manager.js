// atm/apremios/manager.js
// Manager de Apremios ATM: un cliente por vez (ATM no tiene representación: cada uno
// entra con su clave), cada cliente con SUS impuestos elegidos en el front.

const { flujoApremios } = require('../../puppeteer/atm/flujosDeTareas/flujo_apremios.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');
const { historialRepo } = require('../../historial/historialRepo.js');
const { logErrorCliente } = require('../logErrorCliente.js');
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
    enviarProgreso({ estado: 'general', mensaje: `Iniciando Apremios ATM para ${clientes.length} cliente(s).` });

    for (let i = 0; i < clientes.length; i++) {
        await procesarCliente(clientes[i], downloadsPath, enviarProgreso, visible);
        if (i < clientes.length - 1) await new Promise(r => setTimeout(r, PAUSA_ENTRE_CLIENTES));
    }

    enviarProgreso({ estado: 'finalizado', mensaje: 'Apremios ATM finalizado.' });
}

async function procesarCliente(cliente, downloadsPath, enviarProgreso, visible) {
    const { cuit, id } = cliente;
    const nombreCompleto = `${cliente.nombre || ''} ${cliente.apellido || ''}`.trim() || String(cuit);
    const impuestos = normalizarImpuestos(cliente.impuestos);
    const clienteHist = historialRepo.clienteDesdeUsuario({ id: id || cuit, nombre: nombreCompleto, cuit });

    const enviar = (estado, mensaje, extra = {}) => enviarProgreso({
        clienteId: id || cuit, nombre: nombreCompleto, estado, mensaje, ...extra
    });

    if (impuestos.length === 0) {
        enviar('error', 'No se eligió ningún impuesto para consultar.');
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

        enviar(estado, mensaje, { files: [r.rutaExcel], downloadDir: r.downloadDir, detalleApremios: detalle });
        historialRepo.registrar({
            dominio: 'apremios', accion: 'consultar', estado: estado === 'error' ? 'error' : 'exito',
            cliente: clienteHist,
            resumen: detalle.map(d => d.texto).join(' · '),
            detalle: { archivo: r.rutaExcel, impuestos },
            ...(fallidos.length ? { error: fallidos.map(d => d.texto).join(' · ') } : {})
        });

    } catch (error) {
        logErrorCliente('Apremios', nombreCompleto, error);
        enviar('error', error.message, { error: error.code || 'FLUJO_ERROR' });
        historialRepo.registrar({
            dominio: 'apremios', accion: 'consultar', estado: 'error',
            cliente: clienteHist, resumen: 'Fallo la consulta de apremios', error: error.message
        });
    }
}

module.exports = { procesarLote, describirResultado };
