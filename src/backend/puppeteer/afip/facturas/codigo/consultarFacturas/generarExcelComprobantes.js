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
 *   - Importe Neto Gravado
 *   - IVA 0% / 2.5% / 5% / 10.5% / 21% / 27%
 *   - Importe Otros Tributos
 *   - Total
 *
 * Las columnas de desglose (neto, IVAs, otros tributos) pueden venir vacías:
 * el parser solo las completa si el comprobante las trae.
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
        'Fecha de Vto. para el Pago': c.fechaVtoPago || '',
        'Condición de Venta':        c.condicionVenta || '',
        'Cond. IVA Emisor':          c.condicionIvaEmisor || '',
        'Cond. IVA Receptor':        c.condicionIvaReceptor || '',
        'Importe Neto Gravado':      typeof c.netoGravado   === 'number' ? c.netoGravado   : '',
        'IVA 0%':                    typeof c.iva0          === 'number' ? c.iva0          : '',
        'IVA 2.5%':                  typeof c.iva25         === 'number' ? c.iva25         : '',
        'IVA 5%':                    typeof c.iva5          === 'number' ? c.iva5          : '',
        'IVA 10.5%':                 typeof c.iva105        === 'number' ? c.iva105        : '',
        'IVA 21%':                   typeof c.iva21         === 'number' ? c.iva21         : '',
        'IVA 27%':                   typeof c.iva27         === 'number' ? c.iva27         : '',
        'Importe Otros Tributos':    typeof c.otrosTributos === 'number' ? c.otrosTributos : '',
        'Total':                     typeof c.importeTotal  === 'number' ? c.importeTotal  : ''
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
            'Fecha de Vto. para el Pago': '',
            'Condición de Venta': '',
            'Cond. IVA Emisor': '',
            'Cond. IVA Receptor': '',
            'Importe Neto Gravado': '',
            'IVA 0%': '',
            'IVA 2.5%': '',
            'IVA 5%': '',
            'IVA 10.5%': '',
            'IVA 21%': '',
            'IVA 27%': '',
            'Importe Otros Tributos': '',
            'Total': sumaTotal
        });
    }

    const hoja = XLSX.utils.json_to_sheet(filas);

    // Formato de número con 2 decimales (SIN $) para todas las columnas
    // monetarias: van del índice 12 (Importe Neto Gravado) al 20 (Total).
    // (Se corrieron +4 al insertar Vto. Pago + Condición Venta + Cond. IVA x2.)
    const COL_MONTO_DESDE = 12;
    const COL_MONTO_HASTA = 20;
    const rango = XLSX.utils.decode_range(hoja['!ref']);
    for (let r = rango.s.r + 1; r <= rango.e.r; r++) {
        for (let c = COL_MONTO_DESDE; c <= COL_MONTO_HASTA; c++) {
            const celda = hoja[XLSX.utils.encode_cell({ r, c })];
            if (celda && typeof celda.v === 'number') {
                celda.z = '#,##0.00';
            }
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
        { wch: 22 }, // Fecha de Vto. para el Pago
        { wch: 28 }, // Condición de Venta
        { wch: 24 }, // Cond. IVA Emisor
        { wch: 24 }, // Cond. IVA Receptor
        { wch: 20 }, // Importe Neto Gravado
        { wch: 12 }, // IVA 0%
        { wch: 12 }, // IVA 2.5%
        { wch: 12 }, // IVA 5%
        { wch: 12 }, // IVA 10.5%
        { wch: 12 }, // IVA 21%
        { wch: 12 }, // IVA 27%
        { wch: 20 }, // Importe Otros Tributos
        { wch: 14 }  // Total
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, hoja, 'Comprobantes');

    // === Hoja 2: Descripciones ===
    // Una factura puede tener varios ítems. Para no romper "1 fila = 1
    // comprobante" en la hoja principal, las descripciones van en su propia
    // hoja: la clave (Punto de Venta + Comprobante Nro, porque el Nro se repite
    // entre puntos de venta) figura en el primer renglón del comprobante y las
    // descripciones siguientes quedan debajo con la clave en blanco.
    const filasDesc = [];
    comprobantes.forEach(c => {
        const descs = (Array.isArray(c.descripciones) && c.descripciones.length)
            ? c.descripciones
            : [''];
        descs.forEach((d, i) => {
            filasDesc.push({
                'Punto de Venta':  i === 0 ? (c.puntoDeVenta || '') : '',
                'Comprobante Nro': i === 0 ? (c.comprobanteNumero || '') : '',
                'Descripción':     d
            });
        });
    });
    if (filasDesc.length > 0) {
        const hojaDesc = XLSX.utils.json_to_sheet(filasDesc);
        hojaDesc['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, hojaDesc, 'Descripciones');
    }

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
