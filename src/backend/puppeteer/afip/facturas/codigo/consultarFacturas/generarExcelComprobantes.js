/**
 * Genera un Excel con los comprobantes extraídos.
 *
 * Encabezados:
 *   - Tipo de Comprobante
 *   - Punto de Venta
 *   - Comprobante Nro
 *   - Período Facturado Desde
 *   - Período Facturado Hasta
 *   - Fecha de Emisión
 *   - CUIT
 *   - Apellido / Razón Social
 *   - Total
 */

const path = require('path');
const XLSX = require('xlsx');
const { getDownloadPath } = require('../../../../../utils/fileManager.js');

function generarExcelComprobantes(comprobantes, usuario, basePath, periodoDesde, periodoHasta) {
    const filas = comprobantes.map(c => ({
        'Tipo de Comprobante':       c.tipoComprobante || '',
        'Punto de Venta':            c.puntoDeVenta || '',
        'Comprobante Nro':           c.comprobanteNumero || '',
        'Período Facturado Desde':   c.periodoDesde || '',
        'Período Facturado Hasta':   c.periodoHasta || '',
        'Fecha de Emisión':          c.fechaEmision || '',
        'CUIT':                      c.cuitReceptor || '',
        'Apellido / Razón Social':   c.razonSocialReceptor || '',
        'Total':                     typeof c.importeTotal === 'number' ? c.importeTotal : ''
    }));

    // Fila total al final (solo si hay datos)
    const sumaTotal = filas.reduce((acc, f) => acc + (typeof f.Total === 'number' ? f.Total : 0), 0);
    if (filas.length > 0) {
        filas.push({
            'Tipo de Comprobante': '',
            'Punto de Venta': '',
            'Comprobante Nro': '',
            'Período Facturado Desde': '',
            'Período Facturado Hasta': '',
            'Fecha de Emisión': '',
            'CUIT': '',
            'Apellido / Razón Social': 'TOTAL',
            'Total': sumaTotal
        });
    }

    const hoja = XLSX.utils.json_to_sheet(filas);

    // Formato $ con 2 decimales para la columna Total (ahora índice 8, porque
    // "Tipo de Comprobante" entró como primera columna).
    const rango = XLSX.utils.decode_range(hoja['!ref']);
    for (let r = rango.s.r + 1; r <= rango.e.r; r++) {
        const dir = XLSX.utils.encode_cell({ r, c: 8 });
        const celda = hoja[dir];
        if (celda && typeof celda.v === 'number') {
            celda.z = '#,##0.00';
        }
    }

    // Anchos de columna razonables
    hoja['!cols'] = [
        { wch: 28 }, // Tipo de Comprobante
        { wch: 14 }, // Punto de Venta
        { wch: 16 }, // Comprobante Nro
        { wch: 22 }, // Período Desde
        { wch: 22 }, // Período Hasta
        { wch: 16 }, // Fecha de Emisión
        { wch: 14 }, // CUIT
        { wch: 32 }, // Razón Social
        { wch: 14 }  // Total
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, hoja, 'Comprobantes');

    // Ruta de destino (misma estructura que consulta de deuda)
    const destinoDir = getDownloadPath(basePath, {
        cuit: usuario.cuit,
        nombre: usuario.nombre,
        apellido: usuario.apellido
    }, 'archivos_afip');

    const fmtFecha = (s) => (s || '').replace(/\//g, '-');
    const ahora = new Date();
    const stamp =
        `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}` +
        `_${String(ahora.getHours()).padStart(2, '0')}${String(ahora.getMinutes()).padStart(2, '0')}`;

    const nombre = `consulta_comprobantes_${usuario.cuit}_${fmtFecha(periodoDesde)}_a_${fmtFecha(periodoHasta)}_${stamp}.xlsx`;
    const ruta = path.join(destinoDir, nombre);

    XLSX.writeFile(wb, ruta);

    return {
        archivoExcel: nombre,
        rutaCompleta: ruta,
        totalFilas: comprobantes.length,
        sumaTotal
    };
}

module.exports = { generarExcelComprobantes };
