// ============================================================================
//  HOJA DE ESTILOS ÚNICA PARA LOS EXCEL DE SALIDA
// ----------------------------------------------------------------------------
//  La usan el conversor genérico (Modo A, fileProcessingService.js) y los
//  especialistas que arman su propio Excel (Modo B: banco_galicia,
//  banco_supervielle, banco_macro, banco_macro_2). Para cambiar el aspecto de
//  TODOS los Excel alcanza con tocar este archivo.
// ============================================================================

const COLORES = {
    primario: 'FF5C5BA6',        // encabezados de tabla
    primarioOscuro: 'FF3F3E7A',  // títulos (un tono más oscuro que el encabezado)
    textoClaro: 'FFFFFFFF',
    etiqueta: 'FFD6D6E9',        // celdas "propiedad" de Datos Generales
    cebra: 'FFEFEFF6',           // fondo de las filas pares
    resaltado: 'FFF2EC91',       // reservado para destacar filas (totales, alertas)
    borde: 'FFD0D0E0'
};

const relleno = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

const FILL_TITULO = relleno(COLORES.primarioOscuro);
const FONT_TITULO = { bold: true, color: { argb: COLORES.textoClaro }, size: 12 };
const FILL_ENCABEZADO = relleno(COLORES.primario);
const FONT_ENCABEZADO = { bold: true, color: { argb: COLORES.textoClaro } };
const FILL_ETIQUETA = relleno(COLORES.etiqueta);
const FONT_ETIQUETA = { bold: true };
const FILL_CEBRA = relleno(COLORES.cebra);
const FILL_RESALTADO = relleno(COLORES.resaltado);

const lineaFina = { style: 'thin', color: { argb: COLORES.borde } };
const BORDE_FINO = { top: lineaFina, left: lineaFina, bottom: lineaFina, right: lineaFina };

// Sin separador de miles (pedido del usuario): "1234567,89". Negativos en rojo.
// El formato es el mismo en Excel y en LibreOffice.
const FMT_MONTO = '0.00;[Red]-0.00';
// Enteros que no son montos (períodos, cuotas, comprobantes, códigos): sin
// separador de miles —"2021" no debe verse "2.021"— y sin notación científica.
const FMT_ENTERO = '0';
const FMT_FECHA = 'dd/mm/yyyy';

// Una columna es de montos si su nombre lo dice o si alguno de sus valores tiene
// decimales. Por nombre se detectan también las columnas cuyos importes son
// todos enteros (ej: "Créditos" con 1530000). "Cuota", "Concepto" o "Impuesto"
// son códigos y NO están en la lista.
const PATRON_COLUMNA_MONTO = /importe|saldo|monto|d[eé]bito|cr[eé]dito|total|haber|\bdebe\b|inter[eé]s|capital|retenid|percibid|\bneto\b|\(\$\)/i;

function esNumero(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

function esColumnaMonto(nombre, valores) {
    if (PATRON_COLUMNA_MONTO.test(String(nombre || ''))) return true;
    return valores.some(v => esNumero(v) && !Number.isInteger(v));
}

function estilizarTitulo(celda) {
    celda.font = FONT_TITULO;
    celda.fill = FILL_TITULO;
    celda.alignment = { horizontal: 'left', vertical: 'middle' };
}

function estilizarEncabezado(fila) {
    fila.eachCell({ includeEmpty: false }, celda => {
        celda.font = FONT_ENCABEZADO;
        celda.fill = FILL_ENCABEZADO;
        celda.border = BORDE_FINO;
        celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
}

function estilizarEtiqueta(celda) {
    celda.font = FONT_ETIQUETA;
    celda.fill = FILL_ETIQUETA;
}

// Cebra + borde fino en las filas de datos [desde, hasta] y columnas [1, nCols].
// No pisa rellenos que el especialista haya puesto a propósito.
function aplicarCebra(hoja, desde, hasta, nCols) {
    for (let r = desde; r <= hasta; r++) {
        const fila = hoja.getRow(r);
        const par = (r - desde) % 2 === 1;
        for (let c = 1; c <= nCols; c++) {
            const celda = fila.getCell(c);
            celda.border = BORDE_FINO;
            if (par && !(celda.fill && celda.fill.type === 'pattern')) celda.fill = FILL_CEBRA;
        }
    }
}

// Asigna numFmt a las celdas numéricas de una tabla según el tipo de columna.
// Respeta las celdas que ya traen formato (fechas, porcentajes, etc.).
// `nombres[i]` es el encabezado de la columna i+1.
function formatearColumnas(hoja, nombres, desde, hasta) {
    nombres.forEach((nombre, i) => {
        const col = i + 1;
        const celdas = [];
        for (let r = desde; r <= hasta; r++) celdas.push(hoja.getRow(r).getCell(col));
        const sinFormato = celdas.filter(c => esNumero(c.value) && (!c.numFmt || c.numFmt === 'General'));
        if (!sinFormato.length) return;
        const fmt = esColumnaMonto(nombre, sinFormato.map(c => c.value)) ? FMT_MONTO : FMT_ENTERO;
        sinFormato.forEach(c => {
            c.numFmt = fmt;
            c.alignment = { horizontal: 'right', vertical: 'middle' };
        });
    });
}

// Ancho de columna según lo que se VE (una fecha serial 45678 se ve "01/02/2025",
// un monto se ve con 2 decimales), con tope para descripciones muy largas.
function anchoVisible(celda) {
    const v = celda.value;
    if (v === null || v === undefined || v === '') return 0;
    if (v instanceof Date || celda.numFmt === FMT_FECHA) return 10;
    if (esNumero(v)) {
        if (celda.numFmt === FMT_MONTO) {
            return Math.trunc(Math.abs(v)).toString().length + 3 + (v < 0 ? 1 : 0);
        }
        return String(v).length;
    }
    if (v.richText) return v.richText.map(t => t.text).join('').length;
    return String(v).length;
}

function autoajustarAnchos(hoja, nCols, { minimo = 8, maximo = 60, margen = 2 } = {}) {
    for (let c = 1; c <= nCols; c++) {
        let ancho = minimo;
        hoja.getColumn(c).eachCell({ includeEmpty: false }, celda => {
            // Los títulos combinados abarcan varias columnas: no cuentan.
            if (celda.isMerged) return;
            ancho = Math.max(ancho, anchoVisible(celda) + margen);
        });
        hoja.getColumn(c).width = Math.min(ancho, maximo);
    }
}

// Tabla clásica: encabezado en `filaEncabezado` y datos debajo hasta la última fila.
// Aplica encabezado, formatos numéricos, cebra, congelado, autofiltro y anchos.
function estilizarTabla(hoja, { filaEncabezado = 1, filtro = true, congelar = true } = {}) {
    const encabezado = hoja.getRow(filaEncabezado);
    const nCols = encabezado.cellCount;
    const ultima = hoja.rowCount;
    if (!nCols) return;

    const nombres = [];
    for (let c = 1; c <= nCols; c++) nombres.push(encabezado.getCell(c).value);

    estilizarEncabezado(encabezado);
    if (ultima > filaEncabezado) {
        formatearColumnas(hoja, nombres, filaEncabezado + 1, ultima);
        aplicarCebra(hoja, filaEncabezado + 1, ultima, nCols);
    }
    if (congelar) hoja.views = [{ state: 'frozen', ySplit: filaEncabezado }];
    if (filtro && ultima > filaEncabezado) {
        hoja.autoFilter = {
            from: { row: filaEncabezado, column: 1 },
            to: { row: filaEncabezado, column: nCols }
        };
    }
    autoajustarAnchos(hoja, nCols);
}

module.exports = {
    COLORES,
    FILL_TITULO, FONT_TITULO,
    FILL_ENCABEZADO, FONT_ENCABEZADO,
    FILL_ETIQUETA, FONT_ETIQUETA,
    FILL_CEBRA, FILL_RESALTADO, BORDE_FINO,
    FMT_MONTO, FMT_ENTERO, FMT_FECHA,
    esColumnaMonto,
    estilizarTitulo, estilizarEncabezado, estilizarEtiqueta,
    aplicarCebra, formatearColumnas, autoajustarAnchos, estilizarTabla
};
