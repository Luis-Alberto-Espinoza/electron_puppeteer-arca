const { test } = require('node:test');
const assert = require('node:assert');
const { resumirConsultas } = require('./resumenConsultas.js');

const RANGO = '2026-08 a 2026-09 (2 periodos)';
const conDatos = (tipo, periodo) => ({ tipo, periodo, registros: 5, archivosDescargados: 2, success: true });
const vacia = (tipo, periodo) => ({ tipo, periodo, registros: 0, archivosDescargados: 0, success: true });
const fallida = (tipo, periodo) => ({ tipo, periodo, registros: 0, archivosDescargados: 0, success: false, error: true });

test('todo bien: no es incompleta', () => {
    const r = resumirConsultas([conDatos('SIRTAC', '2026-08'), vacia('SIRCAR', '2026-08')], 2, RANGO);
    assert.strictEqual(r.descargaIncompleta, false);
    assert.match(r.mensaje, /2 archivo\(s\) descargado\(s\)/);
});

test('caso BUIGUES cortado: bajaron archivos pero fallaron consultas → incompleta y dice cuáles', () => {
    const r = resumirConsultas([
        conDatos('Percepciones SIRCAR', '2026-09'),
        fallida('SIRCREB', '2026-08'),
        fallida('SIRCREB', '2026-09')
    ], 2, RANGO);
    assert.strictEqual(r.descargaIncompleta, true);
    assert.deepStrictEqual(r.consultasFallidas, ['SIRCREB 2026-08', 'SIRCREB 2026-09']);
    assert.match(r.mensaje, /INCOMPLETA/);
    assert.match(r.mensaje, /2 consulta\(s\) fallaron: SIRCREB 2026-08; SIRCREB 2026-09/);
});

test('caso Danus cortado: todo falló y no bajó nada → incompleta, NO "sin registros"', () => {
    const r = resumirConsultas([fallida('SIRTAC', '2026-08'), fallida('SIRCAR', '2026-08')], 0, RANGO);
    assert.strictEqual(r.descargaIncompleta, true);
    assert.doesNotMatch(r.mensaje, /Sin registros/);
});

test('de verdad no había nada → no es incompleta y dice "Sin registros"', () => {
    const r = resumirConsultas([vacia('SIRTAC', '2026-08'), vacia('SIRCAR', '2026-09')], 0, RANGO);
    assert.strictEqual(r.descargaIncompleta, false);
    assert.match(r.mensaje, /^Sin registros/);
});

test('archivos faltantes (registros sin sus 2 archivos) sigue marcando incompleta', () => {
    const r = resumirConsultas([{ ...conDatos('SIRTAC', '2026-08'), archivosDescargados: 1 }], 1, RANGO);
    assert.strictEqual(r.descargaIncompleta, true);
    assert.strictEqual(r.archivosFaltantes, 1);
    assert.match(r.mensaje, /Faltan 1 de 2 archivo\(s\): SIRTAC 2026-08 \(1 de 2\)/);
});
