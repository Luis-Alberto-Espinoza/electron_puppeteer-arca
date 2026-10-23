const { test } = require('node:test');
const assert = require('node:assert');
const { nombreArchivo, periodoAAAAMM } = require('./nombreArchivo.js');

test('regla: CUIT_Servicio_detalle_período.ext', () => {
    assert.strictEqual(
        nombreArchivo({ servicio: 'TasaCero', cuit: '30-70889018-5', detalle: ['Aprobada'], fecha: '2025-11', extension: 'pdf' }),
        '30708890185_TasaCero_Aprobada_2025-11.pdf');
});

test('detalle sin espacios ni tildes; fecha por defecto = hoy con año', () => {
    const nombre = nombreArchivo({ servicio: 'Plan Pago', cuit: 30711545499, detalle: ['Agentes de Retención y Percepción IIBB'] });
    assert.match(nombre, /^30711545499_PlanPago_AgentesDeRetencionYPercepcionIIBB_\d{4}-\d{2}-\d{2}$/);
});

test('período siempre con año: "11/2025" y "2025-11" → "2025-11"', () => {
    assert.strictEqual(periodoAAAAMM('11/2025'), '2025-11');
    assert.strictEqual(periodoAAAAMM('2025-1'), '2025-01');
    assert.strictEqual(periodoAAAAMM('nov'), null);
});
