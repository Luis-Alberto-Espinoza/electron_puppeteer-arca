const test = require('node:test');
const assert = require('node:assert');
const {
    normalizarImpuestos, limpiarCelda, parsearImporte, esColumnaMonto, convertirFilas, resumirTabla
} = require('./tablaApremios.js');

// Encabezados reales de la pantalla (página guardada 2026-10-16).
const ENCABEZADOS = ['Boleta de Deuda', 'Objeto', 'Importe Boleta', 'Sdo. Adeud. S/Act. S/Costas',
    'Nro. Juicio', 'Juzgado', 'Secretaría', 'Embargo', 'Inhibición', 'Fecha Baja', 'Desc. Baja', 'Recaudador'];

test('normalizarImpuestos: orden de la pantalla, sin repetidos ni desconocidos', () => {
    assert.deepStrictEqual(normalizarImpuestos(['agentes', 'automotor', 'agentes', 'sellos']), ['automotor', 'agentes']);
    assert.deepStrictEqual(normalizarImpuestos(undefined), []);
});

test('limpiarCelda: &nbsp; de ZK cuenta como vacío', () => {
    assert.strictEqual(limpiarCelda(' '), '');
    assert.strictEqual(limpiarCelda('  CANCELACION NORMAL DE\n APREMIO '), 'CANCELACION NORMAL DE APREMIO');
});

test('parsearImporte: decimales con punto y notación científica de Java', () => {
    assert.strictEqual(parsearImporte('27914.3'), 27914.3);
    assert.strictEqual(parsearImporte('0.0'), 0);
    assert.strictEqual(parsearImporte('1.2777591978E8'), 127775919.78);
    assert.strictEqual(parsearImporte('9.409936083E7'), 94099360.83);
    assert.strictEqual(parsearImporte(' '), null);
    assert.strictEqual(parsearImporte('1.234,56'), null);   // formato que ATM no usa: no se adivina
});

test('esColumnaMonto: solo importe y saldo', () => {
    assert.deepStrictEqual(ENCABEZADOS.map(esColumnaMonto).map((m, i) => m ? ENCABEZADOS[i] : null).filter(Boolean),
        ['Importe Boleta', 'Sdo. Adeud. S/Act. S/Costas']);
});

test('convertirFilas: montos a número, identificadores quedan texto con sus ceros', () => {
    const [fila] = convertirFilas(ENCABEZADOS, [[
        '2026017438000', '(CM) 1545499', '1.2777591978E8', '9.409936083E7', '00000000', '0000',
        ' ', '', '', ' ', ' ', 'CAMPANELLO CARLOS ALBERTO'
    ]]);
    assert.strictEqual(fila[0], '2026017438000');
    assert.strictEqual(fila[2], 127775919.78);
    assert.strictEqual(fila[3], 94099360.83);
    assert.strictEqual(fila[4], '00000000');
    assert.strictEqual(fila[6], '');
});

test('resumirTabla: cuenta los que tienen saldo', () => {
    const filas = [
        ['1', 'A', '100.0', '0.0'],
        ['2', 'B', '200.0', '7490225.59'],
        ['3', 'C', '300.0', '9.717713718E7']
    ];
    assert.deepStrictEqual(resumirTabla(ENCABEZADOS, filas), { cantidad: 3, conSaldo: 2, saldoTotal: 104667362.77 });
    assert.deepStrictEqual(resumirTabla(ENCABEZADOS, []), { cantidad: 0, conSaldo: 0, saldoTotal: 0 });
});
