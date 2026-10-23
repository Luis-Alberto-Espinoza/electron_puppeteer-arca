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

test('espera el PDF por señal: vuelve cuando llega terminado, no antes', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { esperarPdfEnCarpeta } = require('./flujo_planDepagoIngresosBruto.js');
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'planpago-'));
    setTimeout(() => fs.writeFileSync(path.join(carpeta, 'plan.pdf.crdownload'), 'x'), 100);
    setTimeout(() => fs.renameSync(path.join(carpeta, 'plan.pdf.crdownload'), path.join(carpeta, 'plan.pdf')), 600);
    const inicio = Date.now();
    assert.strictEqual(await esperarPdfEnCarpeta(carpeta, { tope: 3000, intervalo: 50 }), true);
    assert.ok(Date.now() - inicio >= 550, 'no puede dar por bueno el .crdownload');
    assert.strictEqual(await esperarPdfEnCarpeta(fs.mkdtempSync(path.join(os.tmpdir(), 'vacia-')), { tope: 300, intervalo: 50 }), false);
});

test('aviso de ATM corto para la tarjeta (sin título, primera oración)', () => {
    const { resumirAvisoAtm } = require('./flujo_planDepagoIngresosBruto.js');
    assert.strictEqual(
        resumirAvisoAtm('Mensaje LISTA DE ERRORES [3] El plan seleccionado fue creado para débito directo y tiene una adhesión activa. Los planes débito directo con adhesión activa no permiten emitir boleto de pago.'),
        'El plan seleccionado fue creado para débito directo y tiene una adhesión activa');
});
