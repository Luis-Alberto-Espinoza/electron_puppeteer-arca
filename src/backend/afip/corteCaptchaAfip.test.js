// Tests del corte por captcha de los lotes AFIP. Correr: npm test
const test = require('node:test');
const assert = require('node:assert');
const { crearCorteCaptchaAfip } = require('./corteCaptchaAfip.js');

test('arranca inactivo y otros errores no lo activan', () => {
    const corte = crearCorteCaptchaAfip();
    corte.registrar({ success: false, error: 'INVALID_CREDENTIALS' });
    corte.registrar({ success: false, error: 'TIMEOUT' });
    corte.registrar(null);
    assert.strictEqual(corte.activo, false);
});

test('el primer CAPTCHA_BLOQUEO lo activa y queda activo', () => {
    const corte = crearCorteCaptchaAfip();
    corte.registrar({ success: false, error: 'CAPTCHA_BLOQUEO' });
    corte.registrar({ success: true });
    assert.strictEqual(corte.activo, true);
    assert.match(corte.mensaje, /captcha/i);
});

test('cada lote tiene su propio corte', () => {
    const a = crearCorteCaptchaAfip();
    a.registrar({ error: 'CAPTCHA_BLOQUEO' });
    assert.strictEqual(crearCorteCaptchaAfip().activo, false);
});
