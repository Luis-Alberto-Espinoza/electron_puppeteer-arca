// Tests de guardarReporte. Correr: node --test pruebas/guardarReporte.test.js
// OJO: estos tests escriben en el historial REAL (pruebas/reportes/historial.jsonl).
// No rompe nada (es append y está gitignored), pero deja un par de líneas de prueba.
// Si más adelante molesta, le agregamos a guardarReporte un parámetro de ruta para tests.

const test = require('node:test');
const assert = require('node:assert');

const { guardarReporte, leerHistorial } = require('./guardarReporte.js');

test('escribe una línea válida y la puede releer', () => {
    const linea = guardarReporte({ servicio: 'afip-vep', resultado: 'ok', cliente: 'Luis SA', duracionMs: 8200 });

    assert.strictEqual(linea.servicio, 'afip-vep');
    assert.strictEqual(linea.resultado, 'ok');
    assert.ok(linea.fecha, 'debe tener fecha ISO');

    const historial = leerHistorial();
    assert.ok(historial.some(l => l.fecha === linea.fecha && l.cliente === 'Luis SA'),
        'la línea recién escrita debe aparecer en el historial');
});

test('guarda solo el mensaje del error, no el objeto entero', () => {
    const linea = guardarReporte({
        servicio: 'atm-constancias',
        resultado: 'fallo',
        error: new Error('selector no encontrado'),
    });
    assert.strictEqual(linea.error, 'selector no encontrado');
});

test('rechaza un resultado que no sea ok | fallo', () => {
    assert.throws(() => guardarReporte({ servicio: 'x', resultado: 'masomenos' }), /debe ser ok \| fallo/);
});

test('rechaza si falta el servicio', () => {
    assert.throws(() => guardarReporte({ resultado: 'ok' }), /falta "servicio"/);
});
