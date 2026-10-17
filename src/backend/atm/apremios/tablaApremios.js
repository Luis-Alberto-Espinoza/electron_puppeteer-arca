// atm/apremios/tablaApremios.js
// Lo que se sabe de la tabla "Listado de Inhibiciones" de Consulta de Apremios (ATM),
// sin navegador: qué impuestos hay, cómo limpiar las celdas y cómo leer los importes.
// Lo usan el flujo (para validar y resumir) y el Excel. Testeable con node --test.

// Botones de la pantalla "Seleccione el impuesto…". `boton` = texto exacto del botón en ATM.
// Sellos y Tasa de Justicia también existen pero ATM los tiene ocultos (display:none).
const IMPUESTOS_APREMIOS = [
    { id: 'automotor',      boton: 'Automotor',                    hoja: 'Automotor' },
    { id: 'inmueble',       boton: 'Inmueble',                     hoja: 'Inmueble' },
    { id: 'ingresosBrutos', boton: 'Ingresos Brutos',              hoja: 'Ingresos Brutos' },
    { id: 'multas',         boton: 'Multas, Int. y Rec. No Trib.', hoja: 'Multas' },
    { id: 'agentes',        boton: 'Agentes',                      hoja: 'Agentes' }
];

const IMPUESTO_POR_ID = new Map(IMPUESTOS_APREMIOS.map(i => [i.id, i]));

// Columnas que son plata: "Importe Boleta" y "Sdo. Adeud. S/Act. S/Costas".
// El resto (boleta, juicio, juzgado…) queda como texto: tienen ceros a la izquierda.
const PATRON_COLUMNA_MONTO = /^importe|^sdo\.?|saldo/i;

/** Ids válidos, en el orden de la pantalla, sin repetidos. Los desconocidos se descartan. */
function normalizarImpuestos(ids) {
    const pedidos = new Set(Array.isArray(ids) ? ids : []);
    return IMPUESTOS_APREMIOS.filter(i => pedidos.has(i.id)).map(i => i.id);
}

/** ZK rellena las celdas vacías con &nbsp;. */
function limpiarCelda(texto) {
    return String(texto ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * ATM muestra los importes como los imprime Java: "27914.3", "0.0" y, los grandes,
 * en notación científica ("1.2777591978E8" = 127775919,78). Devuelve null si no es
 * un número así (celda vacía u otra cosa): nunca se adivina un monto.
 */
function parsearImporte(texto) {
    const t = limpiarCelda(texto);
    if (!/^-?\d+(\.\d+)?(E[-+]?\d+)?$/i.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
}

function esColumnaMonto(encabezado) {
    return PATRON_COLUMNA_MONTO.test(limpiarCelda(encabezado));
}

/**
 * Celdas crudas → valores para el Excel: montos como número (si se pueden leer),
 * todo lo demás como texto limpio.
 * @param {string[]} encabezados
 * @param {string[][]} filas
 * @returns {Array<Array<string|number>>}
 */
function convertirFilas(encabezados, filas) {
    const montos = encabezados.map(esColumnaMonto);
    return filas.map(celdas => celdas.map((c, i) => {
        const limpio = limpiarCelda(c);
        if (!montos[i]) return limpio;
        const n = parsearImporte(limpio);
        return n === null ? limpio : n;
    }));
}

/**
 * Para el mensaje al front: cuántos apremios hay y cuántos con saldo adeudado.
 * @returns {{cantidad: number, conSaldo: number, saldoTotal: number}}
 */
function resumirTabla(encabezados, filas) {
    const iSaldo = encabezados.findIndex(h => /^sdo\.?|saldo/i.test(limpiarCelda(h)));
    let conSaldo = 0;
    let saldoTotal = 0;
    if (iSaldo >= 0) {
        filas.forEach(celdas => {
            const n = parsearImporte(celdas[iSaldo]);
            if (n) { conSaldo++; saldoTotal += n; }
        });
    }
    return { cantidad: filas.length, conSaldo, saldoTotal: Math.round(saldoTotal * 100) / 100 };
}

module.exports = {
    IMPUESTOS_APREMIOS, IMPUESTO_POR_ID,
    normalizarImpuestos, limpiarCelda, parsearImporte, esColumnaMonto, convertirFilas, resumirTabla
};
