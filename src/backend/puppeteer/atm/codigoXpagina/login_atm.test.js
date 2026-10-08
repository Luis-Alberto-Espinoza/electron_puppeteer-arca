const { test } = require('node:test');
const assert = require('node:assert');
const { clasificarDialogoLogin } = require('./login_atm.js');

test('el cartel de clave mala es INVALID_CREDENTIALS', () => {
    const r = clasificarDialogoLogin('El CUIT o clave son incorrectos');
    assert.strictEqual(r.error, 'INVALID_CREDENTIALS');
    assert.strictEqual(r.success, false);
});

test('tolera mayúsculas y espacios de más', () => {
    assert.strictEqual(clasificarDialogoLogin('EL CUIT  O CLAVE SON INCORRECTOS.').error, 'INVALID_CREDENTIALS');
});

test('cualquier otro cartel NO marca la clave como inválida', () => {
    for (const msg of ['Sistema en mantenimiento, intente más tarde', 'Error de conexión', '', undefined]) {
        assert.strictEqual(clasificarDialogoLogin(msg).error, 'ATM_AVISO', String(msg));
    }
});

test('conserva el texto del cartel para mostrarlo', () => {
    assert.strictEqual(clasificarDialogoLogin('Mantenimiento').message, 'Mantenimiento');
});

test('saca el salto de línea que trae el alert de ATM', () => {
    assert.strictEqual(clasificarDialogoLogin('El CUIT o clave son incorrectos\n').message, 'El CUIT o clave son incorrectos');
});
