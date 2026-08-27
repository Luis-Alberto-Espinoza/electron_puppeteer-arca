// Tests de la sincronización de razón social del barrido de empresas.
// Correr: node --test src/backend/afip/empresa/sincronizarRazonSocial.test.js
//
// Por qué importa: la razón social es la clave de matcheo contra la pantalla de
// "elegir empresa" de AFIP. Si queda el apodo que cargó el humano, la facturación
// muere con "Empresa X no encontrada en la lista" (caso real: BLANCO GUADALUPE AILEN).

const test = require('node:test');
const assert = require('node:assert');
const { sincronizarRazonSocial } = require('./empresaManager.js');

test('pisa el apodo cargado a mano con la razón social de AFIP', () => {
    const fila = { cuit: '27473737944', razonSocial: 'Mastantuono Guadalupe' };
    assert.deepStrictEqual(
        sincronizarRazonSocial(fila, 'BLANCO GUADALUPE AILEN'),
        { razonSocial: 'BLANCO GUADALUPE AILEN' }
    );
});

test('no toca la fila si solo difieren mayúsculas o tildes (el matcher ya las perdona)', () => {
    const fila = { cuit: '27334617977', razonSocial: 'Morales Débora' };
    assert.deepStrictEqual(sincronizarRazonSocial(fila, 'MORALES DEBORA'), {});
});

test('no toca la fila si la razón social ya es idéntica', () => {
    const fila = { cuit: '30718609700', razonSocial: 'EL PAPI SAS' };
    assert.deepStrictEqual(sincronizarRazonSocial(fila, 'EL PAPI SAS'), {});
});

test('nunca pisa con vacío si AFIP no trajo nombre', () => {
    const fila = { cuit: '30718609700', razonSocial: 'EL PAPI SAS' };
    assert.deepStrictEqual(sincronizarRazonSocial(fila, ''), {});
    assert.deepStrictEqual(sincronizarRazonSocial(fila, null), {});
    assert.deepStrictEqual(sincronizarRazonSocial(fila, '   '), {});
});

test('completa la razón social cuando la fila la tiene vacía', () => {
    const fila = { cuit: '30718609700', razonSocial: '' };
    assert.deepStrictEqual(
        sincronizarRazonSocial(fila, 'VIBRANIUM S. A. S.'),
        { razonSocial: 'VIBRANIUM S. A. S.' }
    );
});

test('recorta espacios sobrantes de lo que trae AFIP', () => {
    const fila = { cuit: '30718609700', razonSocial: 'VIEJO SA' };
    assert.deepStrictEqual(
        sincronizarRazonSocial(fila, '  VASA S.A.  '),
        { razonSocial: 'VASA S.A.' }
    );
});

test('apellido/nombre invertido se realinea con el texto exacto de AFIP', () => {
    // El matcher lo salvaría por el fallback 3 (mismo conjunto de palabras), pero
    // guardar el texto exacto evita depender del último recurso.
    const fila = { cuit: '20243819572', razonSocial: 'Marcelo Mastrantonio' };
    assert.deepStrictEqual(
        sincronizarRazonSocial(fila, 'MASTRANTONIO RUBEN MARCELO'),
        { razonSocial: 'MASTRANTONIO RUBEN MARCELO' }
    );
});
