// Valida los txt del Libro IVA Digital ANTES del login (un error acá no gasta un login).
// ARCA recién avisa del formato después de importar, en el historial de tareas.
// Se carga un libro por cada par completo (comprobantes + alícuotas): alcanza con Ventas o con
// Compras. Un par a medias frena (casi siempre es un olvido).
//
// Diseño de registro de ARCA (ancho fijo, ISO-8859-1, 1 byte = 1 carácter):
//   Ventas comprobantes 266 · Ventas alícuotas 62 · Compras comprobantes 325 · Compras alícuotas 84
// Cada archivo se reconoce por el largo de sus renglones (el nombre no importa); un archivo de
// alícuotas vacío (todos los comprobantes con 0 alícuotas, ej. Facturas C) se reconoce por el nombre.
//
// Solo avisa: nunca corrige montos ni renglones. Los errores frenan; los avisos son cosas que
// ARCA acepta igual (ej. alícuotas sin comprobante: las ignora sin decir nada) y no frenan.

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 10 * 1024 * 1024;   // el mismo límite que ARCA en "Importar Archivos"
const MAX_ERRORES = 15;
const MAX_RENGLONES_POR_ERROR = 5;

const TIPOS = {
    ventasCbte:       { largo: 266, libro: 'ventas',  nombre: 'Ventas (comprobantes)' },
    ventasAlicuotas:  { largo: 62,  libro: 'ventas',  nombre: 'Ventas (alícuotas)' },
    comprasCbte:      { largo: 325, libro: 'compras', nombre: 'Compras (comprobantes)' },
    comprasAlicuotas: { largo: 84,  libro: 'compras', nombre: 'Compras (alícuotas)' }
};

// Por libro: dónde está la clave del comprobante en cada archivo y la cantidad de alícuotas.
// La clave es tipo + punto de venta + número (+ documento del vendedor en Compras).
// montos = [desde, hasta) de cada importe (y el tipo de cambio); documento = código + número
// del comprador (Ventas) o del vendedor (Compras); codigoAlicuota = desde dónde, 4 caracteres.
const LIBROS = {
    ventas: {
        nombre: 'Ventas', cbte: 'ventasCbte', alicuotas: 'ventasAlicuotas',
        claveCbte: l => l.slice(8, 36), claveAlicuota: l => l.slice(0, 28), cantidad: l => l[241],
        montosCbte: [...importes(108, 8), [231, 241], [243, 258]], montosAlicuota: [[28, 43], [47, 62]],
        documento: l => [l.slice(56, 58), l.slice(58, 78)], quien: 'comprador', codigoAlicuota: 43,
        fechaEnPeriodo: true
    },
    compras: {
        nombre: 'Compras', cbte: 'comprasCbte', alicuotas: 'comprasAlicuotas',
        claveCbte: l => l.slice(8, 36) + l.slice(52, 74), claveAlicuota: l => l.slice(0, 50), cantidad: l => l[237],
        montosCbte: [...importes(104, 8), [227, 237], [239, 254], [254, 269], [310, 325]], montosAlicuota: [[50, 65], [69, 84]],
        documento: l => [l.slice(52, 54), l.slice(54, 74)], quien: 'vendedor', codigoAlicuota: 65,
        // Compras puede traer comprobantes de meses anteriores (crédito fiscal computado tarde).
        fechaEnPeriodo: false
    }
};

// n importes seguidos de 15 caracteres desde `desde`.
function importes(desde, n) {
    return Array.from({ length: n }, (_, i) => [desde + 15 * i, desde + 15 * (i + 1)]);
}

// Los que acepta ARCA: 3 = 0%, 4 = 10,5%, 5 = 21%, 6 = 27%, 8 = 5%, 9 = 2,5%.
const CODIGOS_ALICUOTA = ['0003', '0004', '0005', '0006', '0008', '0009'];
const DOC_CUIT = '80';

const etiqueta = (l) => `${l.slice(8, 11)}-${l.slice(11, 16)}-${l.slice(16, 36).replace(/^0+(?=\d)/, '')}`;

function fechaValida(f) {
    if (!/^\d{8}$/.test(f)) return false;
    const d = new Date(Date.UTC(+f.slice(0, 4), +f.slice(4, 6) - 1, +f.slice(6, 8)));
    return d.getUTCFullYear() === +f.slice(0, 4) && d.getUTCMonth() === +f.slice(4, 6) - 1 && d.getUTCDate() === +f.slice(6, 8);
}

function cuitValido(cuit) {
    if (!/^\d{11}$/.test(cuit)) return false;
    const suma = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((a, m, i) => a + m * Number(cuit[i]), 0);
    const dv = 11 - (suma % 11);
    return (dv === 11 ? 0 : dv === 10 ? 9 : dv) === Number(cuit[10]);
}

// Solo dígitos (con un '-' adelante, por las notas de crédito en negativo).
const montosMalos = (l, montos) => montos.some(([d, h]) => !/^-?\d+$/.test(l.slice(d, h)));

// "renglones 3, 7, 9 y 4 más"
function listaRenglones(nros) {
    const vistos = nros.slice(0, MAX_RENGLONES_POR_ERROR).join(', ');
    return nros.length > MAX_RENGLONES_POR_ERROR ? `${vistos} y ${nros.length - MAX_RENGLONES_POR_ERROR} más` : vistos;
}

/** Lee un archivo y adivina su tipo. Devuelve { ruta, nombre, tipo?, renglones, errores }. */
function leerArchivo(ruta) {
    const nombre = path.basename(ruta);
    const r = { ruta, nombre, tipo: null, renglones: [], errores: [] };

    if (path.extname(ruta).toLowerCase() !== '.txt') {
        r.errores.push(`${nombre}: tiene que ser un .txt`);
        return r;
    }
    let buffer;
    try {
        if (fs.statSync(ruta).size > MAX_BYTES) {
            r.errores.push(`${nombre}: pesa más de 10 MB, ARCA no lo acepta`);
            return r;
        }
        buffer = fs.readFileSync(ruta);
    } catch (e) {
        r.errores.push(`${nombre}: no se pudo leer (${e.code || e.message})`);
        return r;
    }

    r.renglones = buffer.toString('latin1').split('\n')
        .map((texto, i) => ({ n: i + 1, texto: texto.replace(/\r$/, '') }))
        .filter(x => x.texto.trim() !== '');

    if (r.renglones.length === 0) {
        // Vacío: solo puede ser un archivo de alícuotas, y se reconoce por el nombre.
        if (/al[ií]cuota/i.test(nombre) && /venta/i.test(nombre)) r.tipo = 'ventasAlicuotas';
        else if (/al[ií]cuota/i.test(nombre) && /compra/i.test(nombre)) r.tipo = 'comprasAlicuotas';
        else r.errores.push(`${nombre}: está vacío`);
        return r;
    }

    // El tipo es el largo más repetido entre los conocidos.
    const porLargo = new Map();
    r.renglones.forEach(x => porLargo.set(x.texto.length, (porLargo.get(x.texto.length) || 0) + 1));
    const candidatos = Object.entries(TIPOS).filter(([, t]) => porLargo.has(t.largo));
    if (candidatos.length === 0) {
        const largos = [...porLargo.keys()].sort((a, b) => a - b).join(', ');
        r.errores.push(`${nombre}: no tiene el formato de ARCA (renglones de ${largos} caracteres)`);
        return r;
    }
    candidatos.sort((a, b) => porLargo.get(b[1].largo) - porLargo.get(a[1].largo));
    r.tipo = candidatos[0][0];

    const largo = TIPOS[r.tipo].largo;
    const malos = r.renglones.filter(x => x.texto.length !== largo).map(x => x.n);
    if (malos.length) {
        // Una Ñ o un acento guardados en UTF-8 ocupan 2 bytes y estiran el renglón.
        const utf8 = /\xC3[\x80-\xBF]/.test(buffer.toString('latin1'));
        r.errores.push(`${nombre}: ${malos.length} renglón(es) sin los ${largo} caracteres de ${TIPOS[r.tipo].nombre} ` +
            `(renglones ${listaRenglones(malos)})${utf8 ? '. Parece guardado en UTF-8: tiene que ser ANSI / ISO-8859-1' : ''}`);
    }
    return r;
}

/** Cruza comprobantes con alícuotas de un libro y revisa las fechas. */
function revisarLibro(def, cbte, alicuotas, periodo) {
    const errores = [];
    // Qué archivo tiene cada error, para la pantalla (los textos dicen "Ventas:", no el archivo).
    const conError = new Set();
    const errorCbte = (texto) => { errores.push(texto); conError.add(def.cbte); };
    const errorAli = (texto) => { errores.push(texto); conError.add(def.alicuotas); };
    const largoCbte = TIPOS[def.cbte].largo;
    const filas = cbte.renglones.filter(x => x.texto.length === largoCbte);

    const fechasMalas = filas.filter(x => !fechaValida(x.texto.slice(0, 8))).map(x => x.n);
    if (fechasMalas.length) errorCbte(`${def.nombre}: fecha inválida (renglones ${listaRenglones(fechasMalas)})`);
    if (def.fechaEnPeriodo && periodo) {
        const fuera = filas.filter(x => fechaValida(x.texto.slice(0, 8)) && !x.texto.startsWith(periodo)).map(x => x.n);
        if (fuera.length) {
            errorCbte(`${def.nombre}: comprobantes fuera del período ${periodo.slice(4, 6)}/${periodo.slice(0, 4)} (renglones ${listaRenglones(fuera)})`);
        }
    }

    const conLetras = filas.filter(x => montosMalos(x.texto, def.montosCbte)).map(x => x.n);
    if (conLetras.length) errorCbte(`${def.nombre}: importes con caracteres que no son números (renglones ${listaRenglones(conLetras)})`);

    // El número de documento son 20 caracteres con ceros adelante: la CUIT son los últimos 11.
    const cuitMala = filas.filter(x => {
        const [codigo, numero] = def.documento(x.texto);
        return codigo === DOC_CUIT && !cuitValido(numero.slice(-11));
    }).map(x => x.n);
    if (cuitMala.length) errorCbte(`${def.nombre}: CUIT del ${def.quien} inválida (renglones ${listaRenglones(cuitMala)})`);

    // ARCA no lo ve como repetido: corta el archivo por "no se encontró la cantidad de alícuotas".
    const porClave = new Map();
    filas.forEach(x => {
        const k = def.claveCbte(x.texto);
        if (!porClave.has(k)) porClave.set(k, []);
        porClave.get(k).push(x);
    });
    [...porClave.values()].filter(v => v.length > 1).forEach(v => {
        errorCbte(`${def.nombre}: comprobante ${etiqueta(v[0].texto)} repetido (renglones ${listaRenglones(v.map(x => x.n))})`);
    });

    const avisos = [];
    // Sin el archivo de alícuotas ya está el "Falta": el cruce solo sumaría errores de arrastre.
    if (!alicuotas) return { errores, conError, avisos, comprobantes: filas.length };

    // Cuántos renglones de alícuotas tiene cada comprobante.
    const enAlicuotas = new Map();
    const largoAli = TIPOS[def.alicuotas].largo;
    const filasAli = alicuotas.renglones.filter(x => x.texto.length === largoAli);

    const codigoMalo = filasAli.filter(x => !CODIGOS_ALICUOTA.includes(x.texto.slice(def.codigoAlicuota, def.codigoAlicuota + 4))).map(x => x.n);
    if (codigoMalo.length) {
        errorAli(`${def.nombre}: código de alícuota inválido (renglones ${listaRenglones(codigoMalo)} del archivo de alícuotas; valen 3, 4, 5, 6, 8 y 9)`);
    }
    const aliConLetras = filasAli.filter(x => montosMalos(x.texto, def.montosAlicuota)).map(x => x.n);
    if (aliConLetras.length) {
        errorAli(`${def.nombre}: importes con caracteres que no son números (renglones ${listaRenglones(aliConLetras)} del archivo de alícuotas)`);
    }

    filasAli.forEach(x => {
        const k = def.claveAlicuota(x.texto);
        if (!enAlicuotas.has(k)) enAlicuotas.set(k, []);
        enAlicuotas.get(k).push(x.n);
    });

    const claves = new Set();
    filas.forEach(x => {
        const k = def.claveCbte(x.texto);
        claves.add(k);
        const dice = def.cantidad(x.texto);
        const hay = (enAlicuotas.get(k) || []).length;
        if (!/^\d$/.test(dice)) {
            errorCbte(`${def.nombre}: renglón ${x.n} (${etiqueta(x.texto)}): cantidad de alícuotas inválida`);
        } else if (Number(dice) !== hay) {
            errorCbte(`${def.nombre}: renglón ${x.n} (${etiqueta(x.texto)}): dice ${dice} alícuota(s) y el archivo de alícuotas tiene ${hay}`);
        }
    });
    const huerfanas = [...enAlicuotas].filter(([k]) => !claves.has(k)).flatMap(([, nros]) => nros);
    // ARCA las ignora sin avisar (probado 2026-10-20): se carga, pero el libro queda distinto del txt.
    if (huerfanas.length) {
        avisos.push(`${def.nombre}: alícuotas sin comprobante (renglones ${listaRenglones(huerfanas)} del archivo de alícuotas)`);
    }
    return { errores, conError, avisos, comprobantes: filas.length };
}

/**
 * @param {string[]} rutas  los archivos que eligió el usuario (en cualquier orden)
 * @param {string} periodo  'AAAAMM'
 * @returns {{ ok: boolean, archivos: Object<string,string>, detalle: Array<{ruta, nombre, tipo, tipoNombre}>,
 *            resumen: {ventas?: number, compras?: number}, errores: string[], avisos: string[],
 *            conError: string[], libros: string[] }}
 *   ok = sin errores (los avisos no frenan); conError = tipos de archivo con algún error
 *   libros = los que se cargan ('ventas' / 'compras'): los que tienen algún archivo
 *   archivos = { ventasCbte, ventasAlicuotas, comprasCbte, comprasAlicuotas } → ruta
 */
function validarArchivosIva(rutas, periodo) {
    const errores = [];
    const archivos = {};
    const leidos = (Array.isArray(rutas) ? rutas : []).map(leerArchivo);

    const conError = new Set();
    leidos.forEach(a => {
        errores.push(...a.errores);
        if (a.tipo && a.errores.length) conError.add(a.tipo);
        if (!a.tipo) return;
        if (archivos[a.tipo]) {
            // Con la carpeta: pueden llamarse igual y venir de lugares distintos.
            const conCarpeta = (r) => path.join(path.basename(path.dirname(r)), path.basename(r));
            errores.push(`Hay dos archivos de ${TIPOS[a.tipo].nombre}: ${conCarpeta(archivos[a.tipo])} y ${conCarpeta(a.ruta)}`);
        } else {
            archivos[a.tipo] = a.ruta;
        }
    });
    // Sin ningún archivo reconocido, faltan los 4; si no, solo lo que falta de cada libro empezado.
    const libros = Object.keys(LIBROS).filter(l => archivos[LIBROS[l].cbte] || archivos[LIBROS[l].alicuotas]);
    const faltan = Object.keys(TIPOS).filter(t => !archivos[t] && (libros.length === 0 || libros.includes(TIPOS[t].libro)));
    if (faltan.length) errores.push(`Falta: ${faltan.map(t => TIPOS[t].nombre).join(', ')}`);

    const resumen = {};
    const avisos = [];
    for (const [libro, def] of Object.entries(LIBROS)) {
        const cbte = leidos.find(a => a.ruta === archivos[def.cbte]);
        if (!cbte) continue;
        const r = revisarLibro(def, cbte, leidos.find(a => a.ruta === archivos[def.alicuotas]), periodo);
        errores.push(...r.errores);
        avisos.push(...r.avisos);
        r.conError.forEach(t => conError.add(t));
        resumen[libro] = r.comprobantes;
    }

    const recortados = errores.length > MAX_ERRORES
        ? [...errores.slice(0, MAX_ERRORES), `… y ${errores.length - MAX_ERRORES} error(es) más`]
        : errores;
    return {
        ok: errores.length === 0,
        archivos,
        // En el orden de TIPOS (Ventas antes que Compras), no en el que se eligieron.
        detalle: leidos
            .map(a => ({ ruta: a.ruta, nombre: a.nombre, tipo: a.tipo, tipoNombre: a.tipo ? TIPOS[a.tipo].nombre : null }))
            .sort((x, y) => Object.keys(TIPOS).indexOf(x.tipo) - Object.keys(TIPOS).indexOf(y.tipo)),
        resumen,
        errores: recortados,
        avisos,
        conError: [...conError],
        libros
    };
}

module.exports = { validarArchivosIva, TIPOS, cuitValido };
