// afip/ddjjPendientes/excelDdjjPendientes.js
// Excel por cliente con la tabla COMPLETA de DDJJ pendientes: las columnas de la
// pantalla de AFIP + las que trae la API y la pantalla no muestra (importe, exigible,
// concepto…). ExcelJS + hoja de estilos única (tablasPdf/motor/utils/estilosExcel.js).

const ExcelJS = require('exceljs');
const path = require('path');
const estilos = require('../../tablasPdf/motor/utils/estilosExcel.js');
const { getDownloadPathContribuyente } = require('../../cliente/carpetaContribuyente.js');

const COLUMNAS = [
    ['CUIT', f => f.cuit],
    ['Est', f => f.establecimiento],
    ['Impuesto', f => f.impuesto],
    ['Período', f => f.periodo],
    ['Fecha Vencimiento', f => fechaLocal(f.vencimiento)],
    ['Importe', f => f.importe],
    ['Exigible', f => (f.exigible == null ? '' : (f.exigible ? 'Sí' : 'No'))],
    ['Concepto', f => f.concepto],
    ['Subconcepto', f => f.subconcepto],
    ['Anticipo/Cuota', f => f.anticipoCuota],
    ['Boleta deuda', f => f.boletaDeuda],
    ['Origen', f => f.origen],
    ['Nro. liquidación', f => f.nroLiquidacion]
];

// ddjj_pendientes_<cuit>_<AAAA-MM-DD>.<ext>: sin hora, así la consulta del mismo día pisa
// a la anterior (pedido del usuario).
function nombreArchivo(cuit, ext) {
    const h = new Date();
    const dia = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
    return `ddjj_pendientes_${cuit}_${dia}.${ext}`;
}

// "2025-12-23" → fecha local (sin pasar por UTC, que la correría un día).
function fechaLocal(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : (texto || '');
}

/**
 * @param {Array<Object>} filas  de paso_4; vacío = al día (el Excel lo dice: queda de constancia)
 * @param {{cuit: string, nombre?: string}} contribuyente  el objetivo
 * @param {string} downloadsPath
 * @returns {Promise<string>} ruta del .xlsx
 */
async function generarExcelDdjjPendientes(filas, contribuyente, downloadsPath) {
    const cuit = String(contribuyente.cuit);
    const downloadDir = await getDownloadPathContribuyente(downloadsPath, cuit, contribuyente.nombre || '', 'archivos_afip');
    const rutaExcel = path.join(downloadDir, nombreArchivo(cuit, 'xlsx'));

    const wb = new ExcelJS.Workbook();
    const hoja = wb.addWorksheet('DDJJ pendientes');
    hoja.addRow(COLUMNAS.map(([titulo]) => titulo));
    if (filas.length === 0) {
        hoja.addRow([`Sin DDJJ pendientes de presentación (consulta del ${new Date().toLocaleDateString('es-AR')})`]);
        hoja.mergeCells(2, 1, 2, COLUMNAS.length);   // combinada: no ensancha la columna CUIT
    }
    filas.forEach(f => {
        const fila = hoja.addRow(COLUMNAS.map(([, valor]) => valor(f)));
        const celdaFecha = fila.getCell(5);
        if (celdaFecha.value instanceof Date) celdaFecha.numFmt = estilos.FMT_FECHA;
    });
    estilos.estilizarTabla(hoja, { fmtMonto: estilos.FMT_MONTO_MILES });
    estilos.ajustarImpresion(hoja);

    await wb.xlsx.writeFile(rutaExcel);
    return rutaExcel;
}

module.exports = { generarExcelDdjjPendientes, nombreArchivo };
