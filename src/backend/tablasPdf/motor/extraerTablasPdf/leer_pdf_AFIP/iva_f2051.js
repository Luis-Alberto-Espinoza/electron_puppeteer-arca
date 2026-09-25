// ============================================================================
// PROCESADOR DDJJ IVA - Formulario F.2051 ("IVA Simple", ARCA)
// ============================================================================
// "Modelo nuevo" del servicio de IVA. Distinto al F.2002:
//
//   - Encabezado en GRILLA: la etiqueta va en una fila y su valor en la fila
//     inmediatamente inferior, en dos columnas (x≈163 y x≈351).
//   - Tabla 1: "Determinación del impuesto"
//   - Tabla 2: "Determinación de la posición mensual"
//     (filas Concepto | Importe; importe alineado a la derecha).
//   - Pie: texto legal (se ignora).
//
// Los importes vienen en formato argentino ("$ 4.382.051,83"); se quita el
// símbolo "$" y se conserva el formato para que el convertidor a Excel los
// interprete como números reales (sumables).
//
// Salida: { exito, tablas:[{titulo, datos:[{Concepto, Valor}]}], hojaUnica:true }
// ============================================================================

function limpiar(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
}

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

// "$ 4.382.051,83" -> "4.382.051,83" (se conserva el formato argentino).
function formatearImporte(raw) {
    return String(raw).replace(/\$/g, '').replace(/\s/g, '').trim();
}

// Devuelve el valor que está en la fila inmediatamente inferior a la etiqueta,
// alineado en la misma columna (x similar). Sirve para el encabezado en grilla.
function valorDebajo(items, etiqueta, { dx = 22, dyMax = 24 } = {}) {
    const lab = items.find(i => i.str.includes(etiqueta));
    if (!lab) return '';
    const cand = items
        .filter(i => i !== lab && i.y < lab.y - 2 && (lab.y - i.y) < dyMax && Math.abs(i.x - lab.x) < dx)
        .sort((a, b) => b.y - a.y);   // el más cercano hacia abajo primero
    return cand.length ? limpiar(cand[0].str) : '';
}

// ----------------------------------------------------------------------------
// ENCABEZADO (grilla etiqueta-arriba / valor-abajo, dos columnas).
// ----------------------------------------------------------------------------
function extraerEncabezado(items) {
    const datos = [];
    const push = (c, v) => { if (v) datos.push({ Concepto: c, Valor: limpiar(v) }); };

    push('CUIT', valorDebajo(items, 'CUIT'));
    push('Denominación', valorDebajo(items, 'Denominación'));
    push('Período', valorDebajo(items, 'Período'));
    push('Secuencia', valorDebajo(items, 'Secuencia'));
    push('Fecha de Presentación', valorDebajo(items, 'Fecha de Presentación'));
    push('Nro. de Transacción', valorDebajo(items, 'Nro. de Transacción'));
    push('Código de identificación (MD5)', valorDebajo(items, '(MD5)'));

    // Formulario y versión: "F.2051" "V." "100"
    const form = items.find(i => /^F\.?\s*\d{3,4}/.test(i.str.trim()));
    if (form) {
        push('Formulario', form.str.trim());
        const ver = items.find(i => Math.abs(i.y - form.y) <= 3 && i.x > form.x && /^\d+$/.test(i.str.trim()));
        if (ver) push('Versión', ver.str.trim());
    }

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
        if (!importeItem) continue;
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
async function procesarIvaF2051(allFilas, metadata = {}) {
    if (!allFilas || allFilas.length === 0) {
        return { exito: false, error: 'No se recibieron datos del PDF.' };
    }

    const items = aplanarItems(allFilas);

    const yImpuesto = yDeTexto(items, 'Determinación del impuesto');           // ~626
    const yPosicion = yDeTexto(items, 'Determinación de la posición mensual'); // ~482
    const yLegal    = yDeTexto(items, 'Declaro que los datos');                // ~333

    const tablas = [];
    const addTabla = (titulo, datos) => { if (datos && datos.length) tablas.push({ titulo, datos }); };

    addTabla('1. Encabezado', extraerEncabezado(items));

    if (yImpuesto && yPosicion) {
        addTabla('2. Determinación del impuesto',
            extraerTablaImportes(items, yImpuesto, yPosicion));
    }
    if (yPosicion) {
        addTabla('3. Determinación de la posición mensual',
            extraerTablaImportes(items, yPosicion, yLegal || 0));
    }

    if (tablas.length === 0) {
        return { exito: false, error: 'No se pudieron extraer datos del F.2051 (IVA Simple).' };
    }

    let nombreExcel = 'DDJJ_IVA_F2051.xlsx';
    if (metadata.nombreArchivo) {
        nombreExcel = metadata.nombreArchivo.replace(/\.pdf$/i, '.xlsx');
    }

    return { exito: true, tablas, suggestedFileName: nombreExcel, hojaUnica: true };
}

module.exports = { procesarIvaF2051 };
