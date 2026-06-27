// Tests del puente de proyección (C0 del plan write-side). Correr: node --test
// Verifica que el plano se proyecte a un users.json que los 4 flujos no migrados
// consumen igual, y que sobreviva normalizarCliente (lo que corre loadData).

const test = require('node:test');
const assert = require('node:assert');
const { proyectarUsersJson } = require('./proyeccionUsersJson.js');
const { normalizarCliente } = require('./model.js');

// ── Fixtures (modelo plano) ────────────────────────────────────────────────
const debora = {
    id: 1, cuit: '27334617977', tipo: 'fisica', razonSocial: 'MORALES DEBORA',
    nombre: 'Debora', apellido: 'Morales', tipoContribuyente: 'A',
    claveAFIP: 'deboraAFIP', estado_afip: 'validado',
    claveATM: 'deboraATM', estado_atm: 'validado',
    representanteAfipCuit: null, puntosDeVenta: [], puntosDeVentaActualizados: null
};
const elPapi = {
    id: 2, cuit: '30718609700', tipo: 'juridica', razonSocial: 'EL PAPI SAS',
    nombre: null, apellido: null, tipoContribuyente: 'B',
    claveAFIP: null, estado_afip: 'no_aplica',
    claveATM: 'papiATM', estado_atm: 'validado',
    representanteAfipCuit: '27334617977',
    puntosDeVenta: [{ numero: '00002', descripcion: 'Local' }],
    puntosDeVentaActualizados: '2026-06-22T00:00:00Z'
};

test('cada contribuyente es un user findable por id, con claves', () => {
    const { users } = proyectarUsersJson([debora, elPapi]);
    assert.equal(users.length, 2);

    const d = users.find(u => String(u.id) === '1');
    const p = users.find(u => String(u.id) === '2');
    assert.ok(d && p, 'ambos findable por id');

    // Planes lee claveAFIP del representante:
    assert.equal(d.claveAFIP, 'deboraAFIP');
    // El Papi representado: sin clave AFIP propia, con su ATM:
    assert.equal(p.claveAFIP, null);
    assert.equal(p.claveATM, 'papiATM');
    // SCT enriquece por id (nombre/cuit): jurídica usa razón social como nombre:
    assert.equal(p.cuit, '30718609700');
    assert.equal(p.nombre, 'EL PAPI SAS');
});

test('el representante lleva a sus representados en empresas[]', () => {
    const { users } = proyectarUsersJson([debora, elPapi]);
    const d = users.find(u => String(u.id) === '1');
    assert.equal(d.empresas.length, 1);
    assert.equal(d.empresas[0].cuit, '30718609700');
    assert.equal(d.empresas[0].razonSocial, 'EL PAPI SAS');
    assert.equal(d.empresas[0].claveATM, 'papiATM');

    const p = users.find(u => String(u.id) === '2');
    assert.equal(p.empresas.length, 0, 'el representado no lleva representados');
});

test('la proyección sobrevive normalizarCliente (loadData) sin perder lo clave', () => {
    const { users } = proyectarUsersJson([debora, elPapi]);
    users.forEach(normalizarCliente);   // lo que corre storage.loadData() al leer

    const d = users.find(u => String(u.id) === '1');
    const p = users.find(u => String(u.id) === '2');

    assert.equal(d.claveAFIP, 'deboraAFIP', 'claveAFIP root sobrevive');
    assert.equal(d.empresas[0].cuit, '30718609700', 'empresa sobrevive crearEmpresa');
    assert.equal(d.empresas[0].puntosDeVenta.length, 1, 'PDV de la empresa sobrevive');
    assert.equal(p.cuit, '30718609700');
});

test('idempotente y robusto con entrada vacía', () => {
    assert.deepEqual(proyectarUsersJson([]), { users: [] });
    assert.deepEqual(proyectarUsersJson(null), { users: [] });
    const a = proyectarUsersJson([debora, elPapi]);
    const b = proyectarUsersJson([debora, elPapi]);
    assert.deepEqual(a, b);
});
