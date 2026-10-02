// Tests del matcheo de empresas contra la lista de AFIP. Correr: npm test
const test = require('node:test');
const assert = require('node:assert');
const { buscarIndiceEmpresa } = require('./empresasDisponibles.js');

const LISTA = ['EL PAPI TU TIENDA EXPRESS S. A. S.', 'MORALES DEBORA DEL CARMEN', 'SOL DE ABRIL FIDEICOMISO'];

test('S.a.s. cargado a mano matchea con "S. A. S." de AFIP (caso real)', () => {
    const r = buscarIndiceEmpresa(LISTA, 'El Papi Tu Tienda Express S.a.s.');
    assert.strictEqual(r.indice, 0);
    assert.match(r.criterio, /letras y numeros/);
});

test('los criterios anteriores siguen andando y van primero', () => {
    assert.deepStrictEqual(buscarIndiceEmpresa(LISTA, 'SOL DE ABRIL FIDEICOMISO'), { indice: 2, criterio: 'exacto' });
    assert.strictEqual(buscarIndiceEmpresa(LISTA, 'sol de abril fideicomiso').criterio, 'sin tildes/mayusculas');
    assert.strictEqual(buscarIndiceEmpresa(LISTA, 'Debora del Carmen Morales').indice, 1);
});

test('sin match → -1', () => {
    assert.strictEqual(buscarIndiceEmpresa(LISTA, 'OTRA EMPRESA SRL').indice, -1);
});

test('si el fallback laxo es ambiguo, no elige ninguna', () => {
    const lista = ['ACME S. A.', 'ACME SA'];
    // "Acme S.a" no es exacto ni por tildes/palabras con ninguna, y por letras matchea las dos.
    assert.strictEqual(buscarIndiceEmpresa(lista, 'Acme S.a').indice, -1);
});
