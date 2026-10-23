const { test } = require('node:test');
const assert = require('node:assert');
const { impuestoParaArchivo, IMPUESTOS_POR_DEFECTO } = require('./flujo_planDepagoIngresosBruto.js');

test('nombre del impuesto para el archivo: sin tildes, comas ni puntos', () => {
    assert.strictEqual(impuestoParaArchivo('Ingresos Brutos'), 'IngresosBrutos');
    assert.strictEqual(impuestoParaArchivo('Agentes de Retención y Percepción IIBB'), 'AgentesDeRetencionYPercepcionIIBB');
    assert.strictEqual(impuestoParaArchivo('Multas, Int. y Recargos no Tributarios'), 'MultasIntYRecargosNoTributarios');
});

test('por defecto se consulta Ingresos Brutos (lo de siempre)', () => {
    assert.deepStrictEqual(IMPUESTOS_POR_DEFECTO, ['Ingresos Brutos']);
});
