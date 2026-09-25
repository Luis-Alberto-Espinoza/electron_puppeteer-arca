// ============================================================================
// PROCESADOR DDJJ IVA - Formulario F.2002 (AFIP/ARCA, "Mis Aplicaciones Web")
// ============================================================================
// "Modelo viejo" del servicio de IVA. Layout simple, una sola columna:
//
//   - Encabezado: pares "Etiqueta: Valor" embebidos en un mismo string
//     (CUIT, Período, Fecha de Presentación, etc.).
//   - Tabla 1: "Determinación de la base imponible del período"
//   - Tabla 2: "Determinación de la Declaración Jurada mensual"
//     (ambas con filas Concepto | Importe, importe alineado a la derecha).
//   - Pie: texto legal (se ignora).
//
// Los importes vienen en formato US con punto decimal ("$ 372263.43"); se
// convierten a formato argentino ("372263,43") para que el convertidor a Excel
// los interprete como números reales (sumables).
//
// Salida: { exito, tablas:[{titulo, datos:[{Concepto, Valor}]}], hojaUnica:true }
// ============================================================================

function limpiar(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
}

// Aplana las filas del PDF a items con coordenadas explícitas.
function aplanarItems(allFilas) {
    const items = [];
    for (const fila of allFilas) {
        if (!fila || !Array.isArray(fila.items)) continue;
        for (const it of fila.items) {
            const s = it.str;
            if (typeof s !== 'string' || s.trim() === '') continue;
            items.push({ str: s, x: it.transform[4], y: it.transform[5] });
        }
    }
    return items;
}

function yDeTexto(items, texto) {
    const it = items.find(i => i.str.includes(texto));
    return it ? it.y : null;
}

// Agrupa items por coordenada Y (de arriba abajo; dentro de la fila, izq->der).
function agruparPorY(items, tol = 4) {
    const ordenados = [...items].sort((a, b) => b.y - a.y);
    const filas = [];
    for (const it of ordenados) {
        const fila = filas.find(f => Math.abs(f.yRef - it.y) <= tol);
        if (fila) fila.items.push(it);
        else filas.push({ yRef: it.y, items: [it] });
    }
    return filas.map(f => f.items.sort((a, b) => a.x - b.x));
}

// "$ 372263.43" / "$ 1,234,567.89" -> "372263,43" / "1234567,89" (formato AR).
function formatearImporte(raw) {
    let limpio = String(raw).replace(/[$\s]/g, '');
    limpio = limpio.replace(/,/g, '');            // quitar separadores de miles US
    if (/^-?\d+\.\d+$/.test(limpio)) return limpio.replace('.', ',');
    return limpio;
}

// ----------------------------------------------------------------------------
// ENCABEZADO: pares "Etiqueta: Valor" embebidos en strings.
// ----------------------------------------------------------------------------
function extraerEncabezado(items) {
    const datos = [];
    const push = (c, v) => { if (v) datos.push({ Concepto: c, Valor: limpiar(v) }); };

    // Busca el primer item que contiene la etiqueta y devuelve lo que sigue a ":".
    const valorDe = (prefijo) => {
        const it = items.find(i => i.str.includes(prefijo + ':') || i.str.includes(prefijo + ' :'));
        if (!it) return '';
        const idx = it.str.indexOf(':');
        return idx >= 0 ? it.str.slice(idx + 1).trim() : '';
    };

    // CUIT viene sin guiones (ej. "30718609700"); se formatea a XX-XXXXXXXX-X
    // para que quede como texto legible (y no lo convierta a número el Excel).
    const cuitRaw = valorDe('CUIT Nº').replace(/\D/g, '');
    const cuitFmt = /^\d{11}$/.test(cuitRaw)
        ? `${cuitRaw.slice(0, 2)}-${cuitRaw.slice(2, 10)}-${cuitRaw.slice(10)}`
        : cuitRaw;
    push('CUIT', cuitFmt);
    push('Establecimiento', valorDe('Establecimiento'));
    push('Apellido y Nombre o Razón Social', valorDe('Apellido y Nombre o Razón Social'));
    push('Fecha de Presentación', valorDe('Fecha de Presentación'));
    push('Hora', valorDe('Hora'));
    push('Nro. de Transacción', valorDe('Nro. de Transacción'));
    push('MD5', valorDe('MD5'));

    // Formulario y versión vienen sin ":" (ej. "F. 2002", "Versión 230").
    const form = items.find(i => /^F\.\s*\d+/.test(i.str.trim()));
    if (form) push('Formulario', form.str.trim());
    const ver = items.find(i => /Versión\s*\d+/.test(i.str));
    if (ver) push('Versión', (ver.str.match(/Versión\s*(\d+)/) || [, ''])[1]);

    push('Período', valorDe('Período'));
    push('Secuencia', valorDe('Secuencia'));

    return datos;
}

// ----------------------------------------------------------------------------
// TABLA Concepto | Importe entre dos cotas verticales (yTop exclusivo).
// ----------------------------------------------------------------------------
function extraerTablaImportes(items, yTop, yBot) {
    const enRegion = items.filter(i => i.y > yBot + 0.5 && i.y < yTop - 0.5);
    const filas = agruparPorY(enRegion);
    const datos = [];
    for (const fila of filas) {
        const importeItem = fila.find(i => /^\$/.test(i.str.trim()));
        if (!importeItem) continue;                       // sin importe -> no es fila de datos
        const concepto = limpiar(
            fila.filter(i => i !== importeItem && i.x < 480).map(i => i.str).join(' ')
        );
        if (!concepto) continue;
        datos.push({ Concepto: concepto, Valor: formatearImporte(importeItem.str) });
    }
    return datos;
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================
async function procesarIvaF2002(allFilas, metadata = {}) {
    if (!allFilas || allFilas.length === 0) {
        return { exito: false, error: 'No se recibieron datos del PDF.' };
    }

    const items = aplanarItems(allFilas);

    const yBaseImp   = yDeTexto(items, 'Determinación de la base imponible del período');   // ~673
    const yDjMensual = yDeTexto(items, 'Determinación de la Declaración Jurada mensual');    // ~481
    const yLegal     = yDeTexto(items, 'Declaro que los datos');                            // ~343

    const tablas = [];
    const addTabla = (titulo, datos) => { if (datos && datos.length) tablas.push({ titulo, datos }); };

    addTabla('1. Encabezado', extraerEncabezado(items));

    if (yBaseImp && yDjMensual) {
        addTabla('2. Determinación de la base imponible del período',
            extraerTablaImportes(items, yBaseImp, yDjMensual));
    }
    if (yDjMensual) {
        addTabla('3. Determinación de la Declaración Jurada mensual',
            extraerTablaImportes(items, yDjMensual, yLegal || 0));
    }

    if (tablas.length === 0) {
        return { exito: false, error: 'No se pudieron extraer datos del F.2002 (IVA).' };
    }

    let nombreExcel = 'DDJJ_IVA_F2002.xlsx';
    if (metadata.nombreArchivo) {
        nombreExcel = metadata.nombreArchivo.replace(/\.pdf$/i, '.xlsx');
    }

    return { exito: true, tablas, suggestedFileName: nombreExcel, hojaUnica: true };
}

module.exports = { procesarIvaF2002 };
