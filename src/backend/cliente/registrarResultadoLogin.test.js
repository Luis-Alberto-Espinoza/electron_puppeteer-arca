// Tests del registrador de resultados de login. Correr: npm test
const test = require('node:test');
const assert = require('node:assert');
const { crearContribuyenteRepo } = require('./contribuyenteRepo.js');
const { crearRegistradorLogin } = require('./registrarResultadoLogin.js');
const observadorLogin = require('../puppeteer/archivos_comunes/login/observadorLogin.js');

function storeMemoria(inicial) {
    let datos = inicial.map(x => ({ ...x }));
    return {
        cargar: () => datos.map(x => ({ ...x })),
        guardar: (arr) => { datos = arr.map(x => ({ ...x })); return true; },
        dump: () => datos
    };
}

function base() {
    return [{
        id: 1, cuit: '27334617977', tipo: 'fisica', razonSocial: 'MORALES DEBORA',
        claveAFIP: 'buena', estado_afip: 'pendiente',
        claveATM: 'atmKey', estado_atm: 'validado'
    }];
}

test('éxito con la clave guardada → validado', async () => {
    const store = storeMemoria(base());
    const registrar = crearRegistradorLogin(crearContribuyenteRepo(store));
    await registrar({ canal: 'afip', cuit: '27334617977', clave: 'buena', resultado: { success: true } });
    assert.strictEqual(store.dump()[0].estado_afip, 'validado');
});

test('clave incorrecta con la clave guardada → invalido con el mensaje', async () => {
    const store = storeMemoria(base());
    const registrar = crearRegistradorLogin(crearContribuyenteRepo(store));
    await registrar({ canal: 'atm', cuit: '27334617977', clave: 'atmKey',
        resultado: { success: false, error: 'INVALID_CREDENTIALS', message: 'Clave incorrecta' } });
    assert.strictEqual(store.dump()[0].estado_atm, 'invalido');
    assert.strictEqual(store.dump()[0].errorAtm, 'Clave incorrecta');
});

test('captcha o timeout NO tocan el estado', async () => {
    const store = storeMemoria(base());
    const registrar = crearRegistradorLogin(crearContribuyenteRepo(store));
    for (const error of ['CAPTCHA_BLOQUEO', 'TIMEOUT', 'UNEXPECTED_ERROR']) {
        await registrar({ canal: 'afip', cuit: '27334617977', clave: 'buena', resultado: { success: false, error } });
    }
    assert.strictEqual(store.dump()[0].estado_afip, 'pendiente');
});

test('otra clave (ej. lanzador manual) NO toca el estado de la guardada', async () => {
    const store = storeMemoria(base());
    const registrar = crearRegistradorLogin(crearContribuyenteRepo(store));
    await registrar({ canal: 'afip', cuit: '27334617977', clave: 'otra',
        resultado: { success: false, error: 'INVALID_CREDENTIALS' } });
    assert.strictEqual(store.dump()[0].estado_afip, 'pendiente');
});

test('CUIT que no es cliente guardado → no hace nada (ni explota)', async () => {
    const store = storeMemoria(base());
    const registrar = crearRegistradorLogin(crearContribuyenteRepo(store));
    await registrar({ canal: 'afip', cuit: '20111111112', clave: 'x', resultado: { success: true } });
    assert.strictEqual(store.dump().length, 1);
});

test('observadorLogin: un oyente que falla no corta a los demás', async () => {
    const vistos = [];
    const des1 = observadorLogin.suscribir(() => { throw new Error('boom'); });
    const des2 = observadorLogin.suscribir((e) => { vistos.push(e.canal); });
    await observadorLogin.notificar({ canal: 'afip' });
    des1(); des2();
    assert.deepStrictEqual(vistos, ['afip']);
});
