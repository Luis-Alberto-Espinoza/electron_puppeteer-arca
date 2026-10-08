// plantillasExcel/plantillas/totalesDiarios.js
// Plantilla 2: "Totales diarios" (primer caso: cliente Landes).
//
// Entrada: el Excel mensual de ventas que carga el cliente a mano, en uno de dos formatos:
//   Columnas por día: fila de títulos "Sábado 1/8/2026" | "Lunes 3/8/2026" | ... y
//                     debajo de cada título los montos de ese día.
//   Pares:            pares de columnas FECHA | IMPORTE (separados por una columna
//                     vacía), uno por día. La fecha puede venir solo arriba.
// Salida (mismo libro, archivo nuevo "<original> - procesado.xlsx"):
//   Avisos  (solo si hay algo que avisar)
//   Totales FECHA | MONTO, una fila por día
//   Datos   la hoja original, al final, con las celdas sospechosas marcadas
//
// Reglas:
//  - Las columnas se reconocen por nombre (sinónimos), nunca por posición.
//  - El orden día/mes se deduce por archivo (ver service/fechas.js); si es
//    ambiguo no se genera nada.
//  - En el formato de pares, la fecha de cada bloque es la que más se repite en
//    su columna: una fecha distinta dentro del bloque se avisa pero se suma al día
//    del bloque.
//  - Los montos nunca se corrigen solos (ver service/anomalias.js).
//  - Si no se puede armar la tabla, devuelve ok:false SIN tocar el libro.
// Ver docs/herramientas_archivos/plantillas_excel.md

const { valorPlano, esFormula, normalizarCabecera, calcularPuntaje } = require('../service/cabeceras.js');
const { leerMonto, r2 } = require('../service/montos.js');
const {
    leerFechaCruda, interpretar, deducirMes, resolverFechas, moda, claveFecha, textoFecha, aDate
} = require('../service/fechas.js');
const { detectarAnomalias } = require('../service/anomalias.js');
const {
    marcarEstado, estilizarTabla, FMT_FECHA, FMT_MONTO_MILES, FONT_ENCABEZADO, FILL_ENCABEZADO, BORDE_FINO
} = require('../../tablasPdf/motor/utils/estilosExcel.js');

const ID = 'totalesDiarios';
const NOMBRE = 'Totales diarios';
const DESCRIPCION = 'Ventas diarias cargadas a mano → total por día, con avisos de posibles errores de carga (ej. Landes).';
const COLOR = '#a4532a';   // terracota (antes verde: se confundía con ATM)
const ICONO = '📅';

// Sinónimos de cabecera, comparados ya normalizados (sin tildes, minúsculas).
const SINONIMOS_FECHA = ['fecha', 'dia', 'fecha venta', 'fecha de venta', 'fec'];
const SINONIMOS_IMPORTE = ['importe', 'monto', 'total', 'venta', 'ventas', 'valor', 'precio', '$'];
// Para el puntaje del orquestador (formato de pares).
const OBLIGATORIAS = { fecha: 'FECHA', importe: 'IMPORTE' };

const FILAS_A_REVISAR = 10;
const MIN_TITULOS = 3;   // títulos con fecha para reconocer el formato de columnas por día
// Anchos de la hoja Datos: el mínimo es el ancho base que traían los Excel del cliente.
const ANCHO_MINIMO = 10;
const MARGEN_ANCHO = 2;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
    'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ETIQUETA_NIVEL = { error: 'Grave', aviso: 'Revisar', info: 'Info' };
const ORDEN_NIVEL = { error: 0, aviso: 1, info: 2 };

function tipoCabecera(valor) {
    const n = normalizarCabecera(valor);
    if (!n) return null;
    if (SINONIMOS_FECHA.includes(n)) return 'fecha';
    if (SINONIMOS_IMPORTE.includes(n)) return 'importe';
    return null;
}

function direccion(hoja, fila, col) {
    return hoja.getRow(fila).getCell(col).address;
}

// Nombre de hoja válido para Excel (máx 31, sin []:*?/\) y que no choque.
function nombreHojaLibre(libro, base, salvo = null) {
    const limpio = base.replace(/[[\]:*?/\\]/g, '-').slice(0, 31);
    const usados = new Set(libro.worksheets.filter(h => h !== salvo).map(h => h.name.toLowerCase()));
    if (!usados.has(limpio.toLowerCase())) return limpio;
    for (let n = 2; ; n++) {
        const cand = `${limpio.slice(0, 31 - ` (${n})`.length)} (${n})`;
        if (!usados.has(cand.toLowerCase())) return cand;
    }
}

// ---------------------------------------------------------------------------
// Detección de formato (no modifica nada)
// ---------------------------------------------------------------------------

/**
 * Formato de pares: busca la fila de cabeceras con más pares FECHA|IMPORTE
 * (en cualquier orden, contando solo celdas no vacías: la columna vacía del medio
 * no molesta).
 */
function detectarPares(hoja) {
    let mejor = { pares: [], filaCabecera: null, hayFecha: false, hayImporte: false };
    const tope = Math.min(hoja.rowCount || 0, FILAS_A_REVISAR);
    for (let r = 1; r <= tope; r++) {
        const celdas = [];
        hoja.getRow(r).eachCell({ includeEmpty: false }, (c, col) => {
            const v = valorPlano(c);
            if (v === null || (typeof v === 'string' && !v.trim())) return;
            celdas.push({ col, tipo: tipoCabecera(v) });
        });
        const pares = [];
        for (let i = 0; i < celdas.length - 1; i++) {
            const a = celdas[i];
            const b = celdas[i + 1];
            if (a.tipo && b.tipo && a.tipo !== b.tipo) {
                const [f, m] = a.tipo === 'fecha' ? [a, b] : [b, a];
                pares.push({ colFecha: f.col, colImporte: m.col });
                i++;
            }
        }
        const hayFecha = celdas.some(c => c.tipo === 'fecha');
        const hayImporte = celdas.some(c => c.tipo === 'importe');
        const puntos = pares.length * 10 + hayFecha + hayImporte;
        const puntosMejor = mejor.pares.length * 10 + mejor.hayFecha + mejor.hayImporte;
        if (puntos > puntosMejor) mejor = { pares, filaCabecera: r, hayFecha, hayImporte };
    }
    return mejor;
}

/**
 * Formato de columnas por día: una fila con al menos MIN_TITULOS fechas y ningún
 * monto (así no se confunde con una fila de datos del formato de pares).
 */
function detectarColumnas(hoja) {
    const tope = Math.min(hoja.rowCount || 0, FILAS_A_REVISAR);
    for (let r = 1; r <= tope; r++) {
        const titulos = [];
        let hayNumeros = false;
        hoja.getRow(r).eachCell({ includeEmpty: false }, (c, col) => {
            const v = valorPlano(c);
            const cruda = leerFechaCruda(v);
            if (cruda && !(typeof v === 'number')) titulos.push({ col, cruda });
            else if (typeof v === 'number') hayNumeros = true;
        });
        if (titulos.length >= MIN_TITULOS && !hayNumeros) return { filaTitulos: r, titulos };
    }
    return null;
}

/**
 * ¿El libro es una planilla de ventas diarias? Elige la hoja con más días.
 * @param {import('exceljs').Workbook} libro
 */
function reconocer(libro) {
    let mejor = null;
    for (const hoja of libro.worksheets) {
        const pares = detectarPares(hoja);
        let r;
        if (pares.pares.length) {
            r = { formato: 'pares', hoja, filaCabecera: pares.filaCabecera, bloques: pares.pares, faltantes: [] };
        } else {
            const columnas = detectarColumnas(hoja);
            if (columnas) {
                r = { formato: 'columnas', hoja, filaCabecera: columnas.filaTitulos, bloques: columnas.titulos, faltantes: [] };
            } else {
                const faltantes = [];
                if (!pares.hayFecha) faltantes.push(OBLIGATORIAS.fecha);
                if (!pares.hayImporte) faltantes.push(OBLIGATORIAS.importe);
                if (!faltantes.length) faltantes.push(OBLIGATORIAS.fecha); // están, pero no forman pares
                r = { formato: null, hoja, bloques: [], faltantes };
            }
        }
        if (!mejor || r.bloques.length > mejor.bloques.length
            || (!mejor.bloques.length && r.faltantes.length < mejor.faltantes.length)) mejor = r;
    }

    if (!mejor || !mejor.bloques.length) {
        const faltantes = mejor ? mejor.faltantes : Object.values(OBLIGATORIAS);
        return {
            ok: false,
            puntaje: calcularPuntaje(OBLIGATORIAS, faltantes),
            faltantes,
            mensaje: 'Este archivo no parece una planilla de ventas diarias: no tiene pares de columnas '
                + 'FECHA | IMPORTE ni una fila de títulos con fechas ("Lunes 3/8/2026").'
        };
    }
    return {
        ok: true,
        puntaje: 1,
        faltantes: [],
        ...mejor,
        mensaje: `Archivo reconocido (hoja "${mejor.hoja.name}", ${mejor.bloques.length} días).`
    };
}

// ---------------------------------------------------------------------------
// Lectura de bloques
// ---------------------------------------------------------------------------

// Lee los montos de una columna desde la fila `desde`. Junta avisos y marcas.
function leerMontosColumna(hoja, col, desde, ctx) {
    const tickets = [];
    for (let r = desde; r <= hoja.rowCount; r++) {
        const celda = hoja.getRow(r).getCell(col);
        if (esFormula(celda) && /SUM|SUMA/i.test(celda.formula || '')) {
            ctx.avisos.push({ nivel: 'info', tipo: 'formula', celda: celda.address,
                mensaje: `La celda ${celda.address} es una fórmula de suma (${celda.formula}); no se cuenta como venta.` });
            continue;
        }
        const m = leerMonto(valorPlano(celda));
        if (m.vacio) continue;
        if (m.error) {
            ctx.avisos.push({ nivel: 'error', tipo: 'monto', celda: celda.address,
                mensaje: `Celda ${celda.address}: ${m.error}. No se sumó.` });
            ctx.marcas.push({ celda: celda.address, estado: 'error', nota: `No se sumó: ${m.error}.` });
            continue;
        }
        tickets.push({ monto: m.monto, celda: celda.address, fila: r });
    }
    return tickets;
}

// Montos en columnas que no son de ningún bloque: no se pueden asignar a un día.
function montosHuerfanos(hoja, desde, columnasUsadas) {
    const huerfanos = [];
    for (let r = desde; r <= hoja.rowCount; r++) {
        hoja.getRow(r).eachCell({ includeEmpty: false }, (c, col) => {
            if (columnasUsadas.has(col)) return;
            const m = leerMonto(valorPlano(c));
            if (m.monto !== undefined && !(valorPlano(c) instanceof Date)) huerfanos.push(c.address);
        });
    }
    return huerfanos;
}

function leerBloquesColumnas(hoja, rec, ctx) {
    return rec.bloques.map(({ col, cruda }) => ({
        col,
        cruda,
        celdaFecha: direccion(hoja, rec.filaCabecera, col),
        fechasFila: [],
        tickets: leerMontosColumna(hoja, col, rec.filaCabecera + 1, ctx)
    }));
}

const claveCruda = c => `${c.origen}|${c.u}|${c.v}|${c.anio}|${c.anioRaro || ''}`;

function leerBloquesPares(hoja, rec, ctx) {
    const bloques = [];
    for (const { colFecha, colImporte } of rec.bloques) {
        const fechasFila = [];
        for (let r = rec.filaCabecera + 1; r <= hoja.rowCount; r++) {
            const celda = hoja.getRow(r).getCell(colFecha);
            const v = valorPlano(celda);
            if (v === null || (typeof v === 'string' && !v.trim())) continue;
            fechasFila.push({ celda: celda.address, cruda: leerFechaCruda(v), texto: String(v).trim() });
        }
        const tickets = leerMontosColumna(hoja, colImporte, rec.filaCabecera + 1, ctx);
        const legibles = fechasFila.filter(f => f.cruda);
        const cab = direccion(hoja, rec.filaCabecera, colFecha);
        if (!legibles.length) {
            if (tickets.length) ctx.errores.push(`La columna de fecha ${cab} no tiene ninguna fecha legible y su importe tiene montos.`);
            continue;
        }
        // La fecha del bloque es la más repetida en su columna.
        const m = moda(legibles.map(f => claveCruda(f.cruda)));
        if (!m) {
            ctx.errores.push(`La columna de fecha ${cab} tiene fechas distintas en igual cantidad; `
                + 'no se puede saber de qué día es. Corregila en el Excel.');
            continue;
        }
        const representante = legibles.find(f => claveCruda(f.cruda) === m.valor);
        bloques.push({ col: colFecha, cruda: representante.cruda, celdaFecha: representante.celda, fechasFila, tickets });
    }
    return bloques;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

// Marca una celda sin afectar a otras: exceljs comparte el objeto de estilo entre
// celdas leídas del archivo, así que se lo copia antes de pintar.
function marcarCelda(celda, estado, nota) {
    celda.style = { ...celda.style };
    if (estado !== 'info') marcarEstado(celda, estado);
    if (nota) {
        const previa = typeof celda.note === 'string' ? celda.note : (celda.note && celda.note.texts
            ? celda.note.texts.map(t => t.text).join('') : '');
        celda.note = previa ? `${previa}\n${nota}` : nota;
    }
}

// Ancho (en caracteres) de lo que SE VE en una celda con el formato del cliente:
// "01/09/2026", "$ 11.700,00". Aproximado, alcanza para que no aparezca "###".
function anchoMostrado(celda) {
    const v = valorPlano(celda);
    if (v === null || v === undefined) return 0;
    const fmt = celda.numFmt || '';
    if (v instanceof Date || (typeof v === 'number' && /[dmy]{2}/i.test(fmt) && !/0/.test(fmt))) return 10;
    if (typeof v === 'number') {
        const digitos = Math.trunc(Math.abs(v)).toString().length;
        let ancho = digitos + (v < 0 ? 1 : 0);
        if (/#,##0/.test(fmt)) ancho += Math.floor((digitos - 1) / 3);
        if (/0\.0/.test(fmt)) ancho += 3;
        if (/\$/.test(fmt)) ancho += 3;
        return ancho;
    }
    return Math.min(String(v).length, 40);
}

/**
 * Deja la hoja original legible:
 *  - Cabecera: si no trae color propio, el mismo estilo que Totales. Si el cliente
 *    ya la pintó (los MITRE vienen con color), se respeta.
 *  - Anchos: exceljs pierde el ancho base de columnas de la hoja (baseColWidth) y
 *    las columnas sin ancho propio quedan angostas ("###" en las fechas). Se
 *    ensancha cada columna con contenido hasta que entre; nunca se achica.
 * Se llama ANTES de marcar las celdas sospechosas, así esas marcas quedan arriba.
 */
function prepararHojaDatos(hoja, filaCabecera) {
    hoja.getRow(filaCabecera).eachCell({ includeEmpty: false }, (celda) => {
        if (celda.fill && celda.fill.type === 'pattern' && celda.fill.pattern === 'solid') return;
        celda.style = {
            ...celda.style,
            font: FONT_ENCABEZADO,
            fill: FILL_ENCABEZADO,
            border: BORDE_FINO,
            alignment: { horizontal: 'center', vertical: 'middle' }
        };
    });

    const necesario = new Map();   // columna -> ancho
    hoja.eachRow({ includeEmpty: false }, (fila) => {
        fila.eachCell({ includeEmpty: false }, (celda, col) => {
            necesario.set(col, Math.max(necesario.get(col) || 0, anchoMostrado(celda)));
        });
    });
    for (const [col, ancho] of necesario) {
        const columna = hoja.getColumn(col);
        const deseado = Math.max(ancho + MARGEN_ANCHO, ANCHO_MINIMO);
        if (!columna.width || columna.width < deseado) columna.width = deseado;
    }
}

function construirTotales(libro, dias, avisosPorDia) {
    const hoja = libro.addWorksheet(nombreHojaLibre(libro, 'Totales'));
    hoja.addRow(['FECHA', 'MONTO']);
    for (const d of dias) {
        const fila = hoja.addRow([aDate(d.fecha), d.total]);
        fila.getCell(1).numFmt = FMT_FECHA;
        fila.getCell(2).numFmt = FMT_MONTO_MILES;
        const propios = (avisosPorDia.get(claveFecha(d.fecha)) || []).filter(a => a.nivel !== 'info');
        if (!propios.length) continue;
        const estado = propios.some(a => a.nivel === 'error') ? 'error' : 'aviso';
        marcarCelda(fila.getCell(1), estado);
        marcarCelda(fila.getCell(2), estado, propios.map(a => a.mensaje).join('\n'));
    }
    estilizarTabla(hoja, { fmtMonto: FMT_MONTO_MILES });
    return hoja;
}

function construirAvisos(libro, avisos) {
    const hoja = libro.addWorksheet(nombreHojaLibre(libro, 'Avisos'));
    hoja.addRow(['NIVEL', 'FECHA', 'CELDA', 'DETALLE']);
    for (const a of avisos) {
        const fila = hoja.addRow([ETIQUETA_NIVEL[a.nivel], a.fecha ? aDate(a.fecha) : null, a.celda || null, a.mensaje]);
        fila.getCell(2).numFmt = FMT_FECHA;
        if (a.nivel !== 'info') [1, 2, 3, 4].forEach(c => marcarEstado(fila.getCell(c), a.nivel, { destacar: c === 1 }));
    }
    estilizarTabla(hoja);
    hoja.getColumn(4).width = 110;
    return hoja;
}

// ---------------------------------------------------------------------------
// transformar
// ---------------------------------------------------------------------------

/**
 * Agrega Avisos (si hace falta) y Totales, y deja la original como "Datos" al final.
 * Si no se puede armar la tabla, NO toca el libro.
 *
 * @param {import('exceljs').Workbook} libro
 * @returns {{ ok: boolean, mensaje: string, sufijoNombre?: string, hojas?: string[],
 *   meses?: string[], controles?: object[], avisos?: object[], faltantes?: string[] }}
 */
function transformar(libro) {
    const rec = reconocer(libro);
    if (!rec.ok) return { ok: false, mensaje: rec.mensaje, faltantes: rec.faltantes };
    const { hoja } = rec;

    const ctx = { avisos: [], marcas: [], errores: [] };
    const bloques = rec.formato === 'pares' ? leerBloquesPares(hoja, rec, ctx) : leerBloquesColumnas(hoja, rec, ctx);

    const usadas = new Set(rec.formato === 'pares'
        ? rec.bloques.flatMap(b => [b.colFecha, b.colImporte])
        : rec.bloques.map(b => b.col));
    const huerfanos = montosHuerfanos(hoja, rec.filaCabecera + 1, usadas);
    if (huerfanos.length) {
        ctx.errores.push(`Hay montos fuera de las columnas de los días (${huerfanos.slice(0, 8).join(', ')}`
            + `${huerfanos.length > 8 ? '…' : ''}): no se sabe de qué día son.`);
    }
    if (!bloques.length && !ctx.errores.length) ctx.errores.push('No se encontró ningún día con fecha.');
    if (ctx.errores.length) return { ok: false, mensaje: ctx.errores.join('\n') };

    // Fechas: orden día/mes, mes del archivo y fecha de cada bloque.
    const deduccion = deducirMes(bloques.map(b => b.cruda));
    if (!deduccion.ok) return { ok: false, mensaje: deduccion.mensaje };
    const resueltas = resolverFechas(bloques.map(b => b.cruda), deduccion);
    const errores = resueltas.filter(r => r.error).map(r => r.error);
    if (errores.length) return { ok: false, mensaje: errores.join('\n') };

    const dias = new Map();   // clave -> { fecha, total, celdas: [] }
    const tickets = [];
    bloques.forEach((b, i) => {
        const { fecha, correccion, aviso } = resueltas[i];
        const clave = claveFecha(fecha);
        for (const msg of [correccion, aviso].filter(Boolean)) {
            ctx.avisos.push({ nivel: 'aviso', tipo: 'fecha', fecha, celda: b.celdaFecha, mensaje: msg });
            ctx.marcas.push({ celda: b.celdaFecha, estado: 'aviso', nota: msg });
        }
        // Formato de pares: fechas del bloque distintas de la del bloque.
        for (const f of b.fechasFila) {
            const lectura = f.cruda ? interpretar(f.cruda, deduccion.orientaciones[f.cruda.origen]) : null;
            if (f.cruda && claveCruda(f.cruda) === claveCruda(b.cruda)) continue;
            if (lectura && claveFecha(lectura) === clave) continue;
            const msg = `${f.celda} dice "${lectura ? textoFecha(lectura) : f.texto}" pero la columna es del `
                + `${textoFecha(fecha)}; se sumó al ${textoFecha(fecha)}.`;
            ctx.avisos.push({ nivel: 'aviso', tipo: 'fecha', fecha, celda: f.celda, mensaje: msg });
            ctx.marcas.push({ celda: f.celda, estado: 'aviso', nota: msg });
        }

        if (!dias.has(clave)) dias.set(clave, { fecha, total: 0, celdas: [] });
        const dia = dias.get(clave);
        dia.celdas.push(b.celdaFecha);
        for (const t of b.tickets) {
            dia.total += t.monto;
            tickets.push({ ...t, fecha });
        }
    });

    const listaDias = [...dias.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, d]) => ({ ...d, total: r2(d.total) }));
    for (const d of listaDias) {
        if (d.celdas.length > 1) {
            ctx.avisos.push({ nivel: 'aviso', tipo: 'fecha', fecha: d.fecha, celda: d.celdas.join(', '),
                mensaje: `El ${textoFecha(d.fecha)} aparece en más de una columna (${d.celdas.join(', ')}); se sumaron.` });
        }
    }

    const anomalias = detectarAnomalias({ anio: deduccion.anio, mes: deduccion.mes, dias: listaDias, tickets });
    for (const a of anomalias) {
        if (a.tipo === 'ticket') ctx.marcas.push({ celda: a.celda, estado: 'error', nota: a.mensaje });
    }
    const avisos = [...ctx.avisos, ...anomalias].sort((a, b) =>
        ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]
        || (a.fecha ? claveFecha(a.fecha) : '').localeCompare(b.fecha ? claveFecha(b.fecha) : ''));

    // Controles: lo leído contra lo que quedó en la tabla.
    const totalDatos = r2(tickets.reduce((s, t) => s + t.monto, 0));
    const totalResumen = r2(listaDias.reduce((s, d) => s + d.total, 0));
    const controles = [{ concepto: 'Total del mes', totalDatos, totalResumen, diferencia: r2(totalDatos - totalResumen) }];

    // ---- A partir de acá se modifica el libro ----
    const avisosPorDia = new Map();
    for (const a of avisos) {
        if (!a.fecha) continue;
        const k = claveFecha(a.fecha);
        if (!avisosPorDia.has(k)) avisosPorDia.set(k, []);
        avisosPorDia.get(k).push(a);
    }
    prepararHojaDatos(hoja, rec.filaCabecera);
    for (const m of ctx.marcas) marcarCelda(hoja.getCell(m.celda), m.estado, m.nota);

    const nombreOriginal = hoja.name;
    hoja.name = nombreHojaLibre(libro, 'Datos', hoja);
    const hojaTotales = construirTotales(libro, listaDias, avisosPorDia);
    const hojaAvisos = avisos.length ? construirAvisos(libro, avisos) : null;

    // Orden: Avisos, Totales, Datos y después cualquier otra hoja que tuviera el libro.
    const otras = libro.worksheets.filter(h => ![hojaAvisos, hojaTotales, hoja].includes(h));
    [hojaAvisos, hojaTotales, hoja, ...otras].filter(Boolean).forEach((h, i) => {
        h.orderNo = i;
        h.views = (h.views && h.views.length ? h.views : [{}]).map(v => ({ ...v, tabSelected: i === 0 }));
    });
    libro.views = (libro.views && libro.views.length ? libro.views : [{}])
        .map(v => ({ ...v, activeTab: 0, firstSheet: 0 }));

    const cuenta = n => avisos.filter(a => a.nivel === n).length;
    const partes = [];
    if (cuenta('error')) partes.push(`${cuenta('error')} grave(s)`);
    if (cuenta('aviso')) partes.push(`${cuenta('aviso')} a revisar`);
    if (cuenta('info')) partes.push(`${cuenta('info')} informativo(s)`);
    const mesTexto = `${MESES[deduccion.mes - 1]} ${deduccion.anio}`;
    return {
        ok: true,
        mensaje: `${mesTexto[0].toUpperCase()}${mesTexto.slice(1)}: ${listaDias.length} días, `
            + `total ${totalResumen.toLocaleString('es-AR', { minimumFractionDigits: 2 })}. `
            + (partes.length ? `Avisos: ${partes.join(', ')}.` : 'Sin avisos.')
            + (nombreOriginal !== hoja.name ? ` La hoja "${nombreOriginal}" pasó a llamarse "${hoja.name}".` : ''),
        sufijoNombre: 'procesado',
        hojas: [hojaAvisos, hojaTotales, hoja].filter(Boolean).map(h => h.name),
        meses: [`${deduccion.anio}-${String(deduccion.mes).padStart(2, '0')}`],
        controles,
        avisos: avisos.map(a => ({
            nivel: a.nivel,
            fecha: a.fecha ? textoFecha(a.fecha) : null,
            celda: a.celda || null,
            mensaje: a.mensaje
        }))
    };
}

module.exports = {
    id: ID,
    nombre: NOMBRE,
    descripcion: DESCRIPCION,
    color: COLOR,
    icono: ICONO,
    reconocer,
    transformar
};
