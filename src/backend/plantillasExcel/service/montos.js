// plantillasExcel/service/montos.js
// Lectura de montos cargados a mano. Lógica pura (sin exceljs): recibe el valor
// plano de una celda (ver valorPlano en cabeceras.js) y devuelve el número.
//
// En los Excel reales los montos casi siempre vienen como número y el "$5,800"
// es solo el formato de la celda. Pero si alguien escribió el texto, se lee igual:
//   "$5,800 "  " $ 11,700.00 "  "10600"  "1.234,56"

/**
 * Convierte un texto con separadores de miles y/o decimales a número.
 * Regla de separadores:
 *  - Con punto Y coma: el que aparece último es el decimal ("11,700.00", "1.234,56").
 *  - Con uno solo: si todos los grupos después del separador tienen 3 dígitos es
 *    de miles ("5,800", "1.234.567"); si hay uno solo con 1 o 2 dígitos, es decimal
 *    ("10,5"). Cualquier otra cosa no se adivina.
 * @param {string} texto  ya sin "$" ni espacios
 * @returns {number|null}
 */
function numeroDesdeTexto(texto) {
    let negativo = false;
    let s = texto;
    if (/^\(.*\)$/.test(s)) { negativo = true; s = s.slice(1, -1); } // (1.234) contable
    if (s.startsWith('-')) { negativo = !negativo; s = s.slice(1); }
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

    const ultimoPunto = s.lastIndexOf('.');
    const ultimaComa = s.lastIndexOf(',');
    let entero;
    let decimales = '';

    if (ultimoPunto >= 0 && ultimaComa >= 0) {
        const sepDecimal = ultimoPunto > ultimaComa ? '.' : ',';
        const sepMiles = sepDecimal === '.' ? ',' : '.';
        const i = s.lastIndexOf(sepDecimal);
        entero = s.slice(0, i);
        decimales = s.slice(i + 1);
        if (entero.includes(sepDecimal) || !/^\d{1,3}([.,]\d{3})*$/.test(entero)
            || entero.replace(/\d/g, '').split('').some(c => c !== sepMiles)) return null;
        entero = entero.split(sepMiles).join('');
    } else if (ultimoPunto >= 0 || ultimaComa >= 0) {
        const sep = ultimoPunto >= 0 ? '.' : ',';
        const partes = s.split(sep);
        if (partes.length > 1 && partes[0].length >= 1 && partes[0].length <= 3
            && partes.slice(1).every(p => p.length === 3)) {
            entero = partes.join('');           // miles
        } else if (partes.length === 2 && partes[1].length >= 1 && partes[1].length <= 2) {
            entero = partes[0] || '0';          // decimal
            decimales = partes[1];
        } else {
            return null;
        }
    } else {
        entero = s;
    }
    if (!/^\d+$/.test(entero) || !/^\d*$/.test(decimales)) return null;
    const n = Number(`${entero}.${decimales || '0'}`);
    return negativo ? -n : n;
}

/**
 * Lee el valor de una celda de monto.
 * @param {*} valor  valor plano de la celda
 * @returns {{ vacio: true } | { monto: number } | { error: string }}
 *   vacio: celda vacía o con solo espacios (se ignora).
 *   error: había algo escrito que no es un monto (no se suma; se avisa).
 */
function leerMonto(valor) {
    if (valor === null || valor === undefined) return { vacio: true };
    if (typeof valor === 'number') {
        return Number.isFinite(valor) ? { monto: valor } : { error: `"${valor}" no es un número válido` };
    }
    if (valor instanceof Date) return { error: 'hay una fecha donde va un monto' };
    if (typeof valor === 'boolean') return { error: `"${valor}" no es un monto` };

    const texto = String(valor);
    const limpio = texto.replace(/\$/g, '').replace(/\s+/g, '');
    if (limpio === '') return { vacio: true };
    const n = numeroDesdeTexto(limpio);
    if (n === null) return { error: `"${texto.trim()}" no se puede leer como monto` };
    return { monto: n };
}

// Redondeo a centavos sin arrastrar basura de coma flotante (ni -0).
function r2(x) {
    const v = Math.round((x + Number.EPSILON) * 100) / 100;
    return Object.is(v, -0) ? 0 : v;
}

module.exports = { leerMonto, numeroDesdeTexto, r2 };
