// Tests del contribuyenteRepo (Tareas 3 y 5). Correr: npm test
// Prueban la lógica con un store EN MEMORIA (el binding al users.json es Tarea 6).

const test = require('node:test');
const assert = require('node:assert');
const { crearContribuyenteRepo, normalizarContribuyente } = require('./contribuyenteRepo.js');

// Store en memoria que imita el contrato cargar()/guardar(arr).
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
            claveAFIP: 'deboraAFIP', estado_afip: 'validado',
            claveATM: 'deboraATM', estado_atm: 'validado',
            representanteAfipCuit: null,
            puntosDeVenta: [{ numero: '00001' }]
        },
        {
            id: 2, cuit: '30718609700', tipo: 'juridica', razonSocial: 'EL PAPI SAS',
            claveAFIP: null, estado_afip: 'no_aplica',
            claveATM: 'papiATM', estado_atm: 'validado',
            representanteAfipCuit: '27334617977',
            puntosDeVenta: [{ numero: '00001' }]
        }
    ];
}

// ── normalizador ─────────────────────────────────────────────────────────────
test('normalizarContribuyente: cuit a string, descarta campos desconocidos, defaults', () => {
    const n = normalizarContribuyente({
        cuit: 30718609700, razonSocial: ' EL PAPI ', campoBasura: 'x', estado_afip: 'cualquiera'
    });
    assert.strictEqual(n.cuit, '30718609700');           // string
    assert.strictEqual(n.razonSocial, 'EL PAPI');        // trim
    assert.strictEqual('campoBasura' in n, false);       // lista blanca: se descarta
    assert.strictEqual(n.estado_afip, 'no_aplica');      // estado inválido → default
    assert.strictEqual(n.tipo, 'juridica');              // sin nombre/apellido → jurídica
});

test('normalizador es idempotente', () => {
    const a = normalizarContribuyente(datosBase()[1]);
    const b = normalizarContribuyente(a);
    assert.deepStrictEqual(a, b);
});

// ── listar ───────────────────────────────────────────────────────────────────
test('listar(atm): El Papi puede operar (clave propia validada)', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    const items = await repo.listar({ servicio: 'atm' });
    const papi = items.find(i => i.cuit === '30718609700');
    assert.strictEqual(papi.puedeOperar, true);
    assert.strictEqual(papi.esRepresentado, true);       // entra a AFIP por Debora
    assert.strictEqual(papi.nombreMostrado, 'EL PAPI SAS');
});

test('listar(facturacion): El Papi opera vía representante validado + tiene PDV', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    const items = await repo.listar({ servicio: 'facturacion' });
    assert.strictEqual(items.find(i => i.cuit === '30718609700').puedeOperar, true);
});

test('listar(facturacion): si el representante NO está validado, El Papi no puede', async () => {
    const datos = datosBase();
    datos[0].estado_afip = 'pendiente';                  // Debora sin validar
    const repo = crearContribuyenteRepo(storeMemoria(datos));
    const papi = (await repo.listar({ servicio: 'facturacion' })).find(i => i.cuit === '30718609700');
    assert.strictEqual(papi.puedeOperar, false);
    assert.match(papi.motivoNoOpera, /representante sin validar/);
});

test('listar(facturacion): sin PDV → no puede facturar', async () => {
    const datos = datosBase();
    datos[1].puntosDeVenta = [];
    const repo = crearContribuyenteRepo(storeMemoria(datos));
    const papi = (await repo.listar({ servicio: 'facturacion' })).find(i => i.cuit === '30718609700');
    assert.strictEqual(papi.puedeOperar, false);
    assert.match(papi.motivoNoOpera, /puntos de venta/);
});

test('listar NUNCA devuelve claves', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    const items = await repo.listar({ servicio: 'afip' });
    for (const it of items) {
        assert.strictEqual('claveAFIP' in it, false);
        assert.strictEqual('claveATM' in it, false);
    }
});

// ── resolverAcceso cableado ──────────────────────────────────────────────────
test('resolverAcceso del repo trae al representante real', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    const afip = await repo.resolverAcceso('30718609700', 'afip');
    assert.strictEqual(afip.loginCuit, '27334617977');
    assert.strictEqual(afip.loginClave, 'deboraAFIP');
    assert.strictEqual(afip.objetivoCuit, '30718609700');
    assert.strictEqual(afip.requiereElegirEmpresa, true);
});

// ── CRUD ─────────────────────────────────────────────────────────────────────
test('crear rechaza CUIT duplicado e inválido', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    await assert.rejects(() => repo.crear({ cuit: '27334617977', razonSocial: 'X' }), { code: 'CUIT_DUPLICADO' });
    await assert.rejects(() => repo.crear({ cuit: '123', razonSocial: 'X' }), { code: 'CUIT_INVALIDO' });
});

test('actualizar: cambiar claveAFIP resetea estado_afip a pendiente', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    const upd = await repo.actualizar('27334617977', { claveAFIP: 'nueva' });
    assert.strictEqual(upd.estado_afip, 'pendiente');
});

test('borrar bloquea si representa a otros y reporta dependientes', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    const r = await repo.borrar('27334617977');          // Debora representa a El Papi
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.dependientes, ['30718609700']);
});

test('borrar funciona si no representa a nadie', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    const r = await repo.borrar('30718609700');          // El Papi no representa a nadie
    assert.strictEqual(r.ok, true);
    assert.strictEqual(await repo.getByCuit('30718609700'), null);
});

// ── actualizar clave desde afuera de Clientes (lanzador) ─────────────────────
test('actualizarClave(afip) de un representado guarda en el REPRESENTANTE, no en él', async () => {
    const store = storeMemoria(datosBase());
    const repo = crearContribuyenteRepo(store);
    const info = await repo.actualizarClave('30718609700', 'afip', 'nuevaDebora');
    assert.strictEqual(info.esRepresentante, true);
    assert.strictEqual(info.titular.cuit, '27334617977');
    const [debora, papi] = store.dump();
    assert.strictEqual(debora.claveAFIP, 'nuevaDebora');
    assert.strictEqual(debora.estado_afip, 'pendiente');   // hasta que un login la confirme
    assert.strictEqual(papi.claveAFIP, null);              // invariante intacto
});

test('actualizarClave(atm) siempre es la propia', async () => {
    const store = storeMemoria(datosBase());
    const repo = crearContribuyenteRepo(store);
    const info = await repo.actualizarClave('30718609700', 'atm', 'nuevaPapi');
    assert.strictEqual(info.esRepresentante, false);
    assert.strictEqual(store.dump()[1].claveATM, 'nuevaPapi');
    assert.strictEqual(store.dump()[1].estado_atm, 'pendiente');
});

test('actualizarClave rechaza clave vacía', async () => {
    const repo = crearContribuyenteRepo(storeMemoria(datosBase()));
    await assert.rejects(repo.actualizarClave('27334617977', 'afip', '  '), { code: 'CLAVE_VACIA' });
});

test('listar(atm): clave sin validar → no opera pero tieneAcceso; invalida → motivo "incorrecta"', async () => {
    const datos = datosBase();
    datos[0].estado_atm = 'pendiente';
    datos[1].estado_atm = 'invalido';
    const items = await crearContribuyenteRepo(storeMemoria(datos)).listar({ servicio: 'atm' });
    const [debora, papi] = items;
    assert.strictEqual(debora.puedeOperar, false);
    assert.strictEqual(debora.tieneAcceso, true);
    assert.match(papi.motivoNoOpera, /incorrecta/);
});

test('registrarVerificacion marca el estado del titular', async () => {
    const datos = datosBase();
    datos[0].estado_afip = 'pendiente';
    const store = storeMemoria(datos);
    const repo = crearContribuyenteRepo(store);
    await repo.registrarVerificacion('27334617977', 'afip', 'validado');
    assert.strictEqual(store.dump()[0].estado_afip, 'validado');
    assert.strictEqual(store.dump()[0].claveAFIP, 'deboraAFIP');  // no toca la clave
});

test('listar(facturacion): clave sin validar + sin PDV → no se deja elegir (tieneAcceso false)', async () => {
    const datos = datosBase();
    datos[0].estado_afip = 'pendiente';
    datos[1].puntosDeVenta = [];
    const papi = (await crearContribuyenteRepo(storeMemoria(datos)).listar({ servicio: 'facturacion' }))
        .find(i => i.cuit === '30718609700');
    assert.strictEqual(papi.tieneAcceso, false);
    assert.strictEqual(papi.problemaClave, true);
});

test('listar(facturacion): clave OK pero sin PDV → no es problema de clave', async () => {
    const datos = datosBase();
    datos[1].puntosDeVenta = [];
    const papi = (await crearContribuyenteRepo(storeMemoria(datos)).listar({ servicio: 'facturacion' }))
        .find(i => i.cuit === '30718609700');
    assert.strictEqual(papi.problemaClave, false);
});
