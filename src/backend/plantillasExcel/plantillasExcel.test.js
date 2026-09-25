// Tests del servicio Plantillas Excel. Correr con: node --test src/backend/plantillasExcel/
//
// Fixture: test/fixtures/plantillasExcel/grilla_vinos_corregido.xlsx = el ejemplo
// corregido (hoja Datos + hoja Resumen hecha a mano). La ENTRADA se arma en memoria
// quitándole la hoja Resumen; la hoja Resumen del fixture es la salida esperada.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

const { procesarArchivo, rutaSalidaLibre } = require('./plantillasExcelManager.js');
const { listarPlantillas } = require('./registroPlantillas.js');
const { normalizarCabecera, letraColumna } = require('./service/cabeceras.js');

const FIXTURE = path.join(__dirname, '../../../test/fixtures/plantillasExcel/grilla_vinos_corregido.xlsx');
const ID = 'resumenConceptosFacturados';

function carpetaTemporal() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'plantillasExcel-'));
}

function hash(ruta) {
    return crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex');
}

async function leer(ruta) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(ruta);
    return wb;
}

// Arma la entrada: fixture sin la hoja Resumen (+ mutación opcional de Datos).
async function prepararEntrada(dir, nombre, mutar) {
    const wb = await leer(FIXTURE);
    wb.removeWorksheet(wb.getWorksheet('Resumen').id);
    if (mutar) mutar(wb.getWorksheet('Datos'), wb);
    const ruta = path.join(dir, nombre);
    await wb.xlsx.writeFile(ruta);
    return ruta;
}

// Representación comparable de una celda (fórmula compartida o no, da igual;
// formato 'General' == sin formato).
const fmtDe = (c) => (c.numFmt && c.numFmt !== 'General' ? c.numFmt : null);
function firma(celda) {
    if (celda.formula) return { f: celda.formula, r: celda.result ?? null, fmt: fmtDe(celda) };
    const v = celda.value;
    return { v: v instanceof Date ? v.toISOString() : v, fmt: fmtDe(celda) };
}

function firmasHoja(hoja) {
    const out = {};
    hoja.eachRow({ includeEmpty: false }, (fila) => {
        fila.eachCell({ includeEmpty: false }, (c) => { out[c.address] = firma(c); });
    });
    return out;
}

// Lee un bloque de resumen: { 'ACTIVIDAD|TIPO': valor } + totales por tipo.
function leerBloque(hoja, filaCab) {
    const tipos = [];
    for (let c = 3; ; c++) {
        const t = hoja.getRow(filaCab).getCell(c).value;
        if (!t || t === 'Total') break;
        tipos.push({ c, t });
    }
    const celdas = {};
    let r = filaCab + 1;
    for (; hoja.getCell(`B${r}`).value !== 'Total'; r++) {
        const act = hoja.getCell(`B${r}`).value;
        for (const { c, t } of tipos) celdas[`${act}|${t}`] = hoja.getRow(r).getCell(c).result ?? 0;
    }
    const totales = {};
    for (const { c, t } of tipos) totales[t] = hoja.getRow(r).getCell(c).result ?? 0;
    return { tipos: tipos.map(x => x.t), celdas, totales, filaTotal: r };
}

test('normalizarCabecera: minúsculas, sin tildes, sin espacios de más', () => {
    assert.equal(normalizarCabecera('Tasa IVA '), 'tasa iva');
    assert.equal(normalizarCabecera('  IVA  Insc. Ítem'), 'iva insc. item');
    assert.equal(normalizarCabecera('Año - mes'), normalizarCabecera('AÑO-MES'));
    assert.equal(normalizarCabecera('Tipo (FC / NC)'), normalizarCabecera('Tipo (FC/NC)'));
    assert.equal(letraColumna(28), 'AB');
});

test('registro: lista la plantilla de conceptos facturados', () => {
    const lista = listarPlantillas();
    assert.ok(lista.some(p => p.id === ID && p.nombre));
});

test('genera el Resumen igual al ejemplo corregido, con controles en 0 y Datos intacta', async () => {
    const dir = carpetaTemporal();
    // Nombre con espacios y paréntesis, como el del ejemplo real.
    const entrada = await prepararEntrada(dir, 'Grilla Conceptos (2).xlsx');
    const hashAntes = hash(entrada);

    const res = await procesarArchivo(ID, entrada);
    assert.equal(res.success, true, res.mensaje);
    assert.equal(path.basename(res.archivoGenerado), 'Grilla Conceptos (2) - Resumen 2026-08.xlsx');
    assert.equal(hash(entrada), hashAntes, 'el original no se toca');
    assert.deepEqual(res.hojas, ['Resumen']);
    for (const c of res.controles) assert.equal(c.diferencia, 0);

    const esperado = await leer(FIXTURE);
    const generado = await leer(res.archivoGenerado);
    assert.deepEqual(generado.worksheets.map(h => h.name), ['Resumen', 'Datos']);

    const resEsp = esperado.getWorksheet('Resumen');
    const resGen = generado.getWorksheet('Resumen');

    // Bloque neto (cabecera en fila 4) e IVA (fila 18), como en el ejemplo.
    for (const filaCab of [4, 18]) {
        const e = leerBloque(resEsp, filaCab);
        const g = leerBloque(resGen, filaCab);
        assert.deepEqual(g.tipos, e.tipos);
        assert.deepEqual(g.celdas, e.celdas);
        assert.deepEqual(g.totales, e.totales);
        assert.equal(resGen.getCell(`F${g.filaTotal}`).result, resEsp.getCell(`F${e.filaTotal}`).result);
    }
    assert.deepEqual(
        resEsp.getCell('A5').value + '|' + resEsp.getCell('A6').value,
        resGen.getCell('A5').value + '|' + resGen.getCell('A6').value);

    // Con un solo mes y el mismo layout, las fórmulas quedan IDÉNTICAS a las del ejemplo.
    for (let r = 4; r <= 26; r++) {
        for (const col of ['C', 'D', 'E', 'F']) {
            const ce = resEsp.getCell(`${col}${r}`);
            const cg = resGen.getCell(`${col}${r}`);
            if (ce.formula) {
                assert.equal(cg.formula, ce.formula, `fórmula ${col}${r}`);
                assert.equal(cg.result ?? 0, ce.result ?? 0, `resultado ${col}${r}`);
            }
        }
    }
    // Cantidad de ítems y controles.
    assert.deepEqual(['C8', 'D8', 'E8', 'F8'].map(a => resGen.getCell(a).result), [17, 64, 2, 83]);
    assert.equal(resGen.getCell('F13').result, 0);
    assert.equal(resGen.getCell('F26').result, 0);
    assert.equal(resGen.getCell('F11').result, resEsp.getCell('F11').result);
    assert.equal(resGen.getCell('F24').result, resEsp.getCell('F24').result);

    // Formato copiado del ejemplo.
    assert.equal(resGen.getCell('C5').numFmt, '#,##0.00;-#,##0.00;-');
    assert.equal(resGen.getCell('C8').numFmt, '0');
    assert.equal(resGen.getCell('A4').font.bold, true);
    assert.equal(resGen.getCell('A4').fill.fgColor.argb, 'FFD9E1F2');
    assert.equal(resGen.getCell('C7').fill.fgColor.argb, 'FFF2F2F2');
    assert.equal(resGen.getColumn(2).width, 30);
    assert.equal(resGen.getColumn(3).width, 18);

    // Hoja Datos intacta (valores, fórmulas y formatos numéricos).
    assert.deepEqual(firmasHoja(generado.getWorksheet('Datos')), firmasHoja(esperado.getWorksheet('Datos')));
});

test('original real: hoja "Sheet1" sin las columnas auxiliares → las agrega y renombra a Datos', async () => {
    const dir = carpetaTemporal();
    // Así llega el archivo del cliente: sin Tipo (FC/NC), Letra ni Tipo comprobante,
    // y con la hoja llamada "Sheet1".
    const entrada = await prepararEntrada(dir, 'original.xlsx', (ws) => {
        ws.spliceColumns(26, 3);
        ws.name = 'Sheet1';
    });

    const res = await procesarArchivo(ID, entrada);
    assert.equal(res.success, true, res.mensaje);
    for (const c of res.controles) assert.equal(c.diferencia, 0);

    const esperado = await leer(FIXTURE);
    const generado = await leer(res.archivoGenerado);
    assert.deepEqual(generado.worksheets.map(h => h.name), ['Resumen', 'Datos']);

    // Datos queda igual a la del resultado esperado, fórmulas auxiliares incluidas.
    assert.deepEqual(firmasHoja(generado.getWorksheet('Datos')), firmasHoja(esperado.getWorksheet('Datos')));

    // Y el Resumen, con las mismas fórmulas y resultados.
    const resEsp = esperado.getWorksheet('Resumen');
    const resGen = generado.getWorksheet('Resumen');
    for (let r = 4; r <= 26; r++) {
        for (const col of ['C', 'D', 'E', 'F']) {
            const ce = resEsp.getCell(`${col}${r}`);
            if (!ce.formula) continue;
            const cg = resGen.getCell(`${col}${r}`);
            assert.equal(cg.formula, ce.formula, `fórmula ${col}${r}`);
            assert.equal(cg.result ?? 0, ce.result ?? 0, `resultado ${col}${r}`);
        }
    }
});

test('si el archivo de salida ya existe no se pisa: agrega (2)', async () => {
    const dir = carpetaTemporal();
    const entrada = await prepararEntrada(dir, 'grilla.xlsx');
    const a = await procesarArchivo(ID, entrada);
    const b = await procesarArchivo(ID, entrada);
    assert.equal(path.basename(a.archivoGenerado), 'grilla - Resumen 2026-08.xlsx');
    assert.equal(path.basename(b.archivoGenerado), 'grilla - Resumen 2026-08 (2).xlsx');
    assert.equal(path.basename(rutaSalidaLibre(entrada, 'Resumen 2026-08')), 'grilla - Resumen 2026-08 (3).xlsx');
});

test('falta una cabecera: frena y dice cuál, sin generar archivo', async () => {
    const dir = carpetaTemporal();
    const entrada = await prepararEntrada(dir, 'sin_iva.xlsx', (ws) => {
        ws.getCell('K1').value = 'IVA';
    });
    const res = await procesarArchivo(ID, entrada);
    assert.equal(res.success, false);
    assert.match(res.mensaje, /IVA Insc\. Ítem/);
    assert.deepEqual(res.faltantes, ['IVA Insc. Ítem']);
    assert.deepEqual(fs.readdirSync(dir), ['sin_iva.xlsx']);
});

test('cabeceras por nombre, no por posición (columna insertada + mayúsculas/espacios)', async () => {
    const dir = carpetaTemporal();
    const entrada = await prepararEntrada(dir, 'movida.xlsx', (ws) => {
        ws.spliceColumns(1, 0, []);            // todo corre una columna a la derecha
        ws.getCell('J1').value = '  NETO ITEM ';
    });
    const res = await procesarArchivo(ID, entrada);
    assert.equal(res.success, true, res.mensaje);
    const hoja = (await leer(res.archivoGenerado)).getWorksheet('Resumen');
    assert.equal(hoja.getCell('C5').formula,
        'SUMIFS(Datos!$J$2:$J$84,Datos!$I$2:$I$84,$B5,Datos!$AC$2:$AC$84,C$4)');
    assert.equal(hoja.getCell('F13').result, 0);
});

test('.xls: mensaje claro pidiendo guardarlo como .xlsx', async () => {
    const res = await procesarArchivo(ID, '/cualquier/lado/viejo.xls');
    assert.equal(res.success, false);
    assert.match(res.mensaje, /\.xlsx/);
    assert.match(res.mensaje, /Guardar como/);
});

test('varios meses: una hoja por mes, criterio de mes en las fórmulas y nombre con rango', async () => {
    const dir = carpetaTemporal();
    const entrada = await prepararEntrada(dir, 'dos meses.xlsx', (ws) => {
        for (let r = 50; r <= 84; r++) ws.getCell(`A${r}`).value = '2026-09';
    });
    const res = await procesarArchivo(ID, entrada);
    assert.equal(res.success, true, res.mensaje);
    assert.equal(path.basename(res.archivoGenerado), 'dos meses - Resumen 2026-08 a 2026-09.xlsx');
    assert.deepEqual(res.hojas, ['Resumen 2026-08', 'Resumen 2026-09']);
    for (const c of res.controles) assert.equal(c.diferencia, 0);

    const wb = await leer(res.archivoGenerado);
    assert.deepEqual(wb.worksheets.map(h => h.name), ['Resumen 2026-08', 'Resumen 2026-09', 'Datos']);
    const ago = wb.getWorksheet('Resumen 2026-08');
    const sep = wb.getWorksheet('Resumen 2026-09');
    assert.match(sep.getCell('C5').formula, /,Datos!\$A\$2:\$A\$84,"2026-09"\)$/);
    assert.match(ago.getCell('C8').formula, /^COUNTIFS\(Datos!\$AB\$2:\$AB\$84,C\$4,Datos!\$A\$2:\$A\$84,"2026-08"\)$/);

    // La suma de los dos meses da el total del ejemplo.
    const esp = (await leer(FIXTURE)).getWorksheet('Resumen');
    const totalCol = (h) => h.getCell(`${letraColumna(h.getRow(4).cellCount)}${leerBloque(h, 4).filaTotal}`).result;
    assert.equal(Math.round((totalCol(ago) + totalCol(sep)) * 100) / 100, esp.getCell('F7').result);
});

test('un control que no da 0 frena todo y muestra la diferencia', async () => {
    const dir = carpetaTemporal();
    const entrada = await prepararEntrada(dir, 'rota.xlsx', (ws) => {
        ws.getCell('AB10').value = null;      // sin tipo cacheado...
        ws.getCell('D10').value = 'XX';       // ...y sin forma de derivarlo
    });
    const res = await procesarArchivo(ID, entrada);
    assert.equal(res.success, false);
    assert.match(res.mensaje, /diferencia/);
    assert.match(res.mensaje, /Filas con importe.*\b10\b/);
    assert.ok(res.controles.some(c => c.diferencia !== 0));
    assert.deepEqual(fs.readdirSync(dir), ['rota.xlsx']);
});

test('texto en una columna de importes: frena y dice la fila', async () => {
    const dir = carpetaTemporal();
    const entrada = await prepararEntrada(dir, 'texto.xlsx', (ws) => {
        ws.getCell('I12').value = '1.234,56';
    });
    const res = await procesarArchivo(ID, entrada);
    assert.equal(res.success, false);
    assert.match(res.mensaje, /Fila 12: "Neto Ítem" tiene texto/);
});
