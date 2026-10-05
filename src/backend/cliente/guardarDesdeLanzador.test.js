// Tests de guardarDesdeLanzador (modo manual del lanzador). Correr: npm test

const test = require('node:test');
const assert = require('node:assert');
const { crearContribuyenteRepo } = require('./contribuyenteRepo.js');
const { estadoGuardado, guardarDesdeLanzador } = require('./guardarDesdeLanzador.js');

function storeMemoria(inicial) {
    let datos = inicial.map(x => ({ ...x }));
    return {
        cargar: () => datos.map(x => ({ ...x })),
        guardar: (arr) => { datos = arr.map(x => ({ ...x })); return true; },
        dump: () => datos
    };
}

function datosBase() {
    return [
        {
            id: 1, cuit: '27334617977', tipo: 'fisica', razonSocial: 'MORALES DEBORA',
            nombre: 'Debora', apellido: 'Morales',
            claveAFIP: 'vieja', estado_afip: 'invalido',
            claveATM: null, estado_atm: 'no_aplica',
            representanteAfipCuit: null
        },
        {
            id: 2, cuit: '30718609700', tipo: 'juridica', razonSocial: 'EL PAPI SAS',
            claveAFIP: null, estado_afip: 'no_aplica',
            claveATM: 'papiATM', estado_atm: 'validado',
            representanteAfipCuit: '27334617977'
        }
    ];
}

test('estadoGuardado: CUIT nuevo → no existe', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    assert.deepStrictEqual(await estadoGuardado(repo, '20111111112', 'afip'), { existe: false });
});

test('estadoGuardado: representado en AFIP lo marca, en ATM no', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    assert.strictEqual((await estadoGuardado(repo, '30718609700', 'afip')).esRepresentado, true);
    assert.strictEqual((await estadoGuardado(repo, '30718609700', 'atm')).esRepresentado, false);
});

test('CUIT nuevo: crea con razón social y la clave validada', async () => {
    const store = storeMemoria(datosBase());
    const repo = crearContribuyenteRepo(store);
    const r = await guardarDesdeLanzador(repo, { cuit: '20111111112', canal: 'atm', clave: 'k', nombre: 'PEREZ JUAN' });
    assert.strictEqual(r.accion, 'creado');
    const nuevo = store.dump().find(c => c.cuit === '20111111112');
    assert.strictEqual(nuevo.razonSocial, 'PEREZ JUAN');
    assert.strictEqual(nuevo.claveATM, 'k');
    assert.strictEqual(nuevo.estado_atm, 'validado');
    assert.strictEqual(nuevo.claveAFIP, null);
});

test('CUIT nuevo sin nombre → NOMBRE_VACIO', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    await assert.rejects(guardarDesdeLanzador(repo, { cuit: '20111111112', canal: 'afip', clave: 'k', nombre: ' ' }),
        { code: 'NOMBRE_VACIO' });
});

test('CUIT existente: actualiza la clave y queda validada (no pendiente)', async () => {
    const store = storeMemoria(datosBase());
    const repo = crearContribuyenteRepo(store);
    const r = await guardarDesdeLanzador(repo, { cuit: '27334617977', canal: 'afip', clave: 'nueva' });
    assert.strictEqual(r.accion, 'actualizado');
    const debora = store.dump()[0];
    assert.strictEqual(debora.claveAFIP, 'nueva');
    assert.strictEqual(debora.estado_afip, 'validado');
});

test('representado en AFIP: no guarda nada (ni en él ni en el representante)', async () => {
    const store = storeMemoria(datosBase());
    const repo = crearContribuyenteRepo(store);
    await assert.rejects(guardarDesdeLanzador(repo, { cuit: '30718609700', canal: 'afip', clave: 'x' }),
        { code: 'ES_REPRESENTADO' });
    const [debora, papi] = store.dump();
    assert.strictEqual(debora.claveAFIP, 'vieja');
    assert.strictEqual(papi.claveAFIP, null);
});
