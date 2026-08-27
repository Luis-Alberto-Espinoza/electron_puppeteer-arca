// Tests del relleno de `id` faltante en contribuyenteRepo.
// Correr: node --test src/backend/cliente/contribuyenteIdFaltante.test.js
//
// Por qué importa: el frontend edita/borra por id (user:update → repo.getById). Las
// filas de representadas creadas por versiones viejas del barrido quedaron sin id y
// el CRUD las rechazaba con "Usuario no encontrado" (caso real: VASA S.A.).

const test = require('node:test');
const assert = require('node:assert');
const { crearContribuyenteRepo } = require('./contribuyenteRepo.js');

// Store en memoria con la misma interfaz que espera el repo.
function storeFalso(filas) {
    let datos = JSON.parse(JSON.stringify(filas));
    return {
        cargar: () => JSON.parse(JSON.stringify(datos)),
        guardar: (l) => { datos = JSON.parse(JSON.stringify(l)); },
        leer: () => datos
    };
}

const sinId = {
    cuit: '30714109282', tipo: 'juridica', razonSocial: 'VASA S.A.',
    representanteAfipCuit: '20263147074', puntosDeVenta: []
};
const conId = {
    id: 1786389333990.7742, cuit: '30714899461', tipo: 'juridica',
    razonSocial: 'AGROGLOBAL MENDOZA SA', representanteAfipCuit: '20263147074',
    grupoId: 'g_mrxmz1x2qurs', claveATM: 'estudio210', puntosDeVenta: []
};

test('una fila sin id se vuelve editable: getById la encuentra por CUIT', async () => {
    const repo = crearContribuyenteRepo(storeFalso([sinId]));
    const c = await repo.getById('30714109282');
    assert.ok(c, 'getById debería encontrarla');
    assert.strictEqual(c.razonSocial, 'VASA S.A.');
});

test('el id rellenado es DETERMINISTA entre lecturas (si no, el handle vence)', async () => {
    const repo = crearContribuyenteRepo(storeFalso([sinId]));
    const a = await repo.getByCuit('30714109282');
    const b = await repo.getByCuit('30714109282');
    assert.strictEqual(a.id, b.id);
    assert.strictEqual(a.id, '30714109282');
});

test('no pisa el id de las filas que ya lo tienen', async () => {
    const repo = crearContribuyenteRepo(storeFalso([conId]));
    const c = await repo.getByCuit('30714899461');
    assert.strictEqual(c.id, 1786389333990.7742);
});

test('editar por id conserva grupoId y claveATM (lo que el borrar+re-barrer perdía)', async () => {
    const store = storeFalso([sinId, conId]);
    const repo = crearContribuyenteRepo(store);

    const objetivo = await repo.getById('30714109282');
    await repo.actualizar(objetivo.cuit, { razonSocial: 'VASA SOCIEDAD ANONIMA' });

    const vasa = await repo.getByCuit('30714109282');
    assert.strictEqual(vasa.razonSocial, 'VASA SOCIEDAD ANONIMA');
    const agro = await repo.getByCuit('30714899461');
    assert.strictEqual(agro.grupoId, 'g_mrxmz1x2qurs');
    assert.strictEqual(agro.claveATM, 'estudio210');
});

test('getById sigue sin matchear con id nulo o "undefined" (footgun original)', async () => {
    const repo = crearContribuyenteRepo(storeFalso([sinId, conId]));
    assert.strictEqual(await repo.getById(undefined), null);
    assert.strictEqual(await repo.getById(null), null);
    assert.strictEqual(await repo.getById('undefined'), null);
});

test('un alta nueva sin id queda direccionable de una', async () => {
    const repo = crearContribuyenteRepo(storeFalso([]));
    await repo.crear({ cuit: '30709968692', tipo: 'juridica', razonSocial: 'MST SA' });
    const c = await repo.getById('30709968692');
    assert.ok(c, 'el alta debería ser editable sin re-barrer');
    assert.strictEqual(c.razonSocial, 'MST SA');
});
