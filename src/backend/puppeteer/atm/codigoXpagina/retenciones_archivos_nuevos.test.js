/**
 * Qué archivos cuentan como "bajados en esta consulta" (archivosNuevosDesde).
 * Caso real (2026-10-22, BUIGUES): quedó un CUIT_AAAA_MM.xls sin renombrar de una corrida
 * cortada; la descarga nueva lo pisó con el mismo nombre y no se contaba → "1 de 2" archivos.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { archivosNuevosDesde } = require('./retenciones_generico.js');

function carpetaDePrueba() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'retenciones-'));
}
function escribirConHora(carpeta, nombre, ms) {
    const ruta = path.join(carpeta, nombre);
    fs.writeFileSync(ruta, 'x');
    fs.utimesSync(ruta, ms / 1000, ms / 1000);
}

test('archivo con nombre nuevo: cuenta', async () => {
    const carpeta = carpetaDePrueba();
    const inicio = Date.now();
    escribirConHora(carpeta, 'sircreb_diu.txt', inicio + 500);
    assert.deepStrictEqual(await archivosNuevosDesde(carpeta, [], inicio), ['sircreb_diu.txt']);
});

test('sobrante viejo con el mismo nombre, pisado por la descarga nueva: cuenta', async () => {
    const carpeta = carpetaDePrueba();
    const inicio = Date.now();
    escribirConHora(carpeta, '24306881619_2026_09.xls', inicio - 60000);   // sobrante de la corrida cortada
    const antes = fs.readdirSync(carpeta);
    escribirConHora(carpeta, '24306881619_2026_09.xls', inicio + 500);     // ATM lo pisa
    assert.deepStrictEqual(await archivosNuevosDesde(carpeta, antes, inicio), ['24306881619_2026_09.xls']);
});

test('archivos viejos que nadie tocó: no cuentan', async () => {
    const carpeta = carpetaDePrueba();
    const inicio = Date.now();
    escribirConHora(carpeta, '24306881619_Retenciones_SIRCREB_IB_2026-09_2026-10-22.xls', inicio - 60000);
    const antes = fs.readdirSync(carpeta);
    assert.deepStrictEqual(await archivosNuevosDesde(carpeta, antes, inicio), []);
});
