// parsers/parserPlanillaIvaIB.js
// Parser del 2º formato de Excel: "Planilla IVA - IB" (hoja tipo RESUMEN).
// Dado (archivo, hoja, periodo AAAAMM) devuelve el MISMO modelo canónico que
// parserLiquidacionesIIBB, para que el flujo Puppeteer no se entere de qué Excel vino.
//
// Layout (distinto al formato 1: acá es una MATRIZ mes × actividad):
//   - Una fila "marcador" con "DDJJ IIBB".
//   - Fila de headers: "Periodo" | "107912 - Elaboracion" | "463154 - ..." | ... |
//     "TOTAL" | "Impuesto determinado" | "Retenciones" | "SIRCREB" | "Percepciones" |
//     "Saldo a favor" | "Impuesto".
//   - Fila de ALÍCUOTAS: bajo cada columna de actividad, su alícuota (0,005 / 0,025 ...).
//   - Filas de datos: una por mes. La col "Periodo" trae un SERIAL de fecha de Excel
//     (46023 = 01/01/2026) o un texto de rectificativa ("mar 26- rect"). Bajo cada
//     actividad va la BASE de ese mes; las demás columnas traen los totales del período.
//
// Decisiones de diseño:
//  - Columnas por CONTENIDO, nunca por posición (la hoja "RESUMEN 2025" tiene datos 2026;
//    el nombre de hoja NO es confiable → detecto el bloque por el header).
//  - Período se matchea por SERIAL → (año, mes). Verificado: para los 12 meses el mes
//    nunca se desborda aunque el día derive (la planilla rellena de a 31 días).
//  - Rectificativa: si un mes tiene fila original Y "rect", gana la rect (corrección final).
//  - Solo se emiten las actividades con BASE no nula ese mes (sin movimiento → no se carga).
//  - El parser LEE y NORMALIZA, no recalcula (el impuesto lo recalcula AFIP al tipear la base).

const XLSX = require('xlsx');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const MESES_ABREV = {
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
    jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12
};

// Header normalizado de columna de TOTALES → campo canónico.
const MAPA_TOTALES = {
    total: 'totalBases',
    impuestodeterminado: 'impuestoDeterminado',
    retenciones: 'retenciones', retencion: 'retenciones',
    sircreb: 'sircreb',
    percepciones: 'percepciones', percepcion: 'percepciones',
    saldoafavor: 'safAnterior',
    impuesto: 'saldo'   // "Impuesto a Pagar" (col final). OJO: distinto de "impuestodeterminado".
};
// NOTA: "Total de Ingresos No gravados" NO es una columna — es un valor suelto dentro de la
// planilla. Pendiente de relevar (no nos pasaron una planilla que lo tenga). Para el futuro.

const norm = (s) => String(s == null ? '' : s)
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').trim();

function parseNumero(v) {
    if (typeof v === 'number') return v;
    let s = String(v == null ? '' : v).replace(/\$/g, '').replace(/\s/g, '');
    if (s === '' || s === '-') return 0;
    s = s.replace(/,/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
}

/**
 * Header de actividad → { codigo, nombre } ; si no matchea → null.
 * Dos formas vistas en planillas reales:
 *   "107912 - Elaboracion"  → código + nombre.
 *   107410                  → solo el código (celda numérica), típico de mono-actividad.
 * En la 2ª forma se exigen 6 dígitos exactos (código CLANAE) para no confundir con un
 * año, un total ni un período que caiga en la fila de headers.
 */
function parseActividadHeader(v) {
    const s = String(v == null ? '' : v).trim();
    const conNombre = s.match(/^(\d{3,6})\s*-\s*(.+?)$/);
    if (conNombre) return { codigo: conNombre[1], nombre: conNombre[2].trim() };
    const soloCodigo = s.match(/^(\d{6})$/);
    if (soloCodigo) return { codigo: soloCodigo[1], nombre: '' };
    return null;
}

/** Celda "Periodo" → { anio, mes, rect } ; serial de Excel o texto "mar 26- rect" ; si no → null. */
function parsePeriodoCelda(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') {
        const d = XLSX.SSF.parse_date_code(v);
        return d ? { anio: d.y, mes: d.m, rect: false } : null;
    }
    const s = String(v).toLowerCase();
    const mes = s.match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)/);
    const anio = s.match(/(\d{2,4})/);
    if (!mes || !anio) return null;
    let y = parseInt(anio[1], 10);
    if (y < 100) y += 2000;
    return { anio: y, mes: MESES_ABREV[mes[1]], rect: /rect/.test(s) };
}

/**
 * Ubica la fila de headers del bloque "DDJJ IIBB": la que tiene "Periodo" en col 0
 * y al menos una columna de actividad ("NNNNNN - ...").
 * @returns {{headerIdx:number, actividadCols:Array, totalCols:Object}} o null si no es este formato.
 */
function ubicarBloque(filas) {
    for (let i = 0; i < filas.length; i++) {
        if (norm(filas[i][0]) !== 'periodo') continue;
        const actividadCols = [];
        const totalCols = {};
        filas[i].forEach((h, idx) => {
            if (idx === 0) return;
            const act = parseActividadHeader(h);
            if (act) { actividadCols.push({ ...act, col: idx }); return; }
            const campo = MAPA_TOTALES[norm(h)];
            if (campo && totalCols[campo] === undefined) totalCols[campo] = idx;
        });
        if (actividadCols.length >= 1) return { headerIdx: i, actividadCols, totalCols };
    }
    return null;
}

/** Fila del marcador "DDJJ IIBB" (título del bloque) → índice, o -1 si no está. */
function ubicarMarcador(filas) {
    for (let i = 0; i < filas.length; i++) {
        if ((filas[i] || []).some(c => norm(c) === 'ddjjiibb')) return i;
    }
    return -1;
}

/** (archivo, hoja) → filas, o null si no se puede leer. */
function leerFilas(archivo, hoja) {
    try {
        const wb = XLSX.readFile(archivo, { sheetRows: 0 });
        const ws = wb.Sheets[hoja] || wb.Sheets[wb.SheetNames[0]];
        if (!ws) return null;
        return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    } catch (_) {
        return null;
    }
}

/** ¿El (archivo, hoja) es del formato "Planilla IVA - IB"? (para el despachador). */
function esPlanillaIvaIB(archivo, hoja) {
    const filas = leerFilas(archivo, hoja);
    return filas ? ubicarBloque(filas) !== null : false;
}

/**
 * Diagnóstico para el despachador. Se llama SOLO cuando el parser de Liquidaciones ya
 * falló, para no dar un mensaje que apunta al parser equivocado.
 *
 * Devuelve un mensaje explicando por qué no se pudo leer la planilla, o null si esta hoja
 * no es de este formato (no tiene el marcador "DDJJ IIBB") y entonces no opinamos: que
 * hable el error del otro parser.
 */
function diagnosticarPlanilla(archivo, hoja) {
    const filas = leerFilas(archivo, hoja);
    if (!filas) return null;

    const marcadorIdx = ubicarMarcador(filas);
    if (marcadorIdx === -1) return null;    // no es este formato
    if (ubicarBloque(filas)) return null;   // se lee bien → no hay nada que diagnosticar

    const cabeza = `La hoja "${hoja}" parece una Planilla IVA - IB (encontré "DDJJ IIBB" en la fila ` +
        `${marcadorIdx + 1}) pero no pude leer el bloque: `;

    let periodoIdx = -1;
    for (let i = marcadorIdx + 1; i < filas.length; i++) {
        if (norm((filas[i] || [])[0]) === 'periodo') { periodoIdx = i; break; }
    }
    if (periodoIdx === -1) {
        return cabeza + 'no encontré la fila de encabezados ("Periodo" en la primera columna) debajo del marcador.';
    }

    const headers = (filas[periodoIdx] || []).slice(1)
        .filter(c => c !== null && c !== '')
        .map(c => JSON.stringify(c)).join(', ');
    return cabeza + `en la fila ${periodoIdx + 1} ninguna columna parece una actividad ` +
        `(se espera "107912 - Elaboracion" o un código de 6 dígitos). Encontré: ${headers || '(vacío)'}.`;
}

/** Lista los nombres de hoja (para el selector del frontend). */
function listarHojas(archivo) {
    return XLSX.readFile(archivo, { bookSheets: true }).SheetNames;
}

/**
 * @param {string} archivo  ruta del .xlsx
 * @param {string} hoja     nombre de hoja (si no existe, cae a la primera)
 * @param {string} periodo  AAAAMM
 * @returns {Object} modelo canónico de la DDJJ (misma forma que parserLiquidacionesIIBB)
 */
function parsearPlanillaIvaIB(archivo, hoja, periodo) {
    if (!/^\d{6}$/.test(String(periodo || ''))) {
        throw new Error(`Período inválido "${periodo}" (formato AAAAMM)`);
    }
    const anioObj = parseInt(String(periodo).slice(0, 4), 10);
    const mesObj = parseInt(String(periodo).slice(4, 6), 10);

    const wb = XLSX.readFile(archivo, { raw: true });
    const ws = wb.Sheets[hoja] || wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error(`No existe la hoja "${hoja}". Hojas: ${wb.SheetNames.join(', ')}`);
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

    const bloque = ubicarBloque(filas);
    if (!bloque) {
        throw new Error(diagnosticarPlanilla(archivo, hoja) ||
            `No se encontró el bloque "DDJJ IIBB" (Periodo + actividades) en la hoja "${hoja}"`);
    }
    const { headerIdx, actividadCols, totalCols } = bloque;
    const alicuotaIdx = headerIdx + 1;   // fila inmediatamente debajo del header

    // Alícuota de cada actividad (fila de alícuotas, bajo su columna).
    const alicuotaDe = (col) => parseNumero(filas[alicuotaIdx] ? filas[alicuotaIdx][col] : null);

    // Buscar la(s) fila(s) de datos del período. Si hay rect para ese mes, gana la rect.
    let filaIdx = -1, filaRectIdx = -1;
    for (let i = alicuotaIdx + 1; i < filas.length; i++) {
        const p = parsePeriodoCelda(filas[i][0]);
        if (!p || p.anio !== anioObj || p.mes !== mesObj) continue;
        if (p.rect) { filaRectIdx = i; } else if (filaIdx === -1) { filaIdx = i; }
    }
    const elegidaIdx = filaRectIdx !== -1 ? filaRectIdx : filaIdx;
    if (elegidaIdx === -1) {
        throw new Error(`No se encontró el período ${mesObj}/${anioObj} en el bloque DDJJ IIBB de "${hoja}"`);
    }
    const fila = filas[elegidaIdx];

    // Actividades: solo las que tienen BASE no nula ese mes (sin movimiento → no se carga).
    const actividades = [];
    for (const a of actividadCols) {
        const crudo = fila[a.col];
        if (crudo == null || crudo === '') continue;
        const base = parseNumero(crudo);
        const alicuota = alicuotaDe(a.col);
        actividades.push({
            actividad: a.nombre,
            codigo: a.codigo,            // match con la fila de AFIP (paso_9)
            base,
            alicuota,
            impuesto: +(base * alicuota).toFixed(2)   // informativo; AFIP lo recalcula al tipear la base
        });
    }

    const tot = (campo) => (totalCols[campo] !== undefined ? parseNumero(fila[totalCols[campo]]) : 0);
    const saldo = tot('saldo');
    return {
        hoja,
        periodo: String(periodo),
        mes: MESES[mesObj - 1].charAt(0).toUpperCase() + MESES[mesObj - 1].slice(1),
        rectificativa: filaRectIdx !== -1,
        actividades,
        impuestoDeterminado: tot('impuestoDeterminado'),
        minimo: 0,
        retenciones: tot('retenciones'),
        percepciones: tot('percepciones'),
        sircreb: tot('sircreb'),
        sircupa: 0,
        sirtac: 0,
        safAnterior: tot('safAnterior'),
        saldo,
        aFavor: saldo < 0,
        origen: { archivo, hoja, fila: elegidaIdx + 1, formato: 'planilla-iva-ib' }
    };
}

module.exports = {
    parsearPlanillaIvaIB, esPlanillaIvaIB, diagnosticarPlanilla, listarHojas, parseNumero,
    ubicarBloque, ubicarMarcador, parsePeriodoCelda, norm, MESES
};
