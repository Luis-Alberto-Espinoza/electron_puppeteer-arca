// Tests de la plantilla "Totales diarios" (Landes).
// Correr con: node --test src/backend/plantillasExcel/totalesDiarios.test.js
//
// Hay dos tipos de test:
//  - Lógica pura y archivos armados en memoria: corren siempre.
//  - Archivos reales del cliente en pruebas/landesExcleMensual/ (carpeta ignorada
//    por git): si no están, esos tests se saltean. El resultado esperado se lee
//    con la librería xlsx porque exceljs no abre el de "mes agosto" (sus
//    comentarios quedaron guardados con una ruta que exceljs no entiende).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');

const { procesarArchivo, detectarPlantilla } = require('./plantillasExcelManager.js');
const { leerMonto } = require('./service/montos.js');
const { leerFechaCruda, deducirMes, resolverFechas, textoFecha } = require('./service/fechas.js');
const { mediana, ticketsSospechosos, diasSinDatos, diasFueraDeRango } = require('./service/anomalias.js');

const ID = 'totalesDiarios';
const CARPETA = path.join(__dirname, '../../../pruebas/landesExcleMensual');
const ESPERADOS = path.join(CARPETA, 'resultado esperado');
const FIXTURE_VINOS = path.join(__dirname, '../../../test/fixtures/plantillasExcel/grilla_vinos_corregido.xlsx');

const hayArchivos = fs.existsSync(path.join(CARPETA, 'AGOSTO MITRE.xlsx'));
const conArchivos = hayArchivos ? test : test.skip;

function carpetaTemporal() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'totalesDiarios-'));
}

function hash(ruta) {
    return crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex');
}

function copiar(nombre, dir) {
    const destino = path.join(dir, nombre);
    fs.copyFileSync(path.join(CARPETA, nombre), destino);
    return destino;
}

// Totales del esperado como [['2026-08-01', 1486400], ...].
function leerEsperado(nombre) {
    const wb = XLSX.readFile(path.join(ESPERADOS, nombre), { cellDates: true });
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }).slice(1);
    return filas.map(([f, m]) => [
        `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`, m
    ]);
}

// Totales de la hoja generada, en el mismo formato.
async function leerTotales(ruta) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(ruta);
    const filas = [];
    wb.getWorksheet('Totales').eachRow((f, r) => {
        if (r > 1) filas.push([f.getCell(1).value.toISOString().slice(0, 10), f.getCell(2).value]);
    });
    return { wb, filas };
}

// Libro armado en memoria a partir de una matriz (fila 1 = cabecera).
async function libroDesdeMatriz(dir, nombre, matriz) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hoja1');
    matriz.forEach((fila, r) => fila.forEach((v, c) => {
        if (v !== undefined && v !== null) ws.getCell(r + 1, c + 1).value = v;
    }));
    const ruta = path.join(dir, nombre);
    await wb.xlsx.writeFile(ruta);
    return ruta;
}

const fechaExcel = (a, m, d) => new Date(Date.UTC(a, m - 1, d));

// ---------------------------------------------------------------------------
// Montos
// ---------------------------------------------------------------------------

test('montos: formatos mezclados de carga a mano', () => {
    assert.deepEqual(leerMonto(5800), { monto: 5800 });
    assert.deepEqual(leerMonto('$5,800 '), { monto: 5800 });
    assert.deepEqual(leerMonto(' $ 11,700.00 '), { monto: 11700 });
    assert.deepEqual(leerMonto('10600'), { monto: 10600 });
    assert.deepEqual(leerMonto('1.234.567,89'), { monto: 1234567.89 });
    assert.deepEqual(leerMonto('10,5'), { monto: 10.5 });
    assert.deepEqual(leerMonto('-$1.500'), { monto: -1500 });
    assert.deepEqual(leerMonto(null), { vacio: true });
    assert.deepEqual(leerMonto(' '), { vacio: true });
    assert.ok(leerMonto('TOTAL').error);
    assert.ok(leerMonto('1,23,4').error);          // no se adivina
    assert.ok(leerMonto(new Date()).error);
});

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

test('fechas: lee títulos con día de la semana y años mal tipeados', () => {
    const c = leerFechaCruda('Miércoles 5/7/2026');
    assert.equal(c.origen, 'texto');
    assert.deepEqual([c.u, c.v, c.anio, c.diaSemana], [5, 7, 2026, 3]);
    assert.equal(leerFechaCruda('Martes 15/9/20206').anioRaro, '20206');
    assert.equal(leerFechaCruda('1/8/26').anio, 2026);
    assert.equal(leerFechaCruda('Total 5/8/2026'), null);  // "Total" no es un día
    assert.equal(leerFechaCruda('FECHA'), null);
    const e = leerFechaCruda(fechaExcel(2026, 1, 8));
    assert.deepEqual([e.origen, e.u, e.v], ['excel', 8, 1]);
});

test('fechas: Excel invertidas (días 1-12) + texto (13 en adelante) → un solo mes', () => {
    // Como "mes agosto": "1/8/26" guardado como 8 de enero; "13/8/2026" quedó texto.
    const crudas = [fechaExcel(2026, 1, 8), fechaExcel(2026, 3, 8), fechaExcel(2026, 12, 8), '13/8/2026', '31/8/2026']
        .map(leerFechaCruda);
    const d = deducirMes(crudas);
    assert.equal(d.ok, true);
    assert.deepEqual([d.mes, d.anio, d.orientaciones.excel, d.orientaciones.texto], [8, 2026, 'invertida', 'normal']);
    const fechas = resolverFechas(crudas, d).map(r => textoFecha(r.fecha));
    assert.deepEqual(fechas, ['01/08/2026', '03/08/2026', '12/08/2026', '13/08/2026', '31/08/2026']);
});

test('fechas: mes/día escrito derecho (septiembre) no se invierte', () => {
    const crudas = ['9/1/26', '9/2/26', '9/30/26'].map(leerFechaCruda);
    const d = deducirMes(crudas);
    assert.deepEqual([d.ok, d.mes, d.orientaciones.texto], [true, 9, 'invertida']);
});

test('fechas: si las dos lecturas tienen sentido, es ambiguo y no se adivina', () => {
    const d = deducirMes(['5/8/2026'].map(leerFechaCruda));
    assert.equal(d.ok, false);
    assert.match(d.mensaje, /ambiguas/);
});

test('fechas: corrige por contexto el mes y el año mal tipeados; avisa el día de semana', () => {
    const crudas = ['Martes 4/8/2026', 'Miércoles 5/7/2026', 'Jueves 6/8/2026', 'Viernes 7/8/20206', 'Sábado 8/8/2026',
        'Martes 11/8/2026', 'Jueves 12/8/2026'].map(leerFechaCruda);
    const d = deducirMes(crudas);
    const r = resolverFechas(crudas, d);
    assert.equal(textoFecha(r[1].fecha), '05/08/2026');
    assert.match(r[1].correccion, /miércoles, entre el 04\/08\/2026 y el 06\/08\/2026/);
    assert.equal(textoFecha(r[3].fecha), '07/08/2026');
    assert.ok(r[3].correccion);
    assert.equal(textoFecha(r[6].fecha), '12/08/2026');       // "Jueves 12/8" es miércoles: se avisa
    assert.match(r[6].aviso, /es miércoles/);
});

test('fechas: si las pistas no coinciden, error (no se corrige a ciegas)', () => {
    // "Lunes 5/7" entre el 4/8 y el 6/8: el 5/8 es miércoles, no lunes.
    const crudas = ['Martes 4/8/2026', 'Lunes 5/7/2026', 'Jueves 6/8/2026'].map(leerFechaCruda);
    const r = resolverFechas(crudas, deducirMes(crudas));
    assert.equal(r[1].fecha, null);
    assert.match(r[1].error, /no se puede corregir/);
});

// ---------------------------------------------------------------------------
// Anomalías
// ---------------------------------------------------------------------------

test('anomalías: mediana, ticket con un cero de más, días fuera de rango y sin datos', () => {
    assert.equal(mediana([3, 1, 2]), 2);
    assert.equal(mediana([4, 1, 3, 2]), 2.5);

    const f = { anio: 2026, mes: 8, dia: 3 };
    // Mediana 10.500: 115.000 la supera más de 10 veces; 97.000 (venta real grande) no.
    const tickets = [10000, 9000, 11000, 9500, 10500, 115000, 97000].map((monto, i) => ({ monto, celda: `E${i + 2}`, fecha: f }));
    const sosp = ticketsSospechosos(tickets);
    assert.deepEqual(sosp.map(t => [t.celda, t.sugerido]), [['E7', 11500]]);

    const dias = [100, 110, 90, 105, 400, 20].map((total, i) => ({ fecha: { ...f, dia: i + 1 }, total }));
    assert.deepEqual(diasFueraDeRango(dias).map(d => [d.total, d.nivel]), [[400, 'error'], [20, 'aviso']]);

    // Agosto 2026 con datos todos los días menos el lunes 17: solo falta ese (los domingos no cuentan).
    const conDatos = new Set();
    for (let d = 1; d <= 31; d++) if (d !== 17) conDatos.add(`2026-08-${String(d).padStart(2, '0')}`);
    assert.deepEqual(diasSinDatos(2026, 8, conDatos).map(textoFecha), ['17/08/2026']);
});

// ---------------------------------------------------------------------------
// Archivos armados en memoria
// ---------------------------------------------------------------------------

test('pares: sinónimos, orden cambiado, montos en texto, fecha heredada y fecha distinta dentro del bloque', async () => {
    const dir = carpetaTemporal();
    const ruta = await libroDesdeMatriz(dir, 'ventas.xlsx', [
        ['Fecha ', ' MONTO', null, 'IMPORTE', 'día', null, 'FECHA', 'Total'],
        ['14/8/2026', '$5,800 ', null, 1000, '15/8/2026', null, '18/8/2026', 10],
        [null, ' $ 11,700.00 ', null, 2000, '15/8/2026', null, '18/8/2026', 20],
        [null, '10600', null, 3000, '15/8/2026', null, null, ' '],
        [null, null, null, 4000, '7/9/2026', null, null, 30]           // 7/9 dentro del bloque del 15/8
    ]);
    const r = await procesarArchivo(ID, ruta);
    assert.equal(r.success, true, r.mensaje);
    const { filas, wb } = await leerTotales(r.archivoGenerado);
    assert.deepEqual(filas, [['2026-08-14', 28100], ['2026-08-15', 10000], ['2026-08-18', 60]]);
    const aviso = r.avisos.find(a => a.celda === 'E5');
    assert.equal(aviso.nivel, 'aviso');
    assert.match(aviso.mensaje, /dice "07\/09\/2026" pero la columna es del 15\/08\/2026/);
    assert.equal(wb.getWorksheet('Datos').getCell('E5').note, aviso.mensaje);
    assert.match(path.basename(r.archivoGenerado), /^ventas - procesado\.xlsx$/);
});

test('fechas ambiguas: no se genera ningún archivo', async () => {
    const dir = carpetaTemporal();
    const ruta = await libroDesdeMatriz(dir, 'ambiguo.xlsx', [
        ['FECHA', 'IMPORTE'],
        ['5/8/2026', 100]
    ]);
    const r = await procesarArchivo(ID, ruta);
    assert.equal(r.success, false);
    assert.match(r.mensaje, /ambiguas/);
    assert.deepEqual(fs.readdirSync(dir), ['ambiguo.xlsx']);
});

test('montos sin columna de día: no se genera (no se sabe a qué día van)', async () => {
    const dir = carpetaTemporal();
    const ruta = await libroDesdeMatriz(dir, 'huerfano.xlsx', [
        ['Lunes 3/8/2026', 'Martes 4/8/2026', 'Miércoles 5/8/2026', null, null],
        [100, 200, 300, null, 999]
    ]);
    const r = await procesarArchivo(ID, ruta);
    assert.equal(r.success, false);
    assert.match(r.mensaje, /E2/);
});

test('el Excel de conceptos facturados no se reconoce como ventas diarias', async () => {
    const r = await detectarPlantilla(FIXTURE_VINOS);
    const mia = r.candidatas.find(c => c.id === ID);
    assert.ok(mia.puntaje < 1);
    assert.ok(!r.coincidencias.includes(ID));
});

// ---------------------------------------------------------------------------
// Archivos reales (pruebas/landesExcleMensual)
// ---------------------------------------------------------------------------

conArchivos('AGOSTO MITRE: al peso con el esperado, corrige el 5/7 y avisa el 17/8 sin ventas', async () => {
    const dir = carpetaTemporal();
    const entrada = copiar('AGOSTO MITRE.xlsx', dir);
    const antes = hash(entrada);

    const det = await detectarPlantilla(entrada);
    assert.deepEqual(det.coincidencias, [ID]);

    const r = await procesarArchivo(ID, entrada);
    assert.equal(r.success, true, r.mensaje);
    assert.equal(hash(entrada), antes, 'el original no se toca');
    assert.equal(path.basename(r.archivoGenerado), 'AGOSTO MITRE - procesado.xlsx');

    const { wb, filas } = await leerTotales(r.archivoGenerado);
    assert.deepEqual(wb.worksheets.map(h => h.name), ['Avisos', 'Totales', 'Datos']);
    assert.deepEqual(filas, leerEsperado('AGOSTO MITRE - totales diarios.xlsx'));
    assert.equal(wb.getWorksheet('Totales').getCell('A2').numFmt, 'dd/mm/yyyy');

    assert.deepEqual(r.avisos.map(a => [a.nivel, a.fecha, a.celda]), [
        ['aviso', '05/08/2026', 'D1'],
        ['info', '17/08/2026', null]
    ]);
    assert.deepEqual(r.controles.map(c => c.diferencia), [0]);
});

conArchivos('mes agosto: marca exactamente los dos ceros de más; corregidos, da al peso', async () => {
    const dir = carpetaTemporal();
    const entrada = copiar('mes agosto.xlsx', dir);

    const r = await procesarArchivo(ID, entrada);
    assert.equal(r.success, true, r.mensaje);
    const graves = r.avisos.filter(a => a.nivel === 'error');
    assert.deepEqual(graves.map(a => a.celda), ['E3', 'AF150']);
    assert.match(graves[0].mensaje, /Posible cero de más: 11\.500/);
    assert.match(graves[1].mensaje, /Posible cero de más: 22\.910/);

    // Lo que haría el usuario: corregir el Excel y volver a procesar.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(entrada);
    wb.worksheets[0].getCell('E3').value = 11500;
    wb.worksheets[0].getCell('AF150').value = 22910;
    const corregido = path.join(dir, 'mes agosto corregido.xlsx');
    await wb.xlsx.writeFile(corregido);

    const r2 = await procesarArchivo(ID, corregido);
    assert.equal(r2.success, true, r2.mensaje);
    assert.equal(r2.avisos.filter(a => a.nivel === 'error').length, 0);
    const { filas } = await leerTotales(r2.archivoGenerado);
    assert.deepEqual(filas, leerEsperado('mes agosto - totales diarios.xlsx'));
});

conArchivos('septiembre: los dos formatos se procesan; MITRE corrige el año 20206', async () => {
    const dir = carpetaTemporal();
    for (const nombre of ['SEPTIEMBRE MITRE.xlsx', 'MES SEPTIEMBRE.xlsx']) {
        const r = await procesarArchivo(ID, copiar(nombre, dir));
        assert.equal(r.success, true, `${nombre}: ${r.mensaje}`);
        assert.deepEqual(r.meses, ['2026-09']);
        const { filas } = await leerTotales(r.archivoGenerado);
        assert.equal(filas.length, 26);
        assert.ok(filas.every(([f]) => f.startsWith('2026-09-')));
        assert.deepEqual(r.controles.map(c => c.diferencia), [0]);
    }
    const r = await procesarArchivo(ID, path.join(dir, 'SEPTIEMBRE MITRE.xlsx'));
    assert.ok(r.avisos.some(a => a.celda === 'M1' && a.fecha === '15/09/2026'));
});

conArchivos('Datos legible: cabecera con color (respeta la del cliente) y columnas sin "###"', async () => {
    const dir = carpetaTemporal();

    // MES SEPTIEMBRE: sin color de cabecera y con ancho base 10 que exceljs pierde.
    const r = await procesarArchivo(ID, copiar('MES SEPTIEMBRE.xlsx', dir));
    const { wb } = await leerTotales(r.archivoGenerado);
    const datos = wb.getWorksheet('Datos');
    assert.equal(datos.getCell('A1').fill.pattern, 'solid');
    assert.ok(datos.getColumn('A').width >= 12, 'la fecha 01/09/2026 entra');
    assert.ok(datos.getColumn('B').width >= 12, 'el monto con $ entra');
    assert.deepEqual(datos.getCell('A2').fill, { type: 'pattern', pattern: 'none' }, 'los datos no se pintan');

    // AGOSTO MITRE: la cabecera ya viene pintada por el cliente y se respeta.
    const r2 = await procesarArchivo(ID, copiar('AGOSTO MITRE.xlsx', dir));
    const { wb: wb2 } = await leerTotales(r2.archivoGenerado);
    assert.equal(wb2.getWorksheet('Datos').getCell('A1').fill.fgColor.theme, 9);
});
