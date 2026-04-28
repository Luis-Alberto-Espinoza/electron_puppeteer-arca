// parserIdDeuda.js
// Helper para el ID de los inputs de fila del SCT (Sistema de Cuenta Tributaria).
// Formato: {establecimiento}-{impuesto}-{concepto}-{subconcepto}-{periodo AAAAMM}-{cuota}
// Ejemplo:  "0-30-19-19-202412-0"

function parsearIdDeuda(id) {
    if (typeof id !== 'string') return null;
    const partes = id.split('-');
    if (partes.length !== 6) return null;
    const [establecimiento, impuesto, concepto, subconcepto, periodo, cuota] = partes;
    if (!/^\d{6}$/.test(periodo)) return null;
    return { establecimiento, impuesto, concepto, subconcepto, periodo, cuota };
}

function armarIdDeuda({ establecimiento, impuesto, concepto, subconcepto, periodo, cuota }) {
    return [establecimiento, impuesto, concepto, subconcepto, periodo, cuota].join('-');
}

/**
 * Regex para matchear filas por (periodo, impuesto) ignorando el resto de campos.
 * Uso: id.match(buildRegexMatchPeriodoImpuesto('202412', '30'))
 */
function buildRegexMatchPeriodoImpuesto(periodo, impuesto) {
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^\\d+-${esc(impuesto)}-\\d+-\\d+-${esc(periodo)}-\\d+$`);
}

module.exports = {
    parsearIdDeuda,
    armarIdDeuda,
    buildRegexMatchPeriodoImpuesto,
};
