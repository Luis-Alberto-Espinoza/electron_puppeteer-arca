// facturaExcel/service/modeloExcel.js
// El Excel vacío para completar: hojas "Facturas" y "Líneas" con sus encabezados,
// listas desplegables (de una hoja oculta "Listas") y una hoja "Ayuda".

const ExcelJS = require('exceljs');
const {
    COMPROBANTES, ACTIVIDADES, CONDICIONES_IVA, CONDICIONES_VENTA, UNIDADES, ALICUOTAS,
} = require('./catalogo.js');
const { HOJA_FACTURAS, HOJA_LINEAS, COLUMNAS_FACTURAS, COLUMNAS_LINEAS } = require('./columnas.js');

const FILAS_CON_LISTA = 500;

function encabezados(hoja, columnas) {
    hoja.columns = columnas.map(c => ({ header: c.titulo, key: c.clave, width: c.ancho }));
    const fila = hoja.getRow(1);
    fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B3B8F' } };
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
}

// Letra de columna de una clave ("comprobante" → "C").
const letra = (columnas, clave) => String.fromCharCode(65 + columnas.findIndex(c => c.clave === clave));

function lista(hoja, columnas, clave, rangoListas, ayuda) {
    const col = letra(columnas, clave);
    hoja.dataValidations.add(`${col}2:${col}${FILAS_CON_LISTA}`, {
        type: 'list', allowBlank: true, formulae: [rangoListas],
        showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Valor no esperado', error: ayuda,
    });
}

function formatoFecha(hoja, columnas, claves) {
    for (const clave of claves) hoja.getColumn(letra(columnas, clave)).numFmt = 'dd/mm/yyyy';
}

/**
 * @param {'B'|'C'} tipoEmisor  define qué comprobantes ofrece y si va la alícuota
 * @returns {Promise<Buffer>}
 */
async function generarModeloExcel(tipoEmisor) {
    const libro = new ExcelJS.Workbook();
    const facturas = libro.addWorksheet(HOJA_FACTURAS);
    const lineas = libro.addWorksheet(HOJA_LINEAS);
    const ayuda = libro.addWorksheet('Ayuda');
    const listas = libro.addWorksheet('Listas', { state: 'hidden' });

    const columnasLineas = tipoEmisor === 'B' ? COLUMNAS_LINEAS : COLUMNAS_LINEAS.filter(c => c.clave !== 'alicuota');
    encabezados(facturas, COLUMNAS_FACTURAS);
    encabezados(lineas, columnasLineas);

    // Hoja oculta con las opciones: una columna por lista.
    const opciones = [
        ['Comprobante', (COMPROBANTES[tipoEmisor] || []).map(c => c.texto)],
        ['Actividad', ACTIVIDADES],
        ['Condición IVA', CONDICIONES_IVA.map(c => c.texto)],
        ['Unidad', UNIDADES],
        ['Alícuota IVA', ALICUOTAS.map(a => a.texto)],
    ];
    const rango = {};
    opciones.forEach(([titulo, valores], i) => {
        const col = String.fromCharCode(65 + i);
        listas.getCell(`${col}1`).value = titulo;
        valores.forEach((v, j) => { listas.getCell(`${col}${j + 2}`).value = v; });
        rango[titulo] = `Listas!$${col}$2:$${col}$${valores.length + 1}`;
    });

    lista(facturas, COLUMNAS_FACTURAS, 'comprobante', rango['Comprobante'], 'Elegí un comprobante de la lista.');
    lista(facturas, COLUMNAS_FACTURAS, 'actividad', rango['Actividad'], 'Servicio o Producto.');
    lista(facturas, COLUMNAS_FACTURAS, 'condicionIva', rango['Condición IVA'], 'Elegí una condición de la lista.');
    lista(lineas, columnasLineas, 'unidad', rango['Unidad'], 'Elegí una unidad de la lista.');
    if (tipoEmisor === 'B') lista(lineas, columnasLineas, 'alicuota', rango['Alícuota IVA'], 'Elegí una alícuota de la lista.');
    formatoFecha(facturas, COLUMNAS_FACTURAS, ['fecha', 'desde', 'hasta', 'vtoPago']);
    facturas.getColumn(letra(COLUMNAS_FACTURAS, 'documento')).numFmt = '@';   // que no lo pase a 2,01E+10

    ayuda.getColumn(1).width = 110;
    [
        'Cómo completar este Excel',
        '',
        `Hoja "${HOJA_FACTURAS}": una fila por factura.`,
        '  N°: 1, 2, 3… (sin repetir). Une cada factura con sus renglones de la hoja "Líneas".',
        '  Fecha: dd/mm/aaaa. Vacía = hoy.',
        '  Comprobante: de la lista. Vacío = ' + ((COMPROBANTES[tipoEmisor] || [])[0]?.texto || 'el de siempre') + '.',
        '  Actividad: Servicio o Producto. Vacía = Servicio.',
        '  Desde / Hasta / Vto. pago: solo para servicios. Vacías = la fecha de la factura.',
        '  N° doc.: CUIT (11 dígitos) o DNI (7 u 8). Vacío = consumidor final sin identificar (solo con Consumidor Final; las "A" piden CUIT).',
        '  Condición IVA: de la lista. Vacía = Consumidor Final.',
        `  Condición de venta: una o varias separadas con ";" (ej: Contado; Transferencia Bancaria). Vacía = Cuenta Corriente.`,
        `     Opciones: ${CONDICIONES_VENTA.join('; ')}.`,
        '  Nombre: opcional (nombra la carpeta del PDF).',
        '',
        `Hoja "${HOJA_LINEAS}": una fila por renglón de la factura.`,
        '  N° factura: el N° de la hoja "Facturas". Una factura con 3 renglones = 3 filas con el mismo N°.',
        '  Descripción y Precio unitario: obligatorios (precio mayor a 0, con centavos si hace falta).',
        '  Cantidad: vacía = 1. Unidad: de la lista, vacía = unidades.',
        tipoEmisor === 'B' ? '  Alícuota IVA: de la lista. Vacía = 21%.' : '',
        '',
        'El cliente que emite y el punto de venta se eligen en la app, no van en el Excel.',
    ].forEach((t, i) => {
        const celda = ayuda.getCell(`A${i + 1}`);
        celda.value = t;
        if (i === 0) celda.font = { bold: true, size: 14 };
    });

    return libro.xlsx.writeBuffer();
}

module.exports = { generarModeloExcel };
