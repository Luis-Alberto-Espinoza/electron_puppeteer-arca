// plantillasExcel/plantillas/resumenConceptosFacturados.js
// Plantilla 1: "Resumen de conceptos facturados" (primer caso: cliente de Vinos).
//
// Entrada: una hoja (normalmente "Datos") con un renglón por ítem facturado.
// Salida: una hoja "Resumen" (o una por mes: "Resumen 2026-08"...) con dos bloques
// (Neto e IVA) de actividad x tipo de comprobante, con fórmulas vivas (SUMIFS,
// COUNTIFS, ROUND) que leen de la hoja de datos y el resultado ya calculado en
// cada celda. Más los bloques de control, que tienen que dar diferencia 0.
//
// Contrato de toda plantilla (mismo patrón que los "especialistas" de tablas PDF):
//   reconocer(libro)   -> ¿es mi archivo? ¿qué cabeceras faltan?  (no modifica nada)
//   transformar(libro) -> agrega las hojas nuevas al libro y devuelve controles.
//                         Si algo no cierra, devuelve ok:false SIN tocar el libro.
// Ver docs/herramientas_archivos/plantillas_excel.md

const {
    valorPlano, buscarCabeceras, calcularPuntaje, letraColumna, refHoja
} = require('../service/cabeceras.js');

const ID = 'resumenConceptosFacturados';
const NOMBRE = 'Resumen de conceptos facturados';
const DESCRIPCION = 'Grilla de conceptos facturados → resumen de Neto e IVA por actividad y tipo de comprobante (ej. Vinos).';

// Cabeceras obligatorias (clave interna -> texto tal como viene en el original).
// Se buscan por nombre normalizado, nunca por posición.
const OBLIGATORIAS = {
    mes: 'Año - mes',
    comprobante: 'Comprobante',
    codigo: 'Conc./Art.',
    actividad: 'Descripción',
    neto: 'Neto Ítem',
    iva: 'IVA Insc. Ítem'
};

// Columnas auxiliares que el resumen necesita para agrupar por tipo de comprobante.
// El original que baja el cliente NO las trae: si faltan, las agregamos nosotros al
// final de la hoja, con las mismas fórmulas que usa el contador. Si ya vienen, se usan.
const AUXILIARES = {
    tipoFcNc: 'Tipo (FC/NC)',
    letra: 'Letra',
    tipo: 'Tipo comprobante'
};

const CABECERAS = { ...OBLIGATORIAS, ...AUXILIARES };

// Nombres por defecto de hoja que se renombran a "Datos", como en el resultado esperado.
const NOMBRE_HOJA_DATOS = 'Datos';
const NOMBRE_HOJA_GENERICO = /^(sheet|hoja)\s*\d*$/i;

// ---- Formato copiado del ejemplo corregido --------------------------------
const FUENTE = 'Calibri';
const FMT_NUM = '#,##0.00;-#,##0.00;-';
const FMT_CANT = '0';
const COLOR_BORDE = { argb: 'FF999999' };
const BORDE = {
    top: { style: 'thin', color: COLOR_BORDE },
    left: { style: 'thin', color: COLOR_BORDE },
    bottom: { style: 'thin', color: COLOR_BORDE },
    right: { style: 'thin', color: COLOR_BORDE }
};
const RELLENO_CABECERA = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
const RELLENO_TOTAL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
const ANCHO_COD = 12;
const ANCHO_ACTIVIDAD = 30;
const ANCHO_NUM = 18;

// Redondeo a centavos sin arrastrar basura de coma flotante (ni -0).
function r2(x) {
    const v = Math.round((x + Number.EPSILON) * 100) / 100;
    return Object.is(v, -0) ? 0 : v;
}

// Excel compara los criterios de SUMIFS sin distinguir mayúsculas: agrupamos igual.
function claveGrupo(v) {
    return String(v).trim().toUpperCase();
}

function vacio(v) {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

// Parte el Comprobante ("FC B 0015 - 00009032") con la MISMA lógica que las fórmulas
// del contador: tipo = LEFT(D, primer espacio), letra = MID(D, primer espacio + 1, 1).
function partirComprobante(comprobante) {
    if (typeof comprobante !== 'string') return null;
    const s = comprobante;
    const i = s.indexOf(' ');
    if (i < 1 || i + 1 >= s.length) return null;
    const tipoFcNc = s.slice(0, i);
    const letra = s.charAt(i + 1);
    return { tipoFcNc, letra, tipo: `${tipoFcNc} ${letra}` };
}

// Si no hay columna "Tipo comprobante" o su celda no trae resultado cacheado
// (archivo guardado por un programa que no calcula), se deriva del Comprobante.
function derivarTipo(comprobante) {
    const p = partirComprobante(comprobante);
    return p ? p.tipo : null;
}

function textoMes(v) {
    if (v instanceof Date) {
        return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    return String(v).trim();
}

// Nombre de hoja válido para Excel (máx 31, sin []:*?/\) y que no choque.
function nombreHojaLibre(libro, base) {
    const limpio = base.replace(/[[\]:*?/\\]/g, '-').slice(0, 31);
    const usados = new Set(libro.worksheets.map(h => h.name.toLowerCase()));
    if (!usados.has(limpio.toLowerCase())) return limpio;
    for (let n = 2; ; n++) {
        const cand = `${limpio.slice(0, 31 - ` (${n})`.length)} (${n})`;
        if (!usados.has(cand.toLowerCase())) return cand;
    }
}

// ---------------------------------------------------------------------------
// reconocer
// ---------------------------------------------------------------------------

/**
 * ¿El libro es una grilla de conceptos facturados? Busca, hoja por hoja, la fila
 * de cabeceras con todas las columnas obligatorias. No modifica el libro.
 * El `puntaje` (0 a 1) es lo que usa el orquestador para elegir plantilla.
 *
 * @param {import('exceljs').Workbook} libro
 * @returns {{ ok: boolean, puntaje: number, mensaje: string, faltantes: string[],
 *             hoja?: import('exceljs').Worksheet, filaCabecera?: number,
 *             columnas?: Object<string,number> }}
 */
function reconocer(libro) {
    // Se buscan TODAS (obligatorias + auxiliares) para ubicar también las auxiliares
    // si vienen, pero solo las obligatorias deciden si el archivo sirve.
    const textosObligatorios = new Set(Object.values(OBLIGATORIAS));
    let mejor = null;
    for (const hoja of libro.worksheets) {
        const r = buscarCabeceras(hoja, CABECERAS);
        r.faltantes = r.faltantes.filter(f => textosObligatorios.has(f));
        if (!mejor || r.faltantes.length < mejor.faltantes.length) mejor = { ...r, hoja };
        if (!r.faltantes.length) break;
    }

    if (!mejor || mejor.filaCabecera === null) {
        return {
            ok: false,
            puntaje: 0,
            faltantes: Object.values(OBLIGATORIAS),
            mensaje: 'Este archivo no parece una grilla de conceptos facturados: no se encontró '
                + 'ninguna de las columnas esperadas (' + Object.values(OBLIGATORIAS).join(', ') + ').'
        };
    }
    const puntaje = calcularPuntaje(OBLIGATORIAS, mejor.faltantes);
    if (mejor.faltantes.length) {
        return {
            ok: false,
            puntaje,
            faltantes: mejor.faltantes,
            hoja: mejor.hoja,
            mensaje: `En la hoja "${mejor.hoja.name}" faltan estas columnas: `
                + mejor.faltantes.map(f => `"${f}"`).join(', ')
                + '. Revisá que el archivo sea el de conceptos facturados y que las cabeceras no hayan cambiado de nombre.'
        };
    }
    return {
        ok: true,
        puntaje,
        faltantes: [],
        hoja: mejor.hoja,
        filaCabecera: mejor.filaCabecera,
        columnas: mejor.columnas,
        mensaje: `Archivo reconocido (hoja "${mejor.hoja.name}").`
    };
}

// ---------------------------------------------------------------------------
// transformar
// ---------------------------------------------------------------------------

// Lee los renglones de datos y junta los problemas que impiden resumir.
function leerRenglones(hoja, filaCabecera, col) {
    const renglones = [];
    const problemas = [];
    let ultimaFila = filaCabecera;

    for (let r = filaCabecera + 1; r <= hoja.rowCount; r++) {
        const fila = hoja.getRow(r);
        const leer = (k) => (col[k] ? valorPlano(fila.getCell(col[k])) : null);
        const mes = leer('mes');
        const comprobante = leer('comprobante');
        const actividad = leer('actividad');
        const neto = leer('neto');
        const iva = leer('iva');

        // Renglón en blanco (o de formato suelto): se ignora.
        if ([mes, comprobante, actividad, neto, iva].every(vacio)) continue;
        ultimaFila = r;

        for (const [k, v] of [['neto', neto], ['iva', iva]]) {
            if (!vacio(v) && typeof v !== 'number') {
                problemas.push(`Fila ${r}: "${CABECERAS[k]}" tiene texto ("${v}") en vez de un número.`);
            }
        }
        if (vacio(mes)) problemas.push(`Fila ${r}: falta "${CABECERAS.mes}".`);

        let tipo = leer('tipo');
        if (vacio(tipo)) tipo = derivarTipo(comprobante);

        renglones.push({
            fila: r,
            mes: vacio(mes) ? null : textoMes(mes),
            mesEsFecha: mes instanceof Date,
            codigo: leer('codigo'),
            actividad: vacio(actividad) ? null : actividad,
            tipo: vacio(tipo) ? null : String(tipo),
            neto: typeof neto === 'number' ? neto : 0,
            iva: typeof iva === 'number' ? iva : 0
        });
    }
    return { renglones, problemas, ultimaFila };
}

// Agrupa los renglones de un mes y calcula los mismos números que van a dar las
// fórmulas en Excel, más los controles.
function calcularMes(mes, renglones) {
    const actividades = new Map(); // clave -> { actividad, codigos:Set }
    const tipos = new Map();       // clave -> texto
    const celdas = new Map();      // `${act}|${tipo}` -> { neto, iva }
    const cantPorTipo = new Map(); // clave tipo -> n
    const sinClasificar = [];
    let totalDatosNeto = 0;
    let totalDatosIva = 0;

    for (const x of renglones) {
        totalDatosNeto += x.neto;
        totalDatosIva += x.iva;
        if (x.tipo) {
            const kt = claveGrupo(x.tipo);
            if (!tipos.has(kt)) tipos.set(kt, x.tipo.trim());
            cantPorTipo.set(kt, (cantPorTipo.get(kt) || 0) + 1);
        }
        if (!x.actividad || !x.tipo) {
            if (x.neto !== 0 || x.iva !== 0) sinClasificar.push(x.fila);
            continue;
        }
        const ka = claveGrupo(x.actividad);
        if (!actividades.has(ka)) actividades.set(ka, { actividad: String(x.actividad), codigos: new Set() });
        if (!vacio(x.codigo)) actividades.get(ka).codigos.add(String(x.codigo).trim());
        const kc = `${ka}|${claveGrupo(x.tipo)}`;
        const c = celdas.get(kc) || { neto: 0, iva: 0 };
        c.neto += x.neto;
        c.iva += x.iva;
        celdas.set(kc, c);
    }

    // Orden estable: actividades por código (y nombre), tipos alfabéticos.
    const cmp = (a, b) => a.localeCompare(b, 'es', { numeric: true });
    const listaAct = [...actividades.entries()]
        .map(([clave, a]) => ({ clave, actividad: a.actividad, codigo: [...a.codigos].sort(cmp).join(' / ') }))
        .sort((a, b) => cmp(a.codigo, b.codigo) || cmp(a.actividad, b.actividad));
    const listaTipos = [...tipos.entries()]
        .map(([clave, texto]) => ({ clave, texto }))
        .sort((a, b) => cmp(a.texto, b.texto));

    let totalResumenNeto = 0;
    let totalResumenIva = 0;
    for (const c of celdas.values()) { totalResumenNeto += c.neto; totalResumenIva += c.iva; }

    return {
        mes,
        actividades: listaAct,
        tipos: listaTipos,
        celdas,
        cantPorTipo,
        sinClasificar,
        controles: [
            { concepto: 'Neto', totalDatos: r2(totalDatosNeto), totalResumen: r2(totalResumenNeto),
              diferencia: r2(r2(totalDatosNeto) - r2(totalResumenNeto)) },
            { concepto: 'IVA', totalDatos: r2(totalDatosIva), totalResumen: r2(totalResumenIva),
              diferencia: r2(r2(totalDatosIva) - r2(totalResumenIva)) }
        ]
    };
}

// Escribe una celda con estilo. `valor` puede ser { formula, result }.
function poner(hoja, dir, valor, estilo = {}) {
    const c = hoja.getCell(dir);
    c.value = valor;
    c.font = { name: FUENTE, size: 12, ...(estilo.font || {}) };
    if (estilo.numFmt) c.numFmt = estilo.numFmt;
    if (estilo.fill) c.fill = estilo.fill;
    if (estilo.border) c.border = estilo.border;
    if (estilo.alignment) c.alignment = estilo.alignment;
    return c;
}

/**
 * Arma la hoja de resumen de un mes. Réplica del layout del ejemplo corregido:
 *   título / fuente / tabla Neto / Cant. de ítems / Control
 *   título / fuente / tabla IVA / Control IVA / Notas
 */
function construirHojaResumen(libro, nombreHoja, datos, ctx) {
    const { hojaDatos, col, desde, hasta, multiMes } = ctx;
    const H = refHoja(hojaDatos.name);
    const rango = (k) => {
        const L = letraColumna(col[k]);
        return `${H}$${L}$${desde}:$${L}$${hasta}`;
    };
    const L = (k) => letraColumna(col[k]);
    // Tercer criterio (solo si el archivo trae varios meses).
    const critMes = multiMes ? `,${rango('mes')},"${datos.mes.replace(/"/g, '""')}"` : '';

    const hoja = libro.addWorksheet(nombreHoja);
    const nTipos = datos.tipos.length;
    const colTipo = (i) => letraColumna(3 + i);     // C, D, E...
    const colTotal = letraColumna(3 + nTipos);      // columna "Total"
    const ultimaColTipo = nTipos ? colTipo(nTipos - 1) : colTotal;

    hoja.columns = [
        { width: ANCHO_COD }, { width: ANCHO_ACTIVIDAD },
        ...datos.tipos.map(() => ({ width: ANCHO_NUM })), { width: ANCHO_NUM }
    ];

    const periodo = multiMes ? ` Período ${datos.mes}.` : '';
    const estNum = { numFmt: FMT_NUM, border: BORDE };
    const estCab = { font: { bold: true }, fill: RELLENO_CABECERA, border: BORDE,
        alignment: { horizontal: 'center', vertical: 'middle' } };
    const estTot = { font: { bold: true }, fill: RELLENO_TOTAL, border: BORDE };

    // Un bloque (Neto o IVA). Devuelve la fila donde quedó y la celda del total general.
    const bloque = (filaInicio, conf) => {
        let f = filaInicio;
        poner(hoja, `A${f}`, conf.titulo, { font: { bold: true, size: 14 } });
        f++;
        poner(hoja, `A${f}`, conf.fuente + periodo, { font: { italic: true, size: 10 } });
        f += 2;

        const filaCab = f;
        poner(hoja, `A${f}`, 'Cód.', estCab);
        poner(hoja, `B${f}`, 'Actividad', estCab);
        datos.tipos.forEach((t, i) => poner(hoja, `${colTipo(i)}${f}`, t.texto, estCab));
        poner(hoja, `${colTotal}${f}`, 'Total', estCab);
        f++;

        const primeraAct = f;
        const totalesCol = datos.tipos.map(() => 0);
        let totalGeneral = 0;
        for (const act of datos.actividades) {
            poner(hoja, `A${f}`, act.codigo, { border: BORDE });
            poner(hoja, `B${f}`, act.actividad, { border: BORDE });
            let totalFila = 0;
            datos.tipos.forEach((t, i) => {
                const celda = datos.celdas.get(`${act.clave}|${t.clave}`);
                const valor = r2(celda ? celda[conf.campo] : 0);
                totalFila += valor;
                totalesCol[i] += valor;
                const ct = colTipo(i);
                poner(hoja, `${ct}${f}`, {
                    formula: `SUMIFS(${rango(conf.campo)},${rango('actividad')},$B${f},${rango('tipo')},${ct}$${filaCab}${critMes})`,
                    result: valor
                }, estNum);
            });
            totalGeneral += totalFila;
            poner(hoja, `${colTotal}${f}`, {
                formula: nTipos ? `SUM(C${f}:${ultimaColTipo}${f})` : '0', result: r2(totalFila)
            }, { ...estNum, font: { bold: true } });
            f++;
        }
        const ultimaAct = f - 1;

        // Fila Total
        const filaTotal = f;
        poner(hoja, `A${f}`, null, estTot);
        poner(hoja, `B${f}`, 'Total', estTot);
        const sumaCol = (letra, result) => ({
            formula: ultimaAct >= primeraAct ? `SUM(${letra}${primeraAct}:${letra}${ultimaAct})` : '0',
            result: r2(result)
        });
        datos.tipos.forEach((t, i) => poner(hoja, `${colTipo(i)}${f}`, sumaCol(colTipo(i), totalesCol[i]),
            { ...estTot, numFmt: FMT_NUM }));
        poner(hoja, `${colTotal}${f}`, sumaCol(colTotal, totalGeneral), { ...estTot, numFmt: FMT_NUM });
        f++;

        // Fila "Cant. de ítems" (solo en el bloque de Neto, como en el ejemplo)
        if (conf.conCantidad) {
            poner(hoja, `A${f}`, null, { border: BORDE });
            poner(hoja, `B${f}`, 'Cant. de ítems', { border: BORDE });
            let totalCant = 0;
            datos.tipos.forEach((t, i) => {
                const n = datos.cantPorTipo.get(t.clave) || 0;
                totalCant += n;
                const ct = colTipo(i);
                poner(hoja, `${ct}${f}`, {
                    formula: `COUNTIFS(${rango('tipo')},${ct}$${filaCab}${critMes})`, result: n
                }, { numFmt: FMT_CANT, border: BORDE });
            });
            poner(hoja, `${colTotal}${f}`, {
                formula: nTipos ? `SUM(C${f}:${ultimaColTipo}${f})` : '0', result: totalCant
            }, { numFmt: FMT_CANT, border: BORDE });
            f++;
        }

        // Control
        f++;
        const control = datos.controles.find(c => c.concepto === conf.concepto);
        poner(hoja, `B${f}`, conf.tituloControl, { font: { bold: true } });
        f++;
        const filaDatos = f;
        poner(hoja, `B${f}`, conf.etiquetaDatos);
        poner(hoja, `${colTotal}${f}`, {
            formula: multiMes
                ? `SUMIFS(${rango(conf.campo)}${critMes})`
                : `SUM(${rango(conf.campo)})`,
            result: control.totalDatos
        }, { numFmt: FMT_NUM });
        f++;
        const filaRes = f;
        poner(hoja, `B${f}`, conf.etiquetaResumen);
        poner(hoja, `${colTotal}${f}`, { formula: `${colTotal}${filaTotal}`, result: r2(totalGeneral) },
            { numFmt: FMT_NUM });
        f++;
        poner(hoja, `B${f}`, 'Diferencia', { font: { bold: true } });
        poner(hoja, `${colTotal}${f}`, {
            formula: `ROUND(${colTotal}${filaDatos}-${colTotal}${filaRes},2)`, result: control.diferencia
        }, { numFmt: FMT_NUM, font: { bold: true } });
        return f;
    };

    let f = bloque(1, {
        campo: 'neto', concepto: 'Neto', conCantidad: true,
        titulo: 'Resumen de Neto Ítem por actividad y tipo de comprobante',
        fuente: `Fuente: hoja ${hojaDatos.name}, columna ${L('neto')} (Neto Ítem). Actividad = columna ${L('actividad')} (Descripción). `
            + `Tipo de comprobante = columna ${L('tipo')} (derivado de la columna ${L('comprobante')}).`,
        tituloControl: 'Control',
        etiquetaDatos: `Total Neto en ${hojaDatos.name} (col. ${L('neto')})`,
        etiquetaResumen: 'Total del resumen'
    });

    f = bloque(f + 2, {
        campo: 'iva', concepto: 'IVA', conCantidad: false,
        titulo: 'Resumen de IVA por actividad y tipo de comprobante',
        fuente: `Fuente: hoja ${hojaDatos.name}, columna ${L('iva')} (IVA Insc. Ítem).`,
        tituloControl: 'Control IVA',
        etiquetaDatos: `Total IVA en ${hojaDatos.name} (col. ${L('iva')})`,
        etiquetaResumen: 'Total del resumen IVA'
    });

    f += 2;
    poner(hoja, `A${f++}`, 'Notas:', { font: { bold: true, size: 10 } });
    poner(hoja, `A${f++}`, '• Las notas de crédito ya vienen con signo negativo en la fuente y se suman tal cual, sin invertir el signo.',
        { font: { italic: true, size: 10 } });
    poner(hoja, `A${f++}`, `• Generado con la plantilla "${NOMBRE}". Actividades y tipos de comprobante salen de los datos; las fórmulas leen de la hoja ${hojaDatos.name}.`,
        { font: { italic: true, size: 10 } });

    return hoja;
}

/**
 * Deja la hoja de datos como la espera el resumen (igual que el resultado esperado
 * del contador): la renombra a "Datos" si tiene un nombre genérico ("Sheet1",
 * "Hoja1") y agrega al final las columnas auxiliares que falten, con fórmulas vivas
 * y su resultado ya calculado. Actualiza `col` con las columnas nuevas.
 * Se llama recién cuando los controles dieron 0.
 */
function completarHojaDatos(libro, hoja, filaCabecera, ultimaFila, col) {
    const libre = !libro.worksheets.some(h => h !== hoja && h.name.toLowerCase() === NOMBRE_HOJA_DATOS.toLowerCase());
    if (NOMBRE_HOJA_GENERICO.test(hoja.name.trim()) && libre) hoja.name = NOMBRE_HOJA_DATOS;

    // Solo hace falta agregar si no está "Tipo comprobante" (la que usa el resumen).
    if (col.tipo) return;

    const filaCab = hoja.getRow(filaCabecera);
    let ultimaCol = 0;
    filaCab.eachCell({ includeEmpty: false }, (_c, n) => { ultimaCol = Math.max(ultimaCol, n); });
    const estiloCabecera = ultimaCol ? { ...filaCab.getCell(ultimaCol).style } : {};

    for (const clave of Object.keys(AUXILIARES)) {
        if (col[clave]) continue;
        col[clave] = ++ultimaCol;
        const celda = filaCab.getCell(col[clave]);
        celda.value = AUXILIARES[clave];
        celda.style = estiloCabecera;
        hoja.getColumn(col[clave]).width = 20;
    }

    const D = letraColumna(col.comprobante);
    const Z = letraColumna(col.tipoFcNc);
    const AA = letraColumna(col.letra);
    for (let r = filaCabecera + 1; r <= ultimaFila; r++) {
        const fila = hoja.getRow(r);
        const partes = partirComprobante(valorPlano(fila.getCell(col.comprobante)));
        if (!partes) continue; // sin comprobante: la fórmula daría #VALUE!, se deja vacía
        const formulas = {
            tipoFcNc: `LEFT(${D}${r},FIND(" ",${D}${r})-1)`,
            letra: `MID(${D}${r},FIND(" ",${D}${r})+1,1)`,
            tipo: `${Z}${r}&" "&${AA}${r}`
        };
        for (const clave of Object.keys(AUXILIARES)) {
            const celda = fila.getCell(col[clave]);
            if (!vacio(valorPlano(celda))) continue; // si la columna ya venía, no se pisa
            celda.value = { formula: formulas[clave], result: partes[clave] };
        }
    }
}

/**
 * Agrega al libro la(s) hoja(s) de resumen. Si algo no cierra, NO toca el libro.
 *
 * @param {import('exceljs').Workbook} libro
 * @returns {{ ok: boolean, mensaje: string, meses?: string[], sufijoNombre?: string,
 *             hojas?: string[], controles?: Array<{mes, concepto, totalDatos, totalResumen, diferencia}>,
 *             problemas?: string[], faltantes?: string[] }}
 */
function transformar(libro) {
    const rec = reconocer(libro);
    if (!rec.ok) return { ok: false, mensaje: rec.mensaje, faltantes: rec.faltantes };

    const { hoja: hojaDatos, filaCabecera, columnas: col } = rec;
    const { renglones, problemas, ultimaFila } = leerRenglones(hojaDatos, filaCabecera, col);

    if (!renglones.length) {
        return { ok: false, mensaje: `La hoja "${hojaDatos.name}" tiene las cabeceras pero no tiene renglones de datos.` };
    }
    if (problemas.length) {
        const muestra = problemas.slice(0, 10);
        if (problemas.length > 10) muestra.push(`… y ${problemas.length - 10} problema(s) más.`);
        return { ok: false, mensaje: 'Hay datos que no se pueden resumir:\n' + muestra.join('\n'), problemas };
    }

    const meses = [...new Set(renglones.map(x => x.mes))].sort();
    const multiMes = meses.length > 1;
    if (multiMes && renglones.some(x => x.mesEsFecha)) {
        return {
            ok: false,
            mensaje: `El archivo trae varios meses (${meses.join(', ')}) y la columna "${CABECERAS.mes}" tiene fechas. `
                + 'Para separar por mes las fórmulas necesitan texto tipo 2026-08.'
        };
    }

    // 1) Calcular todo (sin tocar el libro).
    const porMes = meses.map(mes => calcularMes(mes, multiMes ? renglones.filter(x => x.mes === mes) : renglones));
    const controles = porMes.flatMap(d => d.controles.map(c => ({ mes: d.mes, ...c })));
    const fallidos = controles.filter(c => c.diferencia !== 0);
    if (fallidos.length) {
        const fmt = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const lineas = fallidos.map(c =>
            `Control de ${c.concepto}${multiMes ? ` (${c.mes})` : ''}: total en datos ${fmt(c.totalDatos)}, `
            + `total del resumen ${fmt(c.totalResumen)}, diferencia ${fmt(c.diferencia)}.`);
        const sinClas = [...new Set(porMes.flatMap(d => d.sinClasificar))];
        if (sinClas.length) {
            lineas.push(`Filas con importe pero sin "${CABECERAS.actividad}" o sin "${CABECERAS.tipo}": `
                + sinClas.slice(0, 20).join(', ') + (sinClas.length > 20 ? '…' : '') + '.');
        }
        return { ok: false, mensaje: 'Los controles no dan 0, no se generó el archivo.\n' + lineas.join('\n'), controles };
    }

    // 2) Recién ahora escribir: completar la hoja de datos y agregar las hojas nuevas.
    completarHojaDatos(libro, hojaDatos, filaCabecera, ultimaFila, col);
    const ctx = { hojaDatos, col, desde: filaCabecera + 1, hasta: ultimaFila, multiMes };
    const nuevas = porMes.map(d =>
        construirHojaResumen(libro, nombreHojaLibre(libro, multiMes ? `Resumen ${d.mes}` : 'Resumen'), d, ctx));

    // Las hojas de resumen van primero (como en el ejemplo) y queda activa la primera.
    // Solo se tocan metadatos de vista (qué pestaña está seleccionada), no datos.
    nuevas.forEach((h, i) => { h.orderNo = -nuevas.length + i; });
    for (const h of libro.worksheets) {
        const esNueva = nuevas.includes(h);
        const vista = (h.views && h.views[0]) || {};
        h.views = [{ ...vista, tabSelected: esNueva && h === nuevas[0] }];
    }
    const vistaLibro = (libro.views && libro.views[0]) || {};
    libro.views = [{ ...vistaLibro, activeTab: 0, firstSheet: 0 }];

    const sufijoNombre = multiMes ? `Resumen ${meses[0]} a ${meses[meses.length - 1]}` : `Resumen ${meses[0]}`;
    return {
        ok: true,
        mensaje: `Resumen generado: ${nuevas.length} hoja(s), ${renglones.length} ítems, controles en 0.`,
        meses,
        sufijoNombre,
        hojas: nuevas.map(h => h.name),
        controles
    };
}

module.exports = {
    id: ID,
    nombre: NOMBRE,
    descripcion: DESCRIPCION,
    cabeceras: CABECERAS,
    reconocer,
    transformar
};
