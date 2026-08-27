// Tests del gruposManager (registro de estudios/grupos). Correr: npm test
// El manager depende de gruposStore.js (que usa electron.app). Lo reemplazamos por
// un store EN MEMORIA vía require.cache antes de cargar el manager.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// Inyecta un gruposStore en memoria en la caché de require ANTES de cargar el manager.
const storePath = require.resolve('./gruposStore.js');
let memoria = [];
require.cache[storePath] = {
    id: storePath, filename: storePath, loaded: true,
    exports: {
        gruposStore: {
            cargar: () => memoria.map(x => ({ ...x })),
            guardar: (l) => { memoria = l.map(x => ({ ...x })); return true; }
        }
    }
};
const { gruposManager } = require('./gruposManager.js');

test.beforeEach(() => { memoria = []; });

test('crear: colapsa espacios, asigna id con prefijo y color', () => {
    const g = gruposManager.crear({ nombre: '  Estudio   Pérez ' });
    assert.strictEqual(g.nombre, 'Estudio Pérez');
    assert.ok(g.id.startsWith('g_'));
    assert.ok(g.color);
    assert.strictEqual(gruposManager.listar().length, 1);
});

test('crear: rechaza nombre vacío', () => {
    assert.throws(() => gruposManager.crear({ nombre: '   ' }), /nombre/i);
});

test('crear: rechaza duplicado ignorando mayúsculas y acentos', () => {
    gruposManager.crear({ nombre: 'Estudio Pérez' });
    assert.throws(() => gruposManager.crear({ nombre: 'estudio perez' }), /Ya existe/);
});

test('renombrar: cambia el nombre y sigue siendo único', () => {
    const g = gruposManager.crear({ nombre: 'Míos' });
    gruposManager.crear({ nombre: 'Estudio A' });
    gruposManager.renombrar({ id: g.id, nombre: 'Personales' });
    assert.strictEqual(gruposManager.listar().find(x => x.id === g.id).nombre, 'Personales');
    assert.throws(() => gruposManager.renombrar({ id: g.id, nombre: 'Estudio A' }), /Ya existe/);
});

test('eliminar: saca del registro y devuelve el grupo; inexistente → null', () => {
    const g = gruposManager.crear({ nombre: 'Temporal' });
    const del = gruposManager.eliminar(g.id);
    assert.strictEqual(del.id, g.id);
    assert.strictEqual(gruposManager.listar().length, 0);
    assert.strictEqual(gruposManager.eliminar('g_noexiste'), null);
});
