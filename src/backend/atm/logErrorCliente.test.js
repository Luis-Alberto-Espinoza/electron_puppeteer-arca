const { test } = require('node:test');
const assert = require('node:assert');
const { logErrorCliente } = require('./logErrorCliente.js');

/** Captura lo que se manda a console.error durante fn. */
function capturar(fn) {
    const original = console.error;
    const salida = [];
    console.error = (...args) => salida.push(args);
    try { return { resultado: fn(), salida }; } finally { console.error = original; }
}

test('clave incorrecta: una línea, sin el objeto error (sin pila)', () => {
    const error = new Error('Clave ATM incorrecta: El CUIT o clave son incorrectos');
    error.code = 'INVALID_CREDENTIALS';
    const { resultado, salida } = capturar(() => logErrorCliente('Constancia Fiscal', 'ACONCAGUA', error));
    assert.strictEqual(resultado, true);
    assert.strictEqual(salida.length, 1);
    assert.strictEqual(salida[0].length, 1);   // solo el texto
    assert.match(salida[0][0], /ACONCAGUA: Clave ATM incorrecta.*\(INVALID_CREDENTIALS\)/);
});

test('error inesperado: se pasa el objeto error (con pila)', () => {
    const error = new Error('Cannot read properties of undefined');
    const { resultado, salida } = capturar(() => logErrorCliente('Tasa Cero', 'Landes', error));
    assert.strictEqual(resultado, false);
    assert.strictEqual(salida[0][1], error);
});

test('un code que no es de login también lleva pila', () => {
    const error = new Error('x');
    error.code = 'ENOENT';
    const { resultado } = capturar(() => logErrorCliente('Retenciones', 'X', error));
    assert.strictEqual(resultado, false);
});
