const { test } = require('node:test');
const assert = require('node:assert');
const { estadoDelCliente } = require('./estadoResultado.js');

test('estado de la tarjeta: Éxito / PARCIAL (con los archivos que bajaron) / FALLO', () => {
    assert.strictEqual(estadoDelCliente({ descargaIncompleta: false, files: [] }), 'exito_final');   // sin registros
    assert.strictEqual(estadoDelCliente({ descargaIncompleta: false, files: ['a.xls'] }), 'exito_final');
    assert.strictEqual(estadoDelCliente({ descargaIncompleta: true, files: ['a.xls'] }), 'parcial');
    assert.strictEqual(estadoDelCliente({ descargaIncompleta: true, files: [] }), 'error');
});
