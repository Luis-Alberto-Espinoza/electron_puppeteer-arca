// atm/constanciaFiscal/excelDeuda.js
// Excel de la deuda de ATM (lo que trae el PDF de "Imprimir Deuda"): hoja "Resumen" con el total
// por impuesto + una hoja por tabla del PDF, con montos y fechas como número/fecha (se pueden sumar).
// ExcelJS + hoja de estilos única (tablasPdf/motor/utils/estilosExcel.js), igual que Apremios.

const ExcelJS = require('exceljs');
const estilos = require('../../tablasPdf/motor/utils/estilosExcel.js');

const COLUMNA_TOTAL = 'Saldo Actualizado';

/** "3.379,25" → 3379.25 (formato de ATM ya convertido por el extractor). */
function aNumero(texto) {
    if (typeof texto !== 'string' || !/^-?[\d.]+,\d+$/.test(texto.trim())) return null;
    return parseFloat(texto.trim().replace(/\./g, '').replace(',', '.'));
}

/** "24/11/2024" → Date (sin hora). */
function aFecha(texto) {
    const m = typeof texto === 'string' && texto.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : null;
}

/** Nombre de hoja válido para Excel (máx. 31, sin / \ ? * [ ] :). */
function nombreHoja(titulo, usados) {
    let base = String(titulo || 'Deuda')
        .replace(/[/\\?*[\]:]/g, '-')
        .toLowerCase().replace(/(^|\s)\S/g, l => l.toUpperCase())
        .slice(0, 31).trim();
    let nombre = base;
    for (let i = 2; usados.has(nombre); i++) nombre = `${base.slice(0, 28)} ${i}`;
    usados.add(nombre);
    return nombre;
}

const redondear = (n) => Math.round(n * 100) / 100;   // sin esto: 99516692.00999999

function totalDe(tabla) {
    return redondear(tabla.datos.reduce((suma, fila) => suma + (aNumero(fila[COLUMNA_TOTAL]) || 0), 0));
}

function hojaTabla(wb, tabla, usados) {
    const hoja = wb.addWorksheet(nombreHoja(tabla.titulo, usados));
    const encabezados = Object.keys(tabla.datos[0] || {});
    hoja.addRow(encabezados);
    tabla.datos.forEach(registro => {
        const fila = hoja.addRow(encabezados.map(h => {
            const valor = registro[h];
            if (estilos.esColumnaMonto(h, [])) return aNumero(valor) ?? valor;
            if (/fecha/i.test(h)) return aFecha(valor) ?? valor;
            return valor;
        }));
        encabezados.forEach((h, i) => {
            const celda = fila.getCell(i + 1);
            if (typeof celda.value === 'number') celda.numFmt = estilos.FMT_MONTO_MILES;
            if (celda.value instanceof Date) celda.numFmt = estilos.FMT_FECHA;
        });
    });
    estilos.estilizarTabla(hoja, { fmtMonto: estilos.FMT_MONTO_MILES });
    estilos.ajustarImpresion(hoja);
}

function hojaResumen(wb, tablas, contribuyente, fecha) {
    const hoja = wb.addWorksheet('Resumen');
    hoja.addRow([`Deuda ATM — ${contribuyente.nombre || ''} (${contribuyente.cuit}) — consulta del ${fecha}`]);
    estilos.estilizarTitulo(hoja.getCell(1, 1));
    hoja.mergeCells(1, 1, 1, 3);
    hoja.addRow([]);
    hoja.addRow(['Impuesto', 'Cuotas', COLUMNA_TOTAL]);
    tablas.forEach(tabla => {
        const fila = hoja.addRow([tabla.titulo, tabla.datos.length, totalDe(tabla)]);
        fila.getCell(3).numFmt = estilos.FMT_MONTO_MILES;
    });
    const total = hoja.addRow(['TOTAL', tablas.reduce((s, t) => s + t.datos.length, 0),
        redondear(tablas.reduce((s, t) => s + totalDe(t), 0))]);
    total.getCell(3).numFmt = estilos.FMT_MONTO_MILES;
    estilos.estilizarTabla(hoja, { filaEncabezado: 3, filtro: false, fmtMonto: estilos.FMT_MONTO_MILES });
    total.eachCell(celda => {
        celda.font = { bold: true };
        celda.fill = estilos.relleno(estilos.COLORES.resaltado);
    });
}

/**
 * @param {Array<{titulo: string, datos: Object[]}>} tablas  las del PDF de deuda (extractor de tablas)
 * @param {{cuit: string, nombre?: string}} contribuyente
 * @param {string} rutaExcel  dónde guardarlo (al lado del PDF, mismo nombre .xlsx)
 * @returns {Promise<{rutaExcel: string, resumen: Array<{nombreTabla: string, total: string}>}>}
 */
async function generarExcelDeuda(tablas, contribuyente, rutaExcel) {
    const wb = new ExcelJS.Workbook();
    const fecha = new Date().toLocaleDateString('es-AR');
    hojaResumen(wb, tablas, contribuyente, fecha);
    const usados = new Set(['Resumen']);
    tablas.forEach(tabla => hojaTabla(wb, tabla, usados));
    await wb.xlsx.writeFile(rutaExcel);

    // Mismo resumen que la tarjeta ya sabe mostrar ("Resumen de Deudas").
    const resumen = tablas.map(t => ({ nombreTabla: t.titulo, total: totalDe(t).toFixed(2).replace('.', ',') }));
    return { rutaExcel, resumen };
}

module.exports = { generarExcelDeuda, aNumero, aFecha, nombreHoja };
