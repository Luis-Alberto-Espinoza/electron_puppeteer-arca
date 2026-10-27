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
 *
 * ExcelJS + hoja de estilos única (tablasPdf/motor/utils/estilosExcel.js).
 * Ojo: notaCreditoDebito/service/leerExcelComprobantes.js LEE este archivo por
 * nombre de hoja y de encabezado (fila 1): no agregar títulos arriba del encabezado.
 */

const path = require('path');
const ExcelJS = require('exceljs');
const estilos = require('../../../../../tablasPdf/motor/utils/estilosExcel.js');
const { getDownloadPath } = require('../../../../../utils/fileManager.js');

// Columnas de montos que el estilo común no reconoce por nombre ("IVA 21%" con
// 210 parecería un código): se marcan como monto antes de estilizar.
const PATRON_IVA = /^IVA /;

// Arma una hoja con encabezado en la fila 1 (claves del primer objeto) y le da el estilo común.
function hojaDesdeFilas(wb, nombre, filas) {
    const hoja = wb.addWorksheet(nombre);
    const encabezados = Object.keys(filas[0]);
    hoja.addRow(encabezados);
    filas.forEach(f => {
        const fila = hoja.addRow(encabezados.map(h => f[h]));
        encabezados.forEach((h, i) => {
            if (PATRON_IVA.test(h) && typeof f[h] === 'number') fila.getCell(i + 1).numFmt = estilos.FMT_MONTO;
        });
    });
    estilos.estilizarTabla(hoja);
    estilos.ajustarImpresion(hoja);
    return hoja;
}

async function generarExcelComprobantes(comprobantes, usuario, basePath, periodoDesde, periodoHasta) {
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

    const wb = new ExcelJS.Workbook();
    if (filas.length > 0) {
        const hoja = hojaDesdeFilas(wb, 'Comprobantes', filas);
        // Fila TOTAL (la última): destacada.
        const filaTotal = hoja.getRow(hoja.rowCount);
        filaTotal.eachCell({ includeEmpty: true }, celda => {
            celda.fill = estilos.FILL_RESALTADO;
            celda.font = { bold: true };
        });
    } else {
        // Sin comprobantes: hoja vacía, como antes.
        wb.addWorksheet('Comprobantes');
    }

    // === Hoja 2: Descripciones ===
    // Una factura puede tener varios ítems. Para no romper "1 fila = 1
    // comprobante" en la hoja principal, las descripciones van en su propia
    // hoja: la clave (Punto de Venta + Comprobante Nro, porque el Nro se repite
    // entre puntos de venta) figura en el primer renglón del comprobante y las
    // descripciones siguientes quedan debajo con la clave en blanco.
    // Una fila por ítem, con su Importe (subtotal). El Importe por ítem lo usa la
    // generación de Notas para emitir una línea por ítem con su monto real.
    // Compat: si el comprobante no trae `items` (parseo viejo), cae a descripciones
    // sueltas sin importe.
    const filasDesc = [];
    comprobantes.forEach(c => {
        let items = Array.isArray(c.items) && c.items.length ? c.items : null;
        if (!items) {
            const descs = (Array.isArray(c.descripciones) && c.descripciones.length) ? c.descripciones : [''];
            items = descs.map(d => ({ descripcion: d, importe: null }));
        }
        items.forEach((item, i) => {
            filasDesc.push({
                'Punto de Venta':  i === 0 ? (c.puntoDeVenta || '') : '',
                'Comprobante Nro': i === 0 ? (c.comprobanteNumero || '') : '',
                'Descripción':     item.descripcion || '',
                'Importe':         typeof item.importe === 'number' ? item.importe : ''
            });
        });
    });
    if (filasDesc.length > 0) hojaDesdeFilas(wb, 'Descripciones', filasDesc);

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

    await wb.xlsx.writeFile(ruta);

    return {
        archivoExcel: nombre,
        rutaCompleta: ruta,
        totalFilas: comprobantes.length,
        sumaTotal
    };
}

module.exports = { generarExcelComprobantes };
