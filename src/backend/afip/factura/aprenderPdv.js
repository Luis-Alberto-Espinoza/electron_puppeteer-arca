// afip/factura/aprenderPdv.js
// Lo que el paso 0 (Comprobantes en línea) dice de los PDV se guarda en el
// cliente: así el formulario se corrige solo y no hay que ir a Clientes.
// Lo usan Facturación normal / Mercado Pago y Factura Tipificada.

const { normalizarNumeroPdv } = require('../../cliente/model.js');
const { getContribuyenteRepo } = require('../../cliente/contribuyenteStore.js');

/**
 * Guarda en el cliente los PDV que Comprobantes en línea ofreció (falle o no la
 * factura), así el desplegable deja de ofrecer PDV que AFIP ya no habilita. Si el
 * PDV elegido no estaba, marca el resultado con el código PDV_NO_HABILITADO y la
 * lista: el front recarga el desplegable en vez de mostrar un error.
 *
 * @param {string} cuitObjetivo
 * @param {object} resultado  lo que devolvió el manager (se marca acá)
 * @param {object} datos      el objeto que recibió el paso 0: deja ahí
 *                            `pdvHabilitadosAfip` y trae el `puntoVenta` elegido
 * @returns {Promise<{habilitados: string[], elegido: string}|null>} si marcó
 */
async function aprenderPdvHabilitados(cuitObjetivo, resultado, datos, repo = getContribuyenteRepo()) {
    const habilitados = datos && datos.pdvHabilitadosAfip;
    if (!Array.isArray(habilitados) || habilitados.length === 0) return null;

    try {
        await repo.actualizar(String(cuitObjetivo), {
            pdvHabilitadosFacturacion: { numeros: habilitados, fecha: new Date().toISOString() }
        });
    } catch (e) {
        console.warn(`No se pudieron guardar los PDV habilitados de ${cuitObjetivo}: ${e.message}`);
    }

    const elegido = normalizarNumeroPdv(datos.puntoVenta);
    if (resultado && resultado.success === false && elegido && !habilitados.includes(elegido)) {
        resultado.codigo = 'PDV_NO_HABILITADO';
        resultado.pdvHabilitados = habilitados;
        resultado.pdvElegido = elegido;
        return { habilitados, elegido };
    }
    return null;
}

const SISTEMA_POR_LETRA = {
    B: 'Factura en Linea - Responsable Inscripto',
    C: 'Factura en Linea - Monotributo'
};

/**
 * El paso 0 avisa (TIPO_PDV_DISTINTO) cuando AFIP no ofrece el comprobante pedido
 * y, por lo que sí ofrece, de qué tipo es HOY ese PDV. Manda AFIP: se corrige el
 * sistema del PDV y el tipo del cliente, así la próxima vez el formulario ya
 * viene bien sin gastar otro login. Devuelve el detalle si corrigió, si no null.
 */
async function aprenderTipoDelPdv(cuitObjetivo, resultado, repo = getContribuyenteRepo()) {
    const conCodigo = resultado && (resultado.codigo
        ? resultado
        : (resultado.data?.resultados || []).find(r => r && r.codigo));
    if (!conCodigo || conCodigo.codigo !== 'TIPO_PDV_DISTINTO' || !conCodigo.detalle) return null;

    const numero = normalizarNumeroPdv(conCodigo.detalle.puntoVenta);
    const letra = conCodigo.detalle.letra;
    if (!numero || !SISTEMA_POR_LETRA[letra]) return null;

    try {
        const cliente = await repo.getByCuit(String(cuitObjetivo));
        if (!cliente) return null;
        const pdvs = (cliente.puntosDeVenta || []).map(p =>
            p.numero === numero ? { ...p, sistema: SISTEMA_POR_LETRA[letra] } : p);
        if (!pdvs.some(p => p.numero === numero)) pdvs.push({ numero, sistema: SISTEMA_POR_LETRA[letra] });
        await repo.actualizar(cliente.cuit, { puntosDeVenta: pdvs, tipoContribuyente: letra });
        console.log(`🔄 ${cliente.cuit}: AFIP indica que el PDV ${numero} es ${letra} → se corrige el cliente (tenía ${cliente.tipoContribuyente || 'vacío'}).`);
    } catch (e) {
        console.warn(`No se pudo corregir el tipo del PDV ${numero} de ${cuitObjetivo}: ${e.message}`);
        return null;
    }

    resultado.codigo = 'TIPO_PDV_DISTINTO';
    resultado.detalle = { puntoVenta: numero, letra };
    return resultado.detalle;
}

module.exports = { aprenderPdvHabilitados, aprenderTipoDelPdv };
