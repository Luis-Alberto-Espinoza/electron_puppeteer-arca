const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validarArchivosIva } = require('./validarArchivosIva.js');

// Renglones con el diseño de ARCA: solo se llenan los campos que mira el validador.
const relleno = (s, largo) => s.padEnd(largo, '0');
function ventaCbte(fecha, nro, cant) {
    const l = relleno(`${fecha}001${'00003'}${String(nro).padStart(20, '0')}`, 266).split('');
    l[241] = String(cant);
    return l.join('');
}
const poner = (l, desde, texto) => l.slice(0, desde) + texto + l.slice(desde + texto.length);
// Código de alícuota 0005 (21%).
const ventaAli = (nro) => poner(relleno(`001${'00003'}${String(nro).padStart(20, '0')}`, 62), 43, '0005');
function compraCbte(fecha, nro, cant) {
    const l = relleno(`${fecha}001${'00001'}${String(nro).padStart(20, '0')}${' '.repeat(16)}80${'30500001735'.padStart(20, '0')}`, 325).split('');
    l[237] = String(cant);
    return l.join('');
}
const compraAli = (nro) => poner(relleno(`001${'00001'}${String(nro).padStart(20, '0')}80${'30500001735'.padStart(20, '0')}`, 84), 65, '0005');

function carpeta(archivos) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'livatest-'));
    return Object.entries(archivos).map(([nombre, contenido]) => {
        const ruta = path.join(dir, nombre);
        fs.writeFileSync(ruta, Array.isArray(contenido) ? contenido.join('\r\n') + '\r\n' : contenido, 'latin1');
        return ruta;
    });
}

const base = () => ({
    'a.txt': [ventaCbte('20260930', 3, 2)],
    'b.txt': [ventaAli(3), ventaAli(3)],
    'c.txt': [compraCbte('20260702', 1, 1), compraCbte('20260901', 2, 0)],
    'd.txt': [compraAli(1)]
});

test('los 4 bien: se reconocen por el largo, sin importar el nombre', () => {
    const r = validarArchivosIva(carpeta(base()), '202609');
    assert.deepStrictEqual(r.errores, []);
    assert.ok(r.ok);
    assert.deepStrictEqual(Object.keys(r.archivos).sort(), ['comprasAlicuotas', 'comprasCbte', 'ventasAlicuotas', 'ventasCbte']);
    assert.deepStrictEqual(r.resumen, { ventas: 1, compras: 2 });
});

test('compras de otro mes es válido; ventas fuera del período no', () => {
    const r = validarArchivosIva(carpeta(base()), '202610');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.errores.length, 1);
    assert.match(r.errores[0], /^Ventas: comprobantes fuera del período 10\/2026/);
});

test('renglón con otro largo, y la pista de UTF-8', () => {
    const a = base();
    // Una ñ guardada en UTF-8 son 2 bytes: el renglón queda de 326.
    a['c.txt'] = [compraCbte('20260702', 1, 1), compraCbte('20260901', 2, 0).replace(/0$/, 'Ã±')];
    const r = validarArchivosIva(carpeta(a), '202609');
    assert.ok(r.errores.some(e => /1 renglón\(es\) sin los 325 caracteres.*renglones 2.*UTF-8/.test(e)), r.errores.join('\n'));
});

test('cantidad de alícuotas que no cierra (error) y alícuotas sin comprobante (aviso)', () => {
    const a = base();
    a['b.txt'] = [ventaAli(3), ventaAli(9)];
    const r = validarArchivosIva(carpeta(a), '202609');
    assert.ok(r.errores.some(e => /renglón 1 \(001-00003-3\): dice 2 alícuota\(s\) y el archivo de alícuotas tiene 1/.test(e)), r.errores.join('\n'));
    assert.deepStrictEqual(r.avisos, ['Ventas: alícuotas sin comprobante (renglones 2 del archivo de alícuotas)']);
});

test('alícuota sin comprobante sola: pasa, con aviso', () => {
    const a = base();
    a['b.txt'] = [ventaAli(3), ventaAli(3), ventaAli(9)];
    const r = validarArchivosIva(carpeta(a), '202609');
    assert.ok(r.ok);
    assert.deepStrictEqual(r.errores, []);
    assert.deepStrictEqual(r.avisos, ['Ventas: alícuotas sin comprobante (renglones 3 del archivo de alícuotas)']);
});

test('falta uno, sobra uno, y no-txt', () => {
    const a = base();
    delete a['d.txt'];
    a['e.txt'] = [ventaAli(3)];
    a['f.csv'] = 'x';
    const r = validarArchivosIva(carpeta(a), '202609');
    assert.ok(r.errores.includes('Falta: Compras (alícuotas)'), r.errores.join('\n'));
    assert.ok(r.errores.some(e => /^Hay dos archivos de Ventas \(alícuotas\)/.test(e)));
    assert.ok(r.errores.includes('f.csv: tiene que ser un .txt'));
});

test('alícuotas vacío se reconoce por el nombre (todo con 0 alícuotas)', () => {
    const a = base();
    a['c.txt'] = [compraCbte('20260901', 2, 0)];
    delete a['d.txt'];
    a['LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS.txt'] = '';
    const r = validarArchivosIva(carpeta(a), '202609');
    assert.deepStrictEqual(r.errores, []);
});

test('fecha inválida', () => {
    const a = base();
    a['c.txt'] = [compraCbte('20260231', 1, 1), compraCbte('20260901', 2, 0)];
    const r = validarArchivosIva(carpeta(a), '202609');
    assert.ok(r.errores.includes('Compras: fecha inválida (renglones 1)'), r.errores.join('\n'));
});

test('sin el archivo de alícuotas: solo el "Falta", sin errores de arrastre', () => {
    const a = base();
    delete a['b.txt'];
    const r = validarArchivosIva(carpeta(a), '202609');
    assert.deepStrictEqual(r.errores, ['Falta: Ventas (alícuotas)']);
});

test('código de alícuota inválido', () => {
    const a = base();
    a['b.txt'] = [ventaAli(3), poner(ventaAli(3), 43, '0099')];
    const r = validarArchivosIva(carpeta(a), '202609');
    assert.deepStrictEqual(r.errores, ['Ventas: código de alícuota inválido (renglones 2 del archivo de alícuotas; valen 3, 4, 5, 6, 8 y 9)']);
});

test('importe con letras, en comprobantes y en alícuotas', () => {
    const a = base();
    a['a.txt'] = [poner(ventaCbte('20260930', 3, 2), 108, '0000000731544AB')];
    a['d.txt'] = [poner(compraAli(1), 69, '00000000001234X')];
    const r = validarArchivosIva(carpeta(a), '202609');
    assert.deepStrictEqual(r.errores, [
        'Ventas: importes con caracteres que no son números (renglones 1)',
        'Compras: importes con caracteres que no son números (renglones 1 del archivo de alícuotas)'
    ]);
});

test('CUIT con dígito verificador inválido (solo si el documento es 80)', () => {
    const a = base();
    a['a.txt'] = [poner(ventaCbte('20260930', 3, 2), 56, '80' + '30500001736'.padStart(20, '0'))];
    let r = validarArchivosIva(carpeta(a), '202609');
    assert.deepStrictEqual(r.errores, ['Ventas: CUIT del comprador inválida (renglones 1)']);
    // DNI (96): no se controla.
    a['a.txt'] = [poner(ventaCbte('20260930', 3, 2), 56, '96' + '30500001736'.padStart(20, '0'))];
    r = validarArchivosIva(carpeta(a), '202609');
    assert.deepStrictEqual(r.errores, []);
});

test('comprobante repetido', () => {
    const a = base();
    a['c.txt'] = [compraCbte('20260702', 1, 1), compraCbte('20260901', 2, 0), compraCbte('20260901', 2, 0)];
    const r = validarArchivosIva(carpeta(a), '202609');
    assert.deepStrictEqual(r.errores, ['Compras: comprobante 001-00001-2 repetido (renglones 2, 3)']);
});
