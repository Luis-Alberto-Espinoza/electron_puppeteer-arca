// pdvOfrecibles.js - Qué PDV puede ofrecer un desplegable de facturación.
// Lo usan Facturas, Mercado Pago y Factura Tipificada (esta última es script
// clásico, no módulo: por eso también queda en window.pdvOfrecibles).

const normSistema = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

// ESPEJO de SISTEMAS_OPERABLES en
// src/backend/puppeteer/afip/empresa/flujo_abmPuntosDeVenta.js: si allá se
// agrega o saca un sistema, hay que tocarlo acá también.
const SISTEMAS_OPERABLES = new Set([
    'factura en linea - responsable inscripto',
    'factura en linea - monotributo'
]);

/**
 * PDV del contribuyente que se pueden ofrecer para facturar. Se piden al backend
 * cada vez (contribuyente:puntosDeVenta), así que siempre traen lo último que
 * aprendió.
 *
 * - Si ya sabemos qué PDV ofrece HOY Comprobantes en línea (lo aprende cada
 *   factura en el paso 0), manda esa lista: el ABM es un historial y trae PDV
 *   viejos que AFIP ya no deja usar. Los que no están en el ABM van solo con número.
 * - Si no, filtro defensivo por sistema: Factura en Línea RI (B) o Monotributo (C);
 *   sin sistema declarado se deja pasar. Sin requisito de `activo` (la columna
 *   "Usado" del ABM no es bloqueante).
 *
 * @param {string} cuit
 * @param {string[]|null} [habilitadosForzados] lista recién devuelta por AFIP
 * @returns {Promise<Array<{numero: string, sistema?: string, descripcion?: string}>>}
 */
export async function pdvOfrecibles(cuit, habilitadosForzados = null) {
    let todos = [];
    let habilitados = habilitadosForzados;
    try {
        const resp = await window.electronAPI.contribuyente.puntosDeVenta(cuit);
        todos = (resp && resp.success && Array.isArray(resp.puntosDeVenta)) ? resp.puntosDeVenta : [];
        if (!habilitados && resp && resp.pdvHabilitadosFacturacion) {
            habilitados = resp.pdvHabilitadosFacturacion.numeros;
        }
    } catch (e) {
        console.error('Error obteniendo puntos de venta:', e);
    }

    let pdvs;
    if (Array.isArray(habilitados) && habilitados.length > 0) {
        pdvs = habilitados.map(n => todos.find(p => p && p.numero === n) || { numero: n });
    } else {
        pdvs = todos.filter(p => {
            if (!p || !p.numero) return false;
            if (p.sistema) return SISTEMAS_OPERABLES.has(normSistema(p.sistema));
            return true;
        });
    }
    return pdvs.sort((a, b) => a.numero.localeCompare(b.numero));
}

window.pdvOfrecibles = pdvOfrecibles;
