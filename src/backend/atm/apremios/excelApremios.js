// atm/apremios/excelApremios.js
// Un Excel por cliente: hoja "Resumen" + una hoja por impuesto consultado, con la tabla
// "Listado de Inhibiciones" tal cual la muestra ATM (montos como número).
// ExcelJS + hoja de estilos única (tablasPdf/motor/utils/estilosExcel.js).

const ExcelJS = require('exceljs');
const path = require('path');
const estilos = require('../../tablasPdf/motor/utils/estilosExcel.js');
const { getDownloadPathContribuyente } = require('../../cliente/carpetaContribuyente.js');
const { nombreArchivo: nombreArchivoComun } = require('../../comun/nombreArchivo.js');
const { IMPUESTO_POR_ID, convertirFilas, esColumnaMonto } = require('./tablaApremios.js');

const CARPETA = 'archivos_atm/Apremios';

// <CUIT>_Apremios_<AAAA-MM-DD>.xlsx (regla común, comun/nombreArchivo.js). Antes Apremios_ATM_<cuit>_<fecha>.xlsx.
// Sin hora: la consulta del mismo día pisa a la anterior.
function nombreArchivo(cuit) {
    return nombreArchivoComun({ servicio: 'Apremios', cuit, extension: 'xlsx' });
}

function hojaImpuesto(wb, r, fecha) {
    const hoja = wb.addWorksheet(IMPUESTO_POR_ID.get(r.impuesto).hoja);

    if (!r.ok) {
        hoja.addRow([`No se pudo consultar (${fecha}): ${r.error}`]);
        estilos.marcarEstado(hoja.getCell(1, 1), 'error');
        hoja.getColumn(1).width = 90;
        return;
    }

    const encabezados = r.encabezados;
    hoja.addRow(encabezados);
    if (r.filas.length === 0) {
        hoja.addRow([`Sin apremios (consulta del ${fecha})${r.mensaje ? ` — ATM: ${r.mensaje}` : ''}`]);
        hoja.mergeCells(2, 1, 2, Math.max(encabezados.length, 1));
    }
    convertirFilas(encabezados, r.filas).forEach(valores => {
        const fila = hoja.addRow(valores);
        encabezados.forEach((h, i) => {
            const celda = fila.getCell(i + 1);
            if (esColumnaMonto(h) && typeof celda.value === 'number') celda.numFmt = estilos.FMT_MONTO_MILES;
        });
    });
    estilos.estilizarTabla(hoja, { fmtMonto: estilos.FMT_MONTO_MILES });
    estilos.ajustarImpresion(hoja);
}

function hojaResumen(wb, resultados, contribuyente, fecha) {
    const hoja = wb.addWorksheet('Resumen');
    hoja.addRow([`Apremios ATM — ${contribuyente.nombre || ''} (${contribuyente.cuit}) — consulta del ${fecha}`]);
    estilos.estilizarTitulo(hoja.getCell(1, 1));
    hoja.mergeCells(1, 1, 1, 5);
    hoja.addRow([]);
    hoja.addRow(['Impuesto', 'Apremios', 'Con saldo', 'Saldo adeudado', 'Estado']);
    resultados.forEach(r => {
        const nombre = IMPUESTO_POR_ID.get(r.impuesto).hoja;
        const fila = r.ok
            ? hoja.addRow([nombre, r.resumen.cantidad, r.resumen.conSaldo, r.resumen.saldoTotal,
                r.resumen.cantidad === 0 ? 'Sin apremios' : 'Consultado'])
            : hoja.addRow([nombre, '', '', '', `Error: ${r.error}`]);
        fila.getCell(4).numFmt = estilos.FMT_MONTO_MILES;
        estilos.marcarEstado(fila.getCell(5), !r.ok ? 'error' : (r.resumen.conSaldo > 0 ? 'aviso' : 'ok'));
    });
    estilos.estilizarTabla(hoja, { filaEncabezado: 3, filtro: false, fmtMonto: estilos.FMT_MONTO_MILES });
}

/**
 * @param {Array<{impuesto: string, ok: boolean, encabezados?: string[], filas?: string[][],
 *                resumen?: Object, mensaje?: string, error?: string}>} resultados  uno por impuesto pedido
 * @param {{cuit: string, nombre?: string}} contribuyente  el OBJETIVO (no el representante)
 * @param {string} downloadsPath
 * @returns {Promise<{rutaExcel: string, downloadDir: string}>}
 */
async function generarExcelApremios(resultados, contribuyente, downloadsPath) {
    const cuit = String(contribuyente.cuit);
    const downloadDir = await getDownloadPathContribuyente(downloadsPath, cuit, contribuyente.nombre || '', CARPETA);
    const rutaExcel = path.join(downloadDir, nombreArchivo(cuit));
    const fecha = new Date().toLocaleDateString('es-AR');

    const wb = new ExcelJS.Workbook();
    hojaResumen(wb, resultados, contribuyente, fecha);
    resultados.forEach(r => hojaImpuesto(wb, r, fecha));

    await wb.xlsx.writeFile(rutaExcel);
    return { rutaExcel, downloadDir };
}

module.exports = { generarExcelApremios, nombreArchivo };
