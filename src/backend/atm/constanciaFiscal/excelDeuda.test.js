const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const { generarExcelDeuda, aNumero, aFecha, nombreHoja } = require('./excelDeuda.js');

test('montos y fechas de ATM pasan a número y fecha', () => {
    assert.strictEqual(aNumero('3.379,25'), 3379.25);
    assert.strictEqual(aNumero('2024'), null);          // un período no es un monto
    assert.deepStrictEqual(aFecha('24/11/2024'), new Date(Date.UTC(2024, 10, 24)));
    assert.strictEqual(aFecha('Pendiente'), null);
});

test('nombre de hoja válido para Excel (sin "/", máx. 31) y sin repetir', () => {
    const usados = new Set();
    const a = nombreHoja('IMPUESTOS AGENTES DE RETENCIÓN / PERCEPCIÓN', usados);
    assert.ok(a.length <= 31 && !a.includes('/'));
    assert.notStrictEqual(nombreHoja('IMPUESTOS AGENTES DE RETENCIÓN / PERCEPCIÓN', usados), a);
});

test('Excel: Resumen con total por impuesto (redondeado) + una hoja por tabla', async () => {
    const tablas = [
        { titulo: 'DEUDA IMPUESTO AUTOMOTOR', datos: [
            { Dominio: 'AAA111', 'Fecha Vencimiento': '24/11/2024', 'Saldo Actualizado': '0,10' },
            { Dominio: 'BBB222', 'Fecha Vencimiento': '28/03/2024', 'Saldo Actualizado': '0,20' }] },
        { titulo: 'DEUDA INGRESOS BRUTOS', datos: [{ Periodo: '2025', 'Saldo Actualizado': '1.000,00' }] }
    ];
    const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'deuda-')), 'deuda.xlsx');
    const { resumen } = await generarExcelDeuda(tablas, { cuit: '30711545499', nombre: 'PRUEBA' }, ruta);

    assert.deepStrictEqual(resumen.map(r => r.total), ['0,30', '1000,00']);   // formato que lee la tarjeta
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(ruta);
    assert.deepStrictEqual(wb.worksheets.map(h => h.name), ['Resumen', 'Deuda Impuesto Automotor', 'Deuda Ingresos Brutos']);
    const total = wb.getWorksheet('Resumen').getRow(6).values;
    assert.deepStrictEqual(total.slice(1), ['TOTAL', 3, 1000.3]);
    assert.strictEqual(wb.worksheets[1].getRow(2).getCell(3).value, 0.1);
});
