/**
 * MÓDULO: Utilidades CT
 * Re-exporta utilidades del módulo VEP y agrega helpers específicos de SCT.
 */

import {
    formatearCUIT,
    formatearMoneda,
    formatearMedioPago,
    capitalizarTexto,
    sanitizarParaCSS,
    truncarTexto,
    validarCUIT,
    generarIdUnico
} from '../../generar_VEP/modulos/utilidades.js';

export {
    formatearCUIT,
    formatearMoneda,
    formatearMedioPago,
    capitalizarTexto,
    sanitizarParaCSS,
    truncarTexto,
    validarCUIT,
    generarIdUnico
};

/**
 * Convierte un período en formato AAAAMM a "MM/AAAA".
 * Ejemplo: "202412" → "12/2024".
 * Si no matchea, devuelve el valor original.
 *
 * @param {string} periodo
 * @returns {string}
 */
export function formatearPeriodoAAAAMM(periodo) {
    if (!periodo) return '';
    const s = String(periodo).trim();
    if (!/^\d{6}$/.test(s)) return s;
    return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

/**
 * Suma los importes de un array de filas de deuda.
 * Cada fila puede traer `importe` como número o string en formato argentino.
 * Usa centavos para evitar errores de precisión.
 *
 * @param {Array<{importe: any}>} filas
 * @returns {number}
 */
export function sumarImportes(filas) {
    if (!filas || filas.length === 0) return 0;

    const totalCentavos = filas.reduce((acc, fila) => {
        const n = parseImporte(fila.importe);
        return acc + Math.round(n * 100);
    }, 0);

    return totalCentavos / 100;
}

/**
 * Parsea un importe que puede venir como número o string en formato AR.
 * @param {string|number} v
 * @returns {number}
 */
export function parseImporte(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isNaN(v) ? 0 : v;

    let s = String(v).trim()
        .replace(/\$/g, '')
        .replace(/\s/g, '');

    // Si no tiene separadores, parsear directo
    if (!s.includes(',') && !s.includes('.')) {
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    // Formato AR: punto = miles, coma = decimal
    s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

/**
 * Construye una etiqueta corta para un grupo (cliente, cuit).
 * @param {{nombre:string}} cliente
 * @param {string} cuitAsociado
 * @returns {string}
 */
export function etiquetaGrupo(cliente, cuitAsociado) {
    const nombre = cliente?.nombre ? capitalizarTexto(cliente.nombre) : 'Cliente';
    return `${nombre} — ${formatearCUIT(cuitAsociado)}`;
}
