const { test } = require('node:test');
const assert = require('node:assert');
const util = require('util');
const { taparClaves } = require('./registroConsola.js');

const TAPADO = "'***'";

test('objetos impresos por util.format: se tapan', () => {
    const t1 = taparClaves(util.format('datos', { usuario: '20123456789', clave: 'abc123' }));
    assert.ok(!t1.includes('abc123'), t1);
    assert.ok(t1.includes(`clave: ${TAPADO}`), t1);
    assert.ok(t1.includes("'20123456789'"), t1); // lo demás queda

    const t2 = taparClaves(util.format({ claveAFIP: 'x"y', claveATM: 'zz9' }));
    assert.ok(!t2.includes('x"y') && !t2.includes('zz9'), t2);
});

test('JSON: se tapa', () => {
    const t = taparClaves(JSON.stringify({ password: 'secreto', claveFiscal: 'otra1' }));
    assert.strictEqual(t, `{"password":${TAPADO},"claveFiscal":${TAPADO}}`);
});

test('texto armado a mano con = o ":": se tapa', () => {
    assert.strictEqual(taparClaves('login clave=abc123 ok'), `login clave=${TAPADO} ok`);
    assert.strictEqual(taparClaves('contraseña: abc123'), `contraseña: ${TAPADO}`);
    assert.strictEqual(taparClaves('contrasena=perrito'), `contrasena=${TAPADO}`);
});

test('null/undefined/true/false: no se tapan', () => {
    for (const v of ['null', 'undefined', 'true', 'false']) {
        assert.strictEqual(taparClaves(`claveAFIP: ${v}`), `claveAFIP: ${v}`);
    }
});

test('prosa sin "<campo>:" y campos parecidos: no se tapan', () => {
    const mensajes = [
        '⚠️ [loginATM] Campo Contraseña, agotados los reintentos de tipeo, asignando por JS',
        '❌ [loginATM] Campo Contraseña, no se pudo completar ni por JS (quedó (8 caracteres))',
        'Clave ATM incorrecta: El CUIT o clave son incorrectos',
        'claveroja: azul',
    ];
    for (const m of mensajes) assert.strictEqual(taparClaves(m), m);
});

test('a propósito: "Contraseña: <prosa>" SÍ se tapa (tapar de más antes que filtrar una clave)', () => {
    // Una clave de solo letras no se distingue de una palabra común. Si este test molesta,
    // cambiá el texto del mensaje, no el filtro.
    assert.strictEqual(
        taparClaves('Contraseña: agotados los reintentos'),
        `Contraseña: ${TAPADO} los reintentos`
    );
});
