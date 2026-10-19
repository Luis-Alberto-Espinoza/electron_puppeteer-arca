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
const ventaAli = (nro) => relleno(`001${'00003'}${String(nro).padStart(20, '0')}`, 62);
function compraCbte(fecha, nro, cant) {
    const l = relleno(`${fecha}001${'00001'}${String(nro).padStart(20, '0')}${' '.repeat(16)}80${'30500001735'.padStart(20, '0')}`, 325).split('');
    l[237] = String(cant);
    return l.join('');
}
const compraAli = (nro) => relleno(`001${'00001'}${String(nro).padStart(20, '0')}80${'30500001735'.padStart(20, '0')}`, 84);

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

test('cantidad de alícuotas que no cierra y alícuotas sin comprobante', () => {
    const a = base();
    a['b.txt'] = [ventaAli(3), ventaAli(9)];
    const r = validarArchivosIva(carpeta(a), '202609');
    assert.ok(r.errores.some(e => /renglón 1 \(001-00003-3\): dice 2 alícuota\(s\) y el archivo de alícuotas tiene 1/.test(e)), r.errores.join('\n'));
    assert.ok(r.errores.some(e => /alícuotas sin comprobante \(renglones 2/.test(e)), r.errores.join('\n'));
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
