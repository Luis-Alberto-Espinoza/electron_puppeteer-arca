// node --test src/backend/afip/facturaExcel/service/leerExcelFacturas.test.js
const test = require('node:test');
const assert = require('node:assert');
const ExcelJS = require('exceljs');
const { leerExcelFacturas, fechaDe, numeroDe } = require('./leerExcelFacturas.js');
const { generarModeloExcel } = require('./modeloExcel.js');

const HOY = '29/10/2026';
const CUIT_OK = '20123456786';      // dígito verificador correcto
const CUIT_MALO = '20123456789';

// Arma un Excel con las filas dadas (encabezados como en el modelo).
function libro(facturas, lineas, { sinAlicuota = false } = {}) {
    const l = new ExcelJS.Workbook();
    const hf = l.addWorksheet('Facturas');
    hf.addRow(['N°', 'Fecha', 'Comprobante', 'Actividad', 'Desde', 'Hasta', 'Vto. pago', 'N° doc.', 'Condición IVA', 'Condición de venta', 'Nombre']);
    facturas.forEach(f => hf.addRow(f));
    const hl = l.addWorksheet('Líneas');
    hl.addRow(['N° factura', 'Descripción', 'Cantidad', 'Unidad', 'Precio unitario', ...(sinAlicuota ? [] : ['Alícuota IVA'])]);
    lineas.forEach(x => hl.addRow(x));
    return l;
}

test('una factura completa arma el grupo que entiende el motor', () => {
    const r = leerExcelFacturas(libro(
        [[1, '15/10/2026', 'Factura A', 'Servicio', '01/10/2026', '31/10/2026', '20/11/2026', CUIT_OK, 'IVA Responsable Inscripto', 'Contado; Transferencia Bancaria', 'Juan']],
        [[1, 'Honorarios', 2, 'unidades', '1.500,50', '10,5%'], [1, 'Viáticos', '', '', 300, '']]
    ), { tipoEmisor: 'B', hoy: HOY });
    assert.deepStrictEqual(r.errores, []);
    assert.strictEqual(r.facturas.length, 1);
    const f = r.facturas[0];
    assert.strictEqual(f.total, 3301);
    const dc = f.grupo.datosComunes;
    assert.strictEqual(dc.tipoComprobante, '10');
    assert.strictEqual(dc.fechaComprobante, '15/10/2026');
    assert.strictEqual(dc.fechaVtoPago, '20/11/2026');
    assert.deepStrictEqual(dc.receptor, {
        tipoDocumento: 80, numeroDocumento: CUIT_OK, condicionIVA: 1,
        condicionesVenta: ['Contado', 'Transferencia Bancaria'], nombreCliente: 'Juan',
    });
    assert.deepStrictEqual(f.grupo.facturas[0].lineasDetalle, [
        { descripcion: 'Honorarios', unidadMedida: 'unidades', cantidad: 2, precioUnitario: 1500.5, alicuotaIVA: 4 },
        { descripcion: 'Viáticos', unidadMedida: 'unidades', cantidad: 1, precioUnitario: 300, alicuotaIVA: 5 },
    ]);
});

test('vacíos toman el valor por defecto; sin documento = consumidor final', () => {
    const r = leerExcelFacturas(libro([[1, '', '', '', '', '', '', '', '', '', '']], [[1, 'Venta', '', '', 100]], { sinAlicuota: true }),
        { tipoEmisor: 'C', hoy: HOY });
    assert.deepStrictEqual(r.errores, []);
    const dc = r.facturas[0].grupo.datosComunes;
    assert.strictEqual(dc.tipoComprobante, '2');            // Factura C
    assert.strictEqual(dc.tipoActividad, 'Servicio');
    assert.strictEqual(dc.fechaComprobante, HOY);
    assert.strictEqual(dc.fechaDesde, HOY);
    assert.strictEqual(dc.receptor.numeroDocumento, '');
    assert.strictEqual(dc.receptor.condicionIVA, 5);
    assert.deepStrictEqual(dc.receptor.condicionesVenta, ['Cuenta Corriente']);
    assert.strictEqual(r.facturas[0].receptor, 'Consumidor final');
    assert.strictEqual(r.facturas[0].grupo.facturas[0].lineasDetalle[0].alicuotaIVA, undefined);   // C no lleva IVA
});

test('DNI por largo; fechas y alícuotas como las guarda Excel', () => {
    const r = leerExcelFacturas(libro(
        [[1, new Date(Date.UTC(2026, 9, 5)), 'Factura B', 'Producto', '', '', '', '30123456', '', '', '']],
        [[1, 'Cosa', 1, 'Kilogramos', 50, 0.21]]
    ), { tipoEmisor: 'B', hoy: HOY });
    assert.deepStrictEqual(r.errores, []);
    const dc = r.facturas[0].grupo.datosComunes;
    assert.strictEqual(dc.fechaComprobante, '05/10/2026');
    assert.strictEqual(dc.receptor.tipoDocumento, 96);
    assert.strictEqual(r.facturas[0].grupo.facturas[0].lineasDetalle[0].unidadMedida, 'kilogramos');
    assert.strictEqual(r.facturas[0].grupo.facturas[0].lineasDetalle[0].alicuotaIVA, 5);
});

test('cada error dice hoja y fila', () => {
    const r = leerExcelFacturas(libro(
        [
            [1, '31/02/2026', 'Factura Z', 'Otra', '', '', '', CUIT_MALO, '', 'Bitcoin', ''],
            [2, '', 'Factura A', '', '', '', '', '', 'Consumidor Final', '', ''],
            [2, '', '', '', '', '', '', '', '', '', ''],
            [3, '', '', '', '', '', '', '', 'Responsable Monotributo', '', ''],
            [4, '', '', '', '', '', '', '', '', '', ''],
        ],
        [[1, '', 0, 'bolsas', 'abc', '99%'], [9, 'Huérfana', 1, '', 10, '']]
    ), { tipoEmisor: 'B', hoy: HOY });
    const e = r.errores.join('\n');
    assert.match(e, /Facturas, fila 2: la fecha "31\/02\/2026" no se entiende/);
    assert.match(e, /Facturas, fila 2: el comprobante "Factura Z" no se puede emitir/);
    assert.match(e, /Facturas, fila 2: la actividad "Otra"/);
    assert.match(e, /Facturas, fila 2: el CUIT 20123456789 no es válido/);
    assert.match(e, /Facturas, fila 2: la condición de venta "Bitcoin" no existe/);
    assert.match(e, /Facturas, fila 3: Factura A necesita el CUIT del receptor/);
    assert.match(e, /Facturas, fila 3: Factura A no se puede hacer a un Consumidor Final/);
    assert.match(e, /Facturas, fila 4: el N° 2 está repetido \(también en la fila 3\)/);
    assert.match(e, /Facturas, fila 5: sin N° de doc\. el receptor tiene que ser Consumidor Final/);
    assert.match(e, /Líneas, fila 2: falta la descripción/);
    assert.match(e, /Líneas, fila 2: la cantidad "0"/);
    assert.match(e, /Líneas, fila 2: la unidad "bolsas" no existe/);
    assert.match(e, /Líneas, fila 2: el precio "abc"/);
    assert.match(e, /Líneas, fila 2: la alícuota "99%" no existe/);
    assert.match(e, /Líneas, fila 3: la factura N° 9 no está en la hoja "Facturas"/);
    assert.match(e, /Factura N° 4 \(fila 6\): no tiene líneas/);
});

test('emisor sin tipo, hojas o columnas que faltan', () => {
    assert.match(leerExcelFacturas(libro([], []), { tipoEmisor: null, hoy: HOY }).errores[0], /no tiene tipo de contribuyente/);
    const sinLineas = new ExcelJS.Workbook();
    sinLineas.addWorksheet('Facturas').addRow(['N°', 'N° doc.']);
    assert.match(leerExcelFacturas(sinLineas, { tipoEmisor: 'C', hoy: HOY }).errores.join(), /Falta la hoja "Líneas"/);
    const sinColumna = new ExcelJS.Workbook();
    sinColumna.addWorksheet('Facturas').addRow(['N°']);
    sinColumna.addWorksheet('Lineas').addRow(['N° factura', 'Descripcion', 'Precio unitario']);   // sin acentos: igual la encuentra
    assert.deepStrictEqual(leerExcelFacturas(sinColumna, { tipoEmisor: 'C', hoy: HOY }).errores, ['Hoja "Facturas": falta la columna "N° doc.".']);
});

test('el modelo vacío se vuelve a leer: solo avisa que no hay facturas', async () => {
    for (const tipo of ['B', 'C']) {
        const l = new ExcelJS.Workbook();
        await l.xlsx.load(await generarModeloExcel(tipo));
        assert.deepStrictEqual(leerExcelFacturas(l, { tipoEmisor: tipo, hoy: HOY }).errores, ['La hoja "Facturas" no tiene facturas.']);
    }
});

test('fechaDe y numeroDe', () => {
    assert.strictEqual(fechaDe('2026-10-05'), '05/10/2026');
    assert.strictEqual(fechaDe('5/1/2026'), '05/01/2026');
    assert.strictEqual(fechaDe(46300), '05/10/2026');       // serial de Excel
    assert.strictEqual(fechaDe('hoy'), null);
    assert.strictEqual(numeroDe('$ 150.000,50'), 150000.5);
    assert.strictEqual(numeroDe('1500.5'), 1500.5);
    assert.strictEqual(numeroDe(''), '');
});
