#!/usr/bin/env node
/**
 * Exporta a Excel la lista de claves que hay que resolver, para revisarlas en papel/planilla.
 *
 * Una fila por cliente. Entra el que tenga AL MENOS UNA clave pendiente de resolver;
 * si AFIP y ATM están las dos validadas, no aparece.
 *
 * Reglas de la columna clave:
 *   - representado (tiene representanteAfipCuit) -> "REPRESENTADO", no se toca
 *   - sin clave cargada                          -> "FALTA CARGAR"
 *   - con clave                                  -> la clave en texto plano
 *
 * Uso:
 *   node tools/exportar_claves_a_revisar.js [ruta/contribuyentes.json] [salida.xlsx]
 *
 * Por defecto lee el contribuyentes.json del paquete y escribe el .xlsx al lado.
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const ENTRADA_DEFECTO = '/home/pinchechita/Descargas/aaa_gestionCliente/paquete_natalia/datos/contribuyentes.json';

/** Etiquetas legibles para el operador; la clave interna no le dice nada. */
const ETIQUETA_ESTADO = {
    invalido: 'INVÁLIDA',
    requiere_actualizacion: 'REQUIERE ACTUALIZACIÓN',
    pendiente: 'SIN VERIFICAR',
    no_verificado: 'SIN VERIFICAR',
    validado: 'OK',
    no_aplica: 'FALTA CARGAR'
};

/** Color de fondo por etiqueta, para que la planilla se lea de un vistazo. */
const COLOR_ESTADO = {
    'INVÁLIDA': 'FFF4CCCC',
    'FALTA CARGAR': 'FFF4CCCC',
    'REQUIERE ACTUALIZACIÓN': 'FFFCE5CD',
    'SIN VERIFICAR': 'FFFFF2CC',
    'OK': 'FFD9EAD3',
    'REPRESENTADO': 'FFE8E8E8'
};

const vacio = (v) => v == null || String(v).trim() === '';

function leerContribuyentes(ruta) {
    const raw = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    const arr = Array.isArray(raw) ? raw : (raw.contribuyentes || Object.values(raw)[0]);
    if (!Array.isArray(arr)) throw new Error(`No encontré el array de contribuyentes en ${ruta}`);
    return arr;
}

/** grupos.json vive al lado del contribuyentes.json; si no está, la columna Estudio queda vacía. */
function leerGrupos(dirDatos) {
    try {
        const raw = JSON.parse(fs.readFileSync(path.join(dirDatos, 'grupos.json'), 'utf8'));
        const grupos = raw.grupos || raw;
        return new Map(grupos.map((g) => [g.id, g.nombre]));
    } catch {
        return new Map();
    }
}

function nombreCliente(c) {
    if (!vacio(c.razonSocial)) return c.razonSocial;
    if (!vacio(c.nombre)) return c.nombre;
    return `(sin nombre) ${c.cuit || ''}`.trim();
}

/**
 * Devuelve { clave, estado } ya resuelto para una cartera.
 * `esRepresentado` sólo aplica a AFIP: el representado entra con la clave del representante,
 * así que no es una clave rota — es correcto que no tenga.
 */
function celdaClave(claveGuardada, estadoGuardado, esRepresentado) {
    if (esRepresentado) return { clave: 'REPRESENTADO', estado: 'REPRESENTADO' };
    if (vacio(claveGuardada)) return { clave: 'FALTA CARGAR', estado: 'FALTA CARGAR' };
    return { clave: claveGuardada, estado: ETIQUETA_ESTADO[estadoGuardado] || String(estadoGuardado || '').toUpperCase() };
}

function construirFilas(contribuyentes, grupos) {
    const porCuit = new Map(contribuyentes.map((c) => [String(c.cuit), c]));

    const filas = [];
    for (const c of contribuyentes) {
        const esRepresentado = !vacio(c.representanteAfipCuit);
        const afip = celdaClave(c.claveAFIP, c.estado_afip, esRepresentado);
        const atm = celdaClave(c.claveATM, c.estado_atm, false);

        // Sólo interesan las que no están resueltas. "REPRESENTADO" cuenta como resuelto.
        const faltaAfip = afip.estado !== 'OK' && afip.estado !== 'REPRESENTADO';
        const faltaAtm = atm.estado !== 'OK';
        if (!faltaAfip && !faltaAtm) continue;

        const representante = esRepresentado ? porCuit.get(String(c.representanteAfipCuit)) : null;

        filas.push({
            estudio: grupos.get(c.grupoId) || '',
            cliente: nombreCliente(c),
            cuit: String(c.cuit || ''),
            claveAfip: afip.clave,
            estadoAfip: afip.estado,
            claveAtm: atm.clave,
            estadoAtm: atm.estado,
            factura: c.tipoContribuyente || '',
            representadoPor: representante ? nombreCliente(representante) : (esRepresentado ? `CUIT ${c.representanteAfipCuit}` : '')
        });
    }

    filas.sort((a, b) =>
        a.estudio.localeCompare(b.estudio, 'es') || a.cliente.localeCompare(b.cliente, 'es'));
    return filas;
}

function pintarHojaClaves(hoja, filas) {
    hoja.columns = [
        { header: 'Estudio', key: 'estudio', width: 12 },
        { header: 'Cliente / Razón Social', key: 'cliente', width: 38 },
        { header: 'CUIT', key: 'cuit', width: 14 },
        { header: 'Clave AFIP', key: 'claveAfip', width: 20 },
        { header: 'Estado AFIP', key: 'estadoAfip', width: 22 },
        { header: 'Clave ATM', key: 'claveAtm', width: 20 },
        { header: 'Estado ATM', key: 'estadoAtm', width: 22 },
        { header: 'Factura B o C', key: 'factura', width: 13 },
        { header: 'Representado por', key: 'representadoPor', width: 32 }
    ];

    const cabecera = hoja.getRow(1);
    cabecera.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF44546A' } };
    cabecera.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cabecera.height = 28;

    filas.forEach((f) => {
        const fila = hoja.addRow(f);

        // El CUIT es identificador, no número: si Excel lo trata como número pierde ceros y sale en notación científica.
        fila.getCell('cuit').numFmt = '@';
        fila.getCell('cuit').alignment = { horizontal: 'left' };

        for (const [colClave, colEstado] of [['claveAfip', 'estadoAfip'], ['claveAtm', 'estadoAtm']]) {
            const estado = fila.getCell(colEstado).value;
            const color = COLOR_ESTADO[estado];
            if (color) {
                for (const col of [colClave, colEstado]) {
                    fila.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
                }
            }
            // Los placeholders no son claves: en gris e itálica para que nadie los copie como si lo fueran.
            const valorClave = fila.getCell(colClave).value;
            if (valorClave === 'REPRESENTADO' || valorClave === 'FALTA CARGAR') {
                fila.getCell(colClave).font = { italic: true, color: { argb: 'FF808080' } };
            }
        }

        // Columna a completar a mano: fondo celeste para que se note que es editable.
        fila.getCell('factura').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDEEBF7' } };
        fila.getCell('factura').alignment = { horizontal: 'center' };
    });

    hoja.views = [{ state: 'frozen', ySplit: 1 }];
    hoja.autoFilter = { from: 'A1', to: { row: 1, column: hoja.columns.length } };
}

function pintarHojaInstrucciones(hoja, filas, totalClientes, rutaEntrada) {
    hoja.columns = [{ width: 30 }, { width: 70 }];
    const titulo = hoja.addRow(['Cómo usar esta planilla', '']);
    titulo.font = { bold: true, size: 14 };
    hoja.addRow([]);

    const lineas = [
        ['Generada el', new Date().toLocaleString('es-AR')],
        ['Origen', rutaEntrada],
        ['Clientes en el sistema', totalClientes],
        ['Clientes en esta planilla', filas.length],
        ['', ''],
        ['Qué aparece acá', 'Sólo los clientes con al menos una clave sin resolver. Si AFIP y ATM están las dos validadas, el cliente no figura.'],
        ['INVÁLIDA', 'La clave está cargada pero el sistema no pudo entrar con ella. Hay que conseguir la correcta.'],
        ['FALTA CARGAR', 'No hay ninguna clave cargada para esa cartera.'],
        ['SIN VERIFICAR', 'La clave está cargada pero todavía no se probó.'],
        ['REQUIERE ACTUALIZACIÓN', 'AFIP pide cambiar la clave al entrar.'],
        ['REPRESENTADO', 'Ese cliente entra a AFIP con la clave de quien lo representa (ver columna "Representado por"). NO cargar clave propia acá.'],
        ['', ''],
        ['Factura B o C', 'Columna en celeste, para completar a mano con B o C en los clientes que facturan. Viene precargada donde el sistema ya lo tenía.'],
        ['Para corregir una clave', 'Escribir la clave nueva encima de la vieja, en la misma celda.']
    ];

    for (const [etiqueta, texto] of lineas) {
        const fila = hoja.addRow([etiqueta, texto]);
        fila.getCell(1).font = { bold: true };
        fila.getCell(2).alignment = { wrapText: true, vertical: 'top' };
        const color = COLOR_ESTADO[etiqueta];
        if (color) fila.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    }
}

async function main() {
    const rutaEntrada = process.argv[2] || ENTRADA_DEFECTO;
    if (!fs.existsSync(rutaEntrada)) {
        console.error(`No existe el archivo: ${rutaEntrada}`);
        process.exit(1);
    }

    const dirDatos = path.dirname(path.resolve(rutaEntrada));
    const hoy = new Date().toISOString().slice(0, 10);
    const rutaSalida = process.argv[3] || path.join(dirDatos, `claves_a_revisar_${hoy}.xlsx`);

    const contribuyentes = leerContribuyentes(rutaEntrada);
    const grupos = leerGrupos(dirDatos);
    const filas = construirFilas(contribuyentes, grupos);

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Servie C P';
    libro.created = new Date();
    pintarHojaClaves(libro.addWorksheet('Claves a revisar'), filas);
    pintarHojaInstrucciones(libro.addWorksheet('Instrucciones'), filas, contribuyentes.length, rutaEntrada);

    await libro.xlsx.writeFile(rutaSalida);

    const contar = (campo, valor) => filas.filter((f) => f[campo] === valor).length;
    console.log(`\n  Planilla generada: ${rutaSalida}\n`);
    console.log(`  Clientes en el sistema ...... ${contribuyentes.length}`);
    console.log(`  Clientes en la planilla ..... ${filas.length}\n`);
    console.log('  AFIP  inválidas ............. ' + contar('estadoAfip', 'INVÁLIDA'));
    console.log('        falta cargar .......... ' + contar('estadoAfip', 'FALTA CARGAR'));
    console.log('        sin verificar ......... ' + contar('estadoAfip', 'SIN VERIFICAR'));
    console.log('        requiere actualiz. .... ' + contar('estadoAfip', 'REQUIERE ACTUALIZACIÓN'));
    console.log('        representados ......... ' + contar('estadoAfip', 'REPRESENTADO'));
    console.log('  ATM   inválidas ............. ' + contar('estadoAtm', 'INVÁLIDA'));
    console.log('        falta cargar .......... ' + contar('estadoAtm', 'FALTA CARGAR'));
    console.log('        sin verificar ......... ' + contar('estadoAtm', 'SIN VERIFICAR'));
    console.log('  Con B o C ya cargado ........ ' + filas.filter((f) => f.factura).length + '\n');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
