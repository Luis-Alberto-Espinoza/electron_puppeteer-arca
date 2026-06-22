// escribirDeducciones.js
// PASO 2 del feature "totales de AFIP": escribe los importes que AFIP calculó (Retenciones,
// Percepciones, SIRCREB/SIRCUPA) en el MISMO Excel que leímos, en la fila del mes declarado.
//
// Dos formatos, DOS mapeos (cada Excel tiene sus columnas):
//  - "Planilla IVA - IB": 3 columnas (Retenciones | SIRCREB | Percepciones) → AFIP agrupa
//    igual → mapeo 1 a 1 por nombre. Sin ambigüedad.
//  - "Liquidaciones": 5 columnas finas (Retencion | Percepcion | Sircreb | Sircupa | Sirtac) →
//    AFIP las junta (SIRTAC+SIRCAR ret en "Retenciones Sufridas"; SIRCREB+SIRCUPA en una).
//    Para separar, RUTEO por el régimen del .txt importado (el nombre del archivo lo dice).
//    Si una fila de AFIP mezcla dos regímenes que van a columnas distintas → NO se puede
//    separar el total → se OMITE y se avisa (jamás inventar un número en una DDJJ).
//
// Seguridad (es plata):
//  - Detección de fila/columna REUSA los locators de los parsers (misma lógica que al leer).
//  - Escribe con exceljs → preserva formato, estilos y FÓRMULAS (xlsx los borraría).
//  - Hace BACKUP del Excel antes de tocarlo.
//  - Si el Excel está abierto (lock de LibreOffice) → corta y pide cerrarlo.
//  - Por defecto NO pisa celdas que ya tengan un valor ≠ 0 distinto: las salta y las reporta.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

const liq = require('./parsers/parserLiquidacionesIIBB.js');
const plan = require('./parsers/parserPlanillaIvaIB.js');

// --- Régimen (por nombre de .txt) → columna del formato "Liquidaciones" ---
function regimenDe(nombreArchivo) {
    const n = String(nombreArchivo || '').toLowerCase();
    if (n.includes('sirtac')) return 'sirtac';
    if (n.includes('sircreb')) return 'sircreb';
    if (n.includes('sircupa')) return 'sircupa';
    if (n.includes('sircar') && n.includes('percep')) return 'sircar_percep';
    if (n.includes('sircar')) return 'sircar_ret';
    return null;
}
const REGIMEN_A_CAMPO = {
    sirtac: 'sirtac', sircar_ret: 'retenciones', sircar_percep: 'percepciones',
    sircreb: 'sircreb', sircupa: 'sircupa'
};
// Fallback (sin .txt asignado): etiqueta de AFIP (normalizada) → campo del Excel.
const ETIQUETA_A_CAMPO_LIQ = {
    'retencionessufridas': 'retenciones', 'percepciones': 'percepciones',
    'recaudacionessircreb/sircupa': 'sircreb'
};
// Planilla (3 columnas): etiqueta de AFIP (normalizada) → campo.
const ETIQUETA_A_CAMPO_PLAN = {
    'retencionessufridas': 'retenciones', 'recaudacionessircreb/sircupa': 'sircreb',
    'percepciones': 'percepciones'
};

const esTotal = (et) => /total/i.test(et);

/** Valor numérico de una celda de exceljs (número directo, fórmula con result, o texto). */
function valorCelda(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && 'result' in v) return Number(v.result) || 0;
    const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

/** Plan de escritura para el formato "Liquidaciones" (fila del mes + columnas finas, ruteo por régimen). */
function planLiquidaciones(filas, periodo, deducciones, retenciones) {
    const mesNum = parseInt(String(periodo).slice(4, 6), 10);
    const mesObjetivo = liq.MESES[mesNum - 1];

    // Fila de headers (tiene "mes" y "base").
    let headerIdx = -1;
    for (let i = 0; i < Math.min(filas.length, 12); i++) {
        const set = filas[i].map(liq.norm);
        if (set.includes('mes') && set.includes('base')) { headerIdx = i; break; }
    }
    if (headerIdx === -1) throw new Error('No se encontró la fila de encabezados (formato Liquidaciones).');

    const col = {};
    filas[headerIdx].forEach((h, idx) => {
        const campo = liq.MAPA_COLUMNAS[liq.norm(h)];
        if (campo && col[campo] === undefined) col[campo] = idx;
    });
    if (col.mes === undefined) throw new Error('La hoja no tiene la columna "Mes".');

    // Fila ancla del mes (donde "Mes" == mes objetivo).
    let anclaIdx = -1;
    for (let i = headerIdx + 1; i < filas.length; i++) {
        if (liq.norm(filas[i][col.mes]) === mesObjetivo) { anclaIdx = i; break; }
    }
    if (anclaIdx === -1) throw new Error(`No se encontró el mes "${mesObjetivo}" en la hoja.`);

    const targets = [], avisos = [];
    for (const [etiqueta, valor] of Object.entries(deducciones || {})) {
        if (esTotal(etiqueta) || !Number(valor)) continue;
        const archivos = (retenciones && retenciones[etiqueta]) || [];
        const regimenes = [...new Set(archivos.map(a => regimenDe(path.basename(a))).filter(Boolean))];

        let campos, porNombre = false;
        if (regimenes.length) {
            campos = [...new Set(regimenes.map(r => REGIMEN_A_CAMPO[r]).filter(Boolean))];
        } else {
            const c = ETIQUETA_A_CAMPO_LIQ[liq.norm(etiqueta)];
            campos = c ? [c] : [];
            porNombre = true;
        }

        if (!campos.length) { avisos.push(`"${etiqueta}" ($${valor}) no tiene columna en este Excel → omitido.`); continue; }
        if (campos.length > 1) {
            avisos.push(`"${etiqueta}" ($${valor}) mezcla regímenes que van a columnas distintas (${campos.join(' + ')}) → no lo separo, OMITIDO.`);
            continue;
        }
        const campo = campos[0];
        if (col[campo] === undefined) { avisos.push(`"${etiqueta}": la columna "${campo}" no existe en esta hoja → omitido.`); continue; }
        targets.push({ etiqueta, campo, rowIdx: anclaIdx, colIdx: col[campo], valor: Number(valor), porNombre });
    }
    return { targets, avisos };
}

/** Plan de escritura para el formato "Planilla IVA - IB" (fila del mes + 3 columnas, mapeo 1 a 1). */
function planPlanilla(filas, periodo, deducciones) {
    const anioObj = parseInt(String(periodo).slice(0, 4), 10);
    const mesObj = parseInt(String(periodo).slice(4, 6), 10);

    const bloque = plan.ubicarBloque(filas);
    if (!bloque) throw new Error('No se encontró el bloque "DDJJ IIBB" (formato Planilla).');
    const { headerIdx, totalCols } = bloque;

    // Fila del mes (si hay rectificativa, gana).
    let filaIdx = -1, filaRectIdx = -1;
    for (let i = headerIdx + 2; i < filas.length; i++) {
        const p = plan.parsePeriodoCelda(filas[i][0]);
        if (!p || p.anio !== anioObj || p.mes !== mesObj) continue;
        if (p.rect) filaRectIdx = i; else if (filaIdx === -1) filaIdx = i;
    }
    const rowIdx = filaRectIdx !== -1 ? filaRectIdx : filaIdx;
    if (rowIdx === -1) throw new Error(`No se encontró el período ${mesObj}/${anioObj} en el bloque DDJJ IIBB.`);

    const targets = [], avisos = [];
    for (const [etiqueta, valor] of Object.entries(deducciones || {})) {
        if (esTotal(etiqueta) || !Number(valor)) continue;
        const campo = ETIQUETA_A_CAMPO_PLAN[plan.norm(etiqueta)];
        if (!campo) { avisos.push(`"${etiqueta}" ($${valor}) no tiene columna en la Planilla → omitido.`); continue; }
        if (totalCols[campo] === undefined) { avisos.push(`"${etiqueta}": la columna "${campo}" no está en la Planilla → omitido.`); continue; }
        targets.push({ etiqueta, campo, rowIdx, colIdx: totalCols[campo], valor: Number(valor) });
    }
    return { targets, avisos };
}

/**
 * Escribe los totales de AFIP en el Excel.
 * @param {Object} datos { archivo, hoja, periodo, deducciones:{etiqueta:num}, retenciones:{etiqueta:[rutas]}, sobrescribir? }
 */
async function escribir(datos) {
    const { archivo, hoja, periodo, deducciones, retenciones, sobrescribir = false } = datos || {};
    if (!archivo || !fs.existsSync(archivo)) return { success: false, error: 'SIN_ARCHIVO', message: 'No hay Excel para escribir.' };
    if (!hoja) return { success: false, error: 'SIN_HOJA', message: 'Falta la hoja.' };
    if (!/^\d{6}$/.test(String(periodo || ''))) return { success: false, error: 'PERIODO', message: 'Período inválido.' };
    if (!deducciones || !Object.keys(deducciones).length) return { success: false, error: 'SIN_DEDUCCIONES', message: 'No hay totales de AFIP para escribir.' };

    // Excel abierto en LibreOffice → cualquier escritura se perdería cuando él guarde.
    const lock = path.join(path.dirname(archivo), `.~lock.${path.basename(archivo)}#`);
    if (fs.existsSync(lock)) {
        return { success: false, error: 'EXCEL_ABIERTO', message: 'El Excel está abierto (LibreOffice). Cerralo y reintentá.' };
    }

    // 1. Detectar formato + armar el plan (qué celda recibe qué número).
    const formato = plan.esPlanillaIvaIB(archivo, hoja) ? 'planilla' : 'liquidaciones';
    const ws0 = XLSX.readFile(archivo, formato === 'planilla' ? { raw: true } : undefined).Sheets[hoja];
    if (!ws0) return { success: false, error: 'SIN_HOJA', message: `No existe la hoja "${hoja}".` };
    const filas = XLSX.utils.sheet_to_json(ws0, formato === 'planilla'
        ? { header: 1, defval: null, raw: true }
        : { header: 1, defval: '', raw: false });

    let plan_;
    try {
        plan_ = formato === 'planilla'
            ? planPlanilla(filas, periodo, deducciones)
            : planLiquidaciones(filas, periodo, deducciones, retenciones);
    } catch (e) {
        return { success: false, error: 'PLAN', message: e.message };
    }
    const { targets, avisos } = plan_;
    if (!targets.length) {
        return { success: true, formato, escritos: [], omitidos: avisos, backup: null,
            resumen: `No había totales para escribir en este Excel.${avisos.length ? '\n' + avisos.join('\n') : ''}` };
    }

    // 2. Backup antes de tocar nada.
    const ts = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+$/, '');
    const ext = path.extname(archivo);
    const backup = archivo.slice(0, archivo.length - ext.length) + `.bak-${ts}${ext}`;
    try { fs.copyFileSync(archivo, backup); }
    catch (e) { return { success: false, error: 'BACKUP', message: `No pude crear el backup: ${e.message}` }; }

    // 3. Escribir con exceljs (preserva formato/fórmulas).
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(archivo);
    const ws = wb.getWorksheet(hoja) || wb.worksheets[0];

    const escritos = [];
    for (const t of targets) {
        const cell = ws.getRow(t.rowIdx + 1).getCell(t.colIdx + 1);   // exceljs es 1-based
        const previo = valorCelda(cell.value);
        const yaTiene = Math.abs(previo) > 0.005 && Math.abs(previo - t.valor) > 0.005;
        if (yaTiene && !sobrescribir) {
            avisos.push(`"${t.etiqueta}" → ${t.campo}: la celda ya tenía $${previo} (AFIP: $${t.valor}). NO la pisé.`);
            continue;
        }
        cell.value = t.valor;   // solo el valor; el estilo/numFmt de la celda se mantiene
        escritos.push({ etiqueta: t.etiqueta, campo: t.campo, previo, valor: t.valor,
            celda: `${cell.address}`, porNombre: !!t.porNombre });
    }

    if (!escritos.length) {
        fs.unlinkSync(backup);   // no escribí nada → el backup sobra
        return { success: true, formato, escritos: [], omitidos: avisos, backup: null,
            resumen: `No escribí nada (todas las celdas ya tenían valor).\n${avisos.join('\n')}` };
    }

    try { await wb.xlsx.writeFile(archivo); }
    catch (e) { return { success: false, error: 'WRITE', message: `No pude guardar el Excel: ${e.message}`, backup }; }

    const lineas = [
        `--- Escritura en Excel (${formato}) ---`,
        ...escritos.map(e => `  ✅ ${e.etiqueta} → col "${e.campo}" (${e.celda}): $${e.valor}` +
            (e.previo ? ` (antes $${e.previo})` : '') + (e.porNombre ? ' [mapeado por nombre, sin .txt]' : '')),
        ...avisos.map(a => `  ⚠️ ${a}`),
        `Backup: ${path.basename(backup)}`
    ];
    const resumen = lineas.join('\n');
    console.log('[DeclaracionJurada escribirDeducciones]\n' + resumen);
    return { success: true, formato, escritos, omitidos: avisos, backup, resumen };
}

module.exports = { escribir, regimenDe };
