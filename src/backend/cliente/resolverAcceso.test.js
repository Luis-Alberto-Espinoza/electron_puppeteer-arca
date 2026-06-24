// Tests del resolver (Tarea 4). Correr: node --test src/backend/cliente/resolverAcceso.test.js
// Cubre los casos El Papi / Debora del contrato (contrato_contribuyente_repo.md §2).

const test = require('node:test');
const assert = require('node:assert');
const { resolverAcceso, resolverAccesoCore, nombreDe } = require('./resolverAcceso.js');

// ── Datos de prueba (modelo plano) ─────────────────────────────────────────
const debora = {
    cuit: '27334617977', tipo: 'fisica', razonSocial: 'MORALES DEBORA',
    nombre: 'Debora', apellido: 'Morales',
    claveAFIP: 'deboraAFIP', claveATM: 'deboraATM',
    representanteAfipCuit: null
};
const elPapi = {
    cuit: '30718609700', tipo: 'juridica', razonSocial: 'EL PAPI SAS',
    nombre: null, apellido: null,
    claveAFIP: null, claveATM: 'papiATM',
    representanteAfipCuit: '27334617977'
};

// Buscador fake que el repo inyectará de verdad en Tarea 3.
const universo = new Map([[debora.cuit, debora], [elPapi.cuit, elPapi]]);
const buscarPorCuit = (cuit) => universo.get(String(cuit)) || null;

// ── nombreDe ───────────────────────────────────────────────────────────────
test('nombreDe prefiere razón social (nombre canónico de AFIP)', () => {
    assert.strictEqual(nombreDe(debora), 'MORALES DEBORA');   // razón social, no "Debora Morales"
    assert.strictEqual(nombreDe(elPapi), 'EL PAPI SAS');
    assert.strictEqual(nombreDe({ nombre: 'Juan', apellido: 'Perez' }), 'Juan Perez'); // sin razón social → nombre+apellido
    assert.strictEqual(nombreDe({ cuit: '20111' }), '20111'); // fallback al cuit
});

// ── Núcleo puro ──────────────────────────────────────────────────────────────
test('AFIP de El Papi → entra por Debora, objetivo El Papi, elige empresa', () => {
    const r = resolverAccesoCore(elPapi, 'afip', debora);
    assert.deepStrictEqual(r, {
        loginCuit: '27334617977', loginClave: 'deboraAFIP',
        objetivoCuit: '30718609700', objetivoNombre: 'EL PAPI SAS',
        requiereElegirEmpresa: true
    });
});

test('ATM de El Papi → entra directo, sin elegir empresa', () => {
    const r = resolverAccesoCore(elPapi, 'atm');
    assert.deepStrictEqual(r, {
        loginCuit: '30718609700', loginClave: 'papiATM',
        objetivoCuit: '30718609700', objetivoNombre: 'EL PAPI SAS',
        requiereElegirEmpresa: false
    });
});

test('AFIP de Debora (opera por sí misma) → login == objetivo', () => {
    const r = resolverAccesoCore(debora, 'afip');
    assert.strictEqual(r.loginCuit, '27334617977');
    assert.strictEqual(r.objetivoCuit, '27334617977');
    assert.strictEqual(r.requiereElegirEmpresa, false);
});

test('El cruce: AFIP y ATM de El Papi tienen el MISMO objetivoCuit (misma carpeta)', () => {
    const afip = resolverAccesoCore(elPapi, 'afip', debora);
    const atm = resolverAccesoCore(elPapi, 'atm');
    assert.strictEqual(afip.objetivoCuit, atm.objetivoCuit);
});

// ── Bordes → null ────────────────────────────────────────────────────────────
test('AFIP sin representante encontrado (FK huérfana) → null', () => {
    assert.strictEqual(resolverAccesoCore(elPapi, 'afip', null), null);
});

test('AFIP sin clave propia ni representante → null', () => {
    const huerfano = { ...elPapi, representanteAfipCuit: null };
    assert.strictEqual(resolverAccesoCore(huerfano, 'afip'), null);
});

test('AFIP con representante sin clave AFIP → null', () => {
    const repSinClave = { ...debora, claveAFIP: null };
    assert.strictEqual(resolverAccesoCore(elPapi, 'afip', repSinClave), null);
});

test('ATM sin clave propia → null (ATM no tiene representación)', () => {
    const sinAtm = { ...elPapi, claveATM: null };
    assert.strictEqual(resolverAccesoCore(sinAtm, 'atm'), null);
});

test('objetivo null o canal desconocido → null', () => {
    assert.strictEqual(resolverAccesoCore(null, 'afip'), null);
    assert.strictEqual(resolverAccesoCore(elPapi, 'otro'), null);
});

// ── Orquestador async (con el buscador inyectado) ────────────────────────────
test('resolverAcceso async trae el representante solo cuando hace falta', async () => {
    const afip = await resolverAcceso('30718609700', 'afip', { buscarPorCuit });
    assert.strictEqual(afip.loginCuit, '27334617977'); // fue a buscar a Debora
    assert.strictEqual(afip.requiereElegirEmpresa, true);

    const atm = await resolverAcceso('30718609700', 'atm', { buscarPorCuit });
    assert.strictEqual(atm.loginCuit, '30718609700'); // no necesitó representante
});

test('resolverAcceso async con cuit inexistente → null', async () => {
    assert.strictEqual(await resolverAcceso('99999999999', 'afip', { buscarPorCuit }), null);
});
