// parsers/parserLiquidacionesIIBB.js
// Parser del formato "Liquidaciones" (IIBB): un workbook con UNA HOJA POR CLIENTE.
// Dado (archivo, hoja, periodo AAAAMM) devuelve el modelo canónico de esa DDJJ.
//
// Decisiones de diseño (ver docs/nuevo_servicio_Afip/declaracionJurada.md §13.7):
//  - Columnas por NOMBRE de header, nunca por posición (varían: Sircupa/Sicupa, falta Sirtac).
//  - Mes derivado del período; se busca la fila por el nombre del mes.
//  - Multiactividad: la fila con "Mes" lleno es el ancla (trae los totales del mes);
//    las filas siguientes con "Mes" vacío y alícuota son actividades adicionales.
//  - El parser LEE y NORMALIZA, no recalcula (el contador ya calculó).

const XLSX = require('xlsx');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Header normalizado → campo canónico. Cubre sinónimos/typos conocidos.
const MAPA_COLUMNAS = {
    mes: 'mes', actividad: 'actividad', actividadid: 'codigo', base: 'base', alicuota: 'alicuota',
    impuesto: 'impuesto', minimo: 'minimo', impdet: 'impuestoDeterminado',
    retencion: 'retenciones', percepcion: 'percepciones', sircreb: 'sircreb',
    sircupa: 'sircupa', sicupa: 'sircupa', sirtac: 'sirtac',
    safanterior: 'safAnterior', saldo: 'saldo'
};

const norm = (s) => String(s == null ? '' : s)
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').trim();

/** "$ 21,696,298.30" → 21696298.30 ; "$ -" → 0 ; "0.025" → 0.025 (formato US: coma=miles). */
function parseNumero(v) {
    if (typeof v === 'number') return v;
    let s = String(v == null ? '' : v).replace(/\$/g, '').replace(/\s/g, '');
    if (s === '' || s === '-') return 0;
    s = s.replace(/,/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

/** Lista los nombres de hoja del workbook (para el selector del frontend). */
function listarHojas(archivo) {
    return XLSX.readFile(archivo, { bookSheets: true }).SheetNames;
}

/**
 * @param {string} archivo  ruta del .xlsx
 * @param {string} hoja     nombre de hoja (cliente)
 * @param {string} periodo  AAAAMM
 * @returns {Object} modelo canónico de la DDJJ
 */
function parsearLiquidacionIIBB(archivo, hoja, periodo) {
    if (!/^\d{6}$/.test(String(periodo || ''))) {
        throw new Error(`Período inválido "${periodo}" (formato AAAAMM)`);
    }
    const mesNum = parseInt(String(periodo).slice(4, 6), 10);
    const mesObjetivo = MESES[mesNum - 1];
    if (!mesObjetivo) throw new Error(`Mes inválido en período "${periodo}"`);

    const wb = XLSX.readFile(archivo);
    const ws = wb.Sheets[hoja];
    if (!ws) {
        throw new Error(`No existe la hoja "${hoja}". Hojas: ${wb.SheetNames.join(', ')}`);
    }
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

    // 1. Encontrar la fila de headers (la que tiene "mes" y "base").
    let headerIdx = -1;
    for (let i = 0; i < Math.min(filas.length, 12); i++) {
        const set = filas[i].map(norm);
        if (set.includes('mes') && set.includes('base')) { headerIdx = i; break; }
    }
    if (headerIdx === -1) throw new Error(`No se encontró la fila de encabezados en la hoja "${hoja}"`);

    // 2. Mapear nombre de columna → índice.
    const col = {};
    filas[headerIdx].forEach((h, idx) => {
        const campo = MAPA_COLUMNAS[norm(h)];
        if (campo && col[campo] === undefined) col[campo] = idx;
    });
    for (const obligatoria of ['mes', 'actividad', 'base', 'alicuota']) {
        if (col[obligatoria] === undefined) {
            throw new Error(`La hoja "${hoja}" no tiene la columna "${obligatoria}"`);
        }
    }

    const cel = (fila, campo) => (col[campo] !== undefined ? fila[col[campo]] : '');

    // 3. Buscar la fila ancla del mes objetivo (donde "Mes" == mes).
    let anclaIdx = -1;
    for (let i = headerIdx + 1; i < filas.length; i++) {
        if (norm(cel(filas[i], 'mes')) === mesObjetivo) { anclaIdx = i; break; }
    }
    if (anclaIdx === -1) {
        throw new Error(`No se encontró el mes "${mesObjetivo}" en la hoja "${hoja}"`);
    }

    // 4. Actividades: la del ancla + las filas siguientes con "Mes" vacío y alícuota
    //    (excluye la fila de TOTALES, que tiene "Mes" vacío pero alícuota vacía).
    const ancla = filas[anclaIdx];
    const armarActividad = (fila) => ({
        actividad: String(cel(fila, 'actividad')).trim(),
        codigo: String(cel(fila, 'codigo')).trim(),   // "Actividad id" → match con la fila de AFIP
        base: parseNumero(cel(fila, 'base')),
        alicuota: parseNumero(cel(fila, 'alicuota')),
        impuesto: parseNumero(cel(fila, 'impuesto'))
    });

    const actividades = [armarActividad(ancla)];
    const filasUsadas = [anclaIdx];
    for (let i = anclaIdx + 1; i < filas.length; i++) {
        const mesCel = norm(cel(filas[i], 'mes'));
        if (mesCel !== '') break;                          // empezó otro mes
        if (norm(cel(filas[i], 'alicuota')) === '') break; // fila de totales → cortar
        actividades.push(armarActividad(filas[i]));
        filasUsadas.push(i);
    }

    // 5. Totales del mes (viven en la fila ancla).
    const saldo = parseNumero(cel(ancla, 'saldo'));
    return {
        hoja,
        periodo: String(periodo),
        mes: mesObjetivo.charAt(0).toUpperCase() + mesObjetivo.slice(1),
        actividades,
        impuestoDeterminado: parseNumero(cel(ancla, 'impuestoDeterminado')),
        minimo: parseNumero(cel(ancla, 'minimo')),
        retenciones: parseNumero(cel(ancla, 'retenciones')),
        percepciones: parseNumero(cel(ancla, 'percepciones')),
        sircreb: parseNumero(cel(ancla, 'sircreb')),
        sircupa: parseNumero(cel(ancla, 'sircupa')),
        sirtac: parseNumero(cel(ancla, 'sirtac')),
        safAnterior: parseNumero(cel(ancla, 'safAnterior')),
        saldo,
        aFavor: saldo < 0,
        origen: { archivo, hoja, filas: filasUsadas }
    };
}

module.exports = { parsearLiquidacionIIBB, listarHojas, parseNumero, MESES, MAPA_COLUMNAS, norm };
