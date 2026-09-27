const path = require('path');
const ExcelJS = require('exceljs');

// ============================================================================
//  ESPECIALISTA: Banco Galicia (Galicia Más Empresas) — Resumen de Cuentas
//  Modo B: arma el workbook con ExcelJS y lo escribe junto al PDF original.
//
//  Características del documento:
//    - Multi-cuenta: cada cuenta abre con "<PRODUCTO> ... NRO. <nro>" seguido de
//      "- DETALLE DE OPERACIONES -" y cierra con "- SALDO FINAL".
//    - Montos en formato US (coma de miles, punto decimal): 1,234,567.89
//    - Cada operación arranca con un guion "-" en x≈79. Las líneas siguientes
//      sin guion son continuación de la descripción (BCO:, ORIGINANTE:, C*...).
//    - La fecha viene como DD-MMM solo en el primer movimiento del día.
//    - Bloques de resumen al final: RESUMEN DE ACUERDOS, DETALLE DE IMPUESTOS,
//      IMPUESTOS LIQUIDADOS POR DEBITOS, CUOTAS DE PRESTAMOS, COMPOSICION DE
//      CUOTAS, CONCEPTOS PENDIENTES DE COBRO.
// ============================================================================

const MESES = {
    ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
    JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12
};

// Layout de la tabla de movimientos. Columnas izquierdas por X de inicio,
// columnas de montos (alineadas a la derecha) por borde derecho (x + width).
const COL = {
    FECHA:    { min: 40,  max: 78  },
    // guion marcador de operación en x≈79
    DESC:     { min: 84,  max: 200 },
    // El NRO de referencia viene alineado a la derecha: en el extracto los 155
    // movimientos lo terminan en x=222.6, pero arranca en 202.2 si tiene 5
    // dígitos y en 189.9 si tiene 8 (p. ej. el NRO de un CHEQUE DE CAJA). Por
    // eso se reconoce por el borde derecho: filtrarlo por el x de inicio dejaba
    // los de 8 dígitos por debajo del corte y se colaban en la descripción.
    // El margen es amplio porque la descripción nunca pasa de x=173.5.
    NRO_END:  222.6,
    NRO_TOL:  12,
    DEB_END:  330,   // borde derecho < 330  -> DEBITO
    CRE_END:  420    // 330 <= borde < 420   -> CREDITO ; >= 420 -> SALDO
};

// --- Helpers de importes (formato US: 1,234,567.89 / .59 / -1,234.56) ---
function esImporte(str) {
    if (!str) return false;
    const s = str.trim();
    return /^-?\d{1,3}(,\d{3})*\.\d{2}$/.test(s) || /^-?\.\d{2}$/.test(s);
}

function parsearMonto(str) {
    if (typeof str === 'number') return str;
    if (typeof str !== 'string' || !str.trim()) return '';
    const s = str.trim();
    const neg = s.startsWith('-');
    const limpio = s.replace(/^-/, '').replace(/,/g, '');
    const num = parseFloat(limpio);
    if (isNaN(num)) return str;
    return neg ? -num : num;
}

function parsearNro(str) {
    if (typeof str !== 'string' || !str.trim()) return '';
    const s = str.trim();
    if (/^\d+$/.test(s)) return s; // se mantiene como string para conservar ceros a la izquierda
    return s;
}

// Convierte "05-MAR" a un objeto Date usando el año del período del extracto.
function fechaAObjeto(ddMmm, anio) {
    const m = /^(\d{2})-([A-Z]{3})$/.exec(ddMmm.trim());
    if (!m) return null;
    const dia = parseInt(m[1], 10);
    const mes = MESES[m[2]];
    if (!mes || !anio) return null;
    // Se construye en UTC a propósito: ExcelJS serializa el instante absoluto
    // del Date, así que un new Date(a, m, d) local terminaba guardado como las
    // 03:00 del día correcto (UTC-3). Con Date.UTC queda la medianoche justa.
    return new Date(Date.UTC(anio, mes - 1, dia));
}

// Normaliza una fila cruda a items {texto, x, end}, filtrando vacíos.
function filaAItems(fila) {
    return fila.items
        .map(it => ({
            texto: (it.str || '').trim(),
            x: it.transform[4],
            end: it.transform[4] + (it.width || 0)
        }))
        .filter(it => it.texto);
}

function textoFila(items) {
    return items.map(it => it.texto).join(' ').replace(/\s+/g, ' ').trim();
}

// Agrupa items en celdas según los huecos horizontales. Se usa solo como
// FALLBACK para bloques de resumen sin layout declarado: al partir por huecos,
// una columna vacía desplaza todo lo que sigue hacia la izquierda y los datos
// quedan bajo el encabezado equivocado. Los bloques conocidos se resuelven con
// LAYOUTS_SECCION / distribuirEnColumnas, que sí respetan las celdas vacías.
function agruparEnCeldas(items, gap = 9) {
    const orden = [...items].sort((a, b) => a.x - b.x);
    const celdas = [];
    let actual = null;
    for (const it of orden) {
        if (actual && it.x - actual.end <= gap) {
            actual.texto += ' ' + it.texto;
            actual.end = Math.max(actual.end, it.end);
        } else {
            actual = { texto: it.texto, x: it.x, end: it.end };
            celdas.push(actual);
        }
    }
    return celdas.map(c => c.texto.replace(/\s+/g, ' ').trim());
}

// ============================================================================
//  COLUMNAS POSICIONALES PARA LOS BLOQUES DE RESUMEN
//
//  Los bloques finales del extracto son tablas con celdas vacías (p. ej. la
//  línea "OTRO" de COMPOSICION DE CUOTAS no trae CAPITAL ni OT.IMP.C.BIEN).
//  Por eso no se pueden partir por huecos: hay que ubicar cada token en su
//  columna por coordenada.
//
//  Cada columna declara:
//    nombre : rótulo tal como aparece en el PDF (se busca en la fila de
//             encabezado para tomar la coordenada real; si no se encuentra,
//             se usa el x/end de respaldo medido sobre el extracto de muestra).
//    align  : 'der' para columnas de importes (el PDF los alinea a la derecha,
//             así que se ubican por su borde derecho) e 'izq' para las de texto
//             (se ubican por su borde izquierdo).
// ============================================================================

// Margen para dar por buena la alineación de un importe con el borde derecho
// de su columna. 25pt cubre el desvío real máximo observado (20,5pt) y queda
// por debajo del salto entre columnas contiguas (>32pt), que es lo que evita
// que un valor se cuele en la columna vecina.
const TOL_DER = 25;
// Margen para aceptar un rótulo que arranca apenas a la derecha del dato.
const TOL_IZQ = 6;

const LAYOUTS_SECCION = {
    ACUERDOS: [[
        { nombre: 'PRODUCTO',      align: 'izq', x: 46.6,  end: 79.4 },
        { nombre: 'NRO. CUENTA',   align: 'der', x: 161.2, end: 206.3 },
        { nombre: 'ACUERDO',       align: 'der', x: 263.6, end: 292.2, num: 'US' },
        { nombre: 'TNA',           align: 'izq', x: 329.1, end: 341.4, num: 'US' },
        { nombre: 'ALTA ACUERDO',  align: 'izq', x: 374.1, end: 423.2 },
        { nombre: 'VENC. ACUERDO', align: 'izq', x: 439.6, end: 492.8 }
    ]],
    IMP_LIQUIDADOS: [[
        { nombre: 'CUENTA',               align: 'izq', x: 46.6,  end: 71.2 },
        { nombre: 'DESCRIPCION-PRODUCTO', align: 'izq', x: 108.0, end: 189.9 },
        { nombre: 'MONTO BASE',           align: 'der', x: 234.9, end: 275.9, num: 'AR' },
        { nombre: 'IVA',                  align: 'der', x: 316.8, end: 329.1, num: 'AR' },
        { nombre: 'PERCEP-IVA',           align: 'der', x: 341.4, end: 382.3, num: 'AR' },
        { nombre: 'PERCEP-IIBB',          align: 'der', x: 390.5, end: 435.5, num: 'AR' }
    ]],
    CUOTAS_PRESTAMOS: [[
        { nombre: 'NRO. PRESTAMO',  align: 'izq', x: 46.6,  end: 99.8 },
        { nombre: 'N.CUOTA',        align: 'izq', x: 108.0, end: 136.7 },
        { nombre: 'MONEDA',         align: 'izq', x: 144.9, end: 169.4 },
        { nombre: 'IMPORTE',        align: 'der', x: 185.8, end: 214.5, num: 'AR' },
        { nombre: 'TNA',            align: 'der', x: 230.8, end: 243.1, num: 'AR' },
        { nombre: 'TASA',           align: 'izq', x: 259.5, end: 275.9 },
        // La TEA viene con 4 decimales (32,5398), así que lleva su propio formato.
        { nombre: 'TEA',            align: 'der', x: 308.6, end: 320.9, num: 'AR', fmt: '0.0000' },
        { nombre: 'VTO',            align: 'der', x: 357.7, end: 370.0 },
        { nombre: 'CTA. A DEBITAR', align: 'izq', x: 402.8, end: 460.1 }
    ]],
    // Cada préstamo ocupa dos líneas y cada una responde a su propio
    // encabezado: la 1ª al de CAPITAL/INTERES/..., la 2ª al de SALDO
    // IMPAGO/IVA S/INT/... Por eso se declaran dos layouts que se alternan.
    COMPOSICION_CUOTAS: [
        [
            { nombre: 'NRO. PRESTAMO',  align: 'izq', x: 46.6,  end: 99.8 },
            { nombre: 'CAPITAL',        align: 'der', x: 136.7, end: 165.3, num: 'AR' },
            { nombre: 'INTERES',        align: 'der', x: 198.1, end: 226.7, num: 'AR' },
            { nombre: 'CARGO SEG.VIDA', align: 'der', x: 239.0, end: 296.3, num: 'AR' },
            { nombre: 'CARGO SEG.BIEN', align: 'der', x: 304.5, end: 361.8, num: 'AR' },
            { nombre: 'COM ADMIN',      align: 'der', x: 386.4, end: 423.2, num: 'AR' },
            { nombre: 'IIBB(2).',       align: 'der', x: 451.9, end: 484.6, num: 'AR' }
        ],
        [
            { nombre: 'IDENTIFICACION',  align: 'izq', x: 46.6,  end: 103.9 },
            { nombre: 'SALDO IMPAGO(1)', align: 'der', x: 116.2, end: 177.6, num: 'AR' },
            { nombre: 'IVA S/INT(2)',    align: 'der', x: 189.9, end: 239.0, num: 'AR' },
            { nombre: 'OT.IMP.C.BIEN',   align: 'der', x: 243.1, end: 296.3, num: 'AR' },
            { nombre: 'IVA S/CARGO',     align: 'der', x: 304.5, end: 349.5, num: 'AR' },
            { nombre: 'IVA S/COM',       align: 'der', x: 386.4, end: 423.2, num: 'AR' },
            { nombre: 'IVA AD(2)',       align: 'der', x: 451.9, end: 488.7, num: 'AR' }
        ]
    ],
    CONCEPTOS_PENDIENTES: [[
        { nombre: 'CUENTA',               align: 'izq', x: 46.6,  end: 71.2 },
        { nombre: 'DESCRIPCION-PRODUCTO', align: 'izq', x: 112.1, end: 194.0 },
        { nombre: 'REFERENCIA',           align: 'izq', x: 226.7, end: 267.7 },
        { nombre: 'IMPORTE',              align: 'der', x: 410.9, end: 439.6, num: 'AR' }
    ]]
};

// --- DETALLE DE IMPUESTOS: parseo por contenido ---
// Este bloque no trae fila de encabezado, así que no hay coordenadas que
// re-anclar. En cambio su estructura es fija y se lee de derecha a izquierda:
//   <concepto> [DEBITADO] EN <MM-AAAA> $ <importe>
// Parsearlo por contenido lo vuelve inmune a que el banco corra la tabla.
const COLUMNAS_IMPUESTOS = ['CONCEPTO', 'ESTADO', 'PERIODO', 'MONEDA', 'IMPORTE'];
// Importes de este bloque en formato AR (1.234.567,89), con "*" opcional de nota.
const RE_IMPORTE_AR = /^-?\d{1,3}(\.\d{3})*,\d{2}\*?$/;
const RE_PERIODO_MM_AAAA = /^\d{2}-\d{4}$/;
const RE_MONEDA = /^(\$|U\$S|USD)$/i;
const ESTADOS_IMPUESTO = new Set(['DEBITADO', 'ACREDITADO', 'CREDITADO']);

function estructurarImpuestos(filasItems) {
    const filas = [];
    const formatos = [];

    for (const items of filasItems) {
        const toks = [...items].sort((a, b) => a.x - b.x).map(it => it.texto);
        let fin = toks.length;
        let importe = '', moneda = '', periodo = '', estado = '';

        if (fin && RE_IMPORTE_AR.test(toks[fin - 1])) importe = toks[--fin];
        if (fin && RE_MONEDA.test(toks[fin - 1])) moneda = toks[--fin];
        if (fin && RE_PERIODO_MM_AAAA.test(toks[fin - 1])) {
            periodo = toks[--fin];
            if (fin && toks[fin - 1].toUpperCase() === 'EN') periodo = `${toks[--fin]} ${periodo}`;
        }
        if (fin && ESTADOS_IMPUESTO.has(toks[fin - 1].toUpperCase())) estado = toks[--fin];

        const concepto = toks.slice(0, fin).join(' ').replace(/\s+/g, ' ').trim();
        const imp = parsearImporteSegun(importe, 'AR');
        const fila = [concepto, estado, periodo, moneda, imp ? imp.valor : importe];
        if (fila.some(c => c !== '')) {
            filas.push(fila);
            formatos.push([null, null, null, null, imp ? (imp.nota ? FMT_MONTO_NOTA : FMT_MONTO) : null]);
        }
    }

    if (!filas.length) return { filas: [], headers: [], formatos: [] };
    filas.unshift(COLUMNAS_IMPUESTOS.slice());
    formatos.unshift(COLUMNAS_IMPUESTOS.map(() => null));
    return { filas, headers: [0], formatos };
}

// Convierte el texto de un importe a número para que el Excel pueda sumarlo.
//   'AR' -> 1.234.567,89 (bloques de resumen)   'US' -> 1,234,567.89 (acuerdos)
// Devuelve null si el texto no es un importe, y en ese caso la celda queda
// como estaba: así un rótulo suelto o un número de cuenta nunca se rompe.
// El "*" final (nota al pie de CREDITO ART. 13) se conserva vía formato.
function parsearImporteSegun(texto, modo) {
    if (typeof texto !== 'string') return null;
    let s = texto.trim();
    if (!s) return null;

    const nota = s.endsWith('*');
    if (nota) s = s.slice(0, -1).trim();
    const pct = s.endsWith('%');
    if (pct) s = s.slice(0, -1).trim();
    const neg = s.startsWith('-');
    if (neg) s = s.slice(1);

    const valido = modo === 'AR'
        ? /^\d{0,3}(\.\d{3})*,\d+$/.test(s)   // ",00" y "1.234,56"
        : /^\d{1,3}(,\d{3})*\.\d+$/.test(s);  // "250,000.00"
    if (!valido) return null;

    const limpio = modo === 'AR' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    const num = parseFloat(limpio);
    if (isNaN(num)) return null;
    return { valor: neg ? -num : num, nota, pct };
}

// ¿El token parece un valor (importe, número de cuenta, fecha, porcentaje)?
// Solo estos se intentan ubicar por el borde derecho.
function pareceValor(texto) {
    return /\d/.test(texto) && /^[\d.,$%\-/*()]+$/.test(texto);
}

// Busca cada rótulo declarado dentro de la fila de encabezado real del PDF y
// devuelve las columnas con sus coordenadas. El rótulo puede venir partido en
// varios items ("MONTO" + "BASE"), así que se prueban secuencias consecutivas.
// Si un rótulo no aparece, la columna conserva su coordenada de respaldo.
function ubicarColumnas(itemsHeader, plantilla) {
    const items = itemsHeader ? [...itemsHeader].sort((a, b) => a.x - b.x) : [];
    const usados = new Set();

    return plantilla.map(col => {
        const objetivo = col.nombre.replace(/\s+/g, ' ').trim().toUpperCase();
        for (let i = 0; i < items.length; i++) {
            if (usados.has(i)) continue;
            let acum = '';
            for (let j = i; j < items.length; j++) {
                if (usados.has(j)) break;
                acum = acum ? `${acum} ${items[j].texto}` : items[j].texto;
                const norm = acum.replace(/\s+/g, ' ').trim().toUpperCase();
                if (norm === objetivo) {
                    for (let k = i; k <= j; k++) usados.add(k);
                    return { ...col, x: items[i].x, end: items[j].end };
                }
                if (norm.length >= objetivo.length) break;
            }
        }
        return { ...col }; // no se encontró el rótulo: se usa el respaldo
    });
}

// Reparte los items de una fila entre las columnas, dejando vacías las que no
// reciben ningún token. Es el reemplazo de agruparEnCeldas para estos bloques.
function distribuirEnColumnas(items, columnas) {
    const celdas = columnas.map(() => []);

    for (const it of [...items].sort((a, b) => a.x - b.x)) {
        let destino = -1;

        // 1) Importes y demás valores: por borde derecho, a la columna 'der'
        //    más cercana dentro de la tolerancia.
        if (pareceValor(it.texto)) {
            let mejor = null;
            columnas.forEach((col, i) => {
                if (col.align !== 'der') return;
                const dist = Math.abs(it.end - col.end);
                if (dist <= TOL_DER && (!mejor || dist < mejor.dist)) mejor = { dist, i };
            });
            if (mejor) destino = mejor.i;
        }

        // 2) Texto (o valor que no alineó a la derecha): a la última columna
        //    'izq' que empieza en o antes del token. Así los conceptos largos
        //    no se derraman sobre la columna siguiente.
        if (destino < 0) {
            columnas.forEach((col, i) => {
                if (col.align === 'izq' && col.x <= it.x + TOL_IZQ) destino = i;
            });
        }

        if (destino < 0) destino = 0;
        celdas[destino].push(it.texto);
    }

    const valores = [];
    const formatos = [];
    celdas.forEach((ts, i) => {
        const texto = ts.join(' ').replace(/\s+/g, ' ').trim();
        const col = columnas[i];
        const imp = col.num ? parsearImporteSegun(texto, col.num) : null;
        if (imp) {
            valores.push(imp.valor);
            let fmt = col.fmt || FMT_MONTO;
            if (imp.nota) fmt = FMT_MONTO_NOTA;
            else if (imp.pct) fmt = FMT_TASA_PCT;
            formatos.push(fmt);
        } else {
            valores.push(texto);
            formatos.push(null);
        }
    });
    return { valores, formatos };
}

// Convierte los items crudos capturados por sección en una grilla de celdas
// alineada con su encabezado. Devuelve las filas listas para volcar al Excel.
function estructurarSeccion(clave, filasItems) {
    if (clave === 'IMPUESTOS') return estructurarImpuestos(filasItems);

    const layouts = LAYOUTS_SECCION[clave];
    if (!layouts || !filasItems.length) {
        // Sin layout declarado: se cae al partido por huecos de siempre.
        const filas = filasItems.map(items => agruparEnCeldas(items)).filter(f => f.length);
        return { filas, headers: [], formatos: filas.map(f => f.map(() => null)) };
    }

    // Se consume una fila de encabezado por layout declarado.
    const headers = filasItems.slice(0, layouts.length);
    const datos = filasItems.slice(layouts.length);

    const columnas = layouts.map((plantilla, i) => ubicarColumnas(headers[i], plantilla));
    const filas = [];
    const formatos = [];
    const idxHeaders = [];
    let ultimoLayout = -1;

    datos.forEach((items, idx) => {
        const iLayout = layouts.length > 1 ? idx % layouts.length : 0;
        // Se repite el encabezado cada vez que cambia el layout, para que en el
        // Excel quede claro a qué columnas responde cada línea.
        if (iLayout !== ultimoLayout) {
            idxHeaders.push(filas.length);
            filas.push(columnas[iLayout].map(c => c.nombre));
            formatos.push(columnas[iLayout].map(() => null));
            ultimoLayout = iLayout;
        }
        const { valores, formatos: fmts } = distribuirEnColumnas(items, columnas[iLayout]);
        if (valores.some(c => c !== '')) { filas.push(valores); formatos.push(fmts); }
    });

    return { filas, headers: idxHeaders, formatos };
}

// ============================================================================
//  EXTRACCIÓN DE CABECERA / METADATOS
// ============================================================================
function extraerCabecera(allFilas) {
    const cab = {
        cliente: '', cuit: '', condicionIVA: '', ingresosBrutos: '',
        domicilio: '', periodo: '', desde: '', hasta: '', anio: null
    };
    const ventana = allFilas.slice(0, 30);

    for (const fila of ventana) {
        const t = textoFila(filaAItems(fila));
        if (!t) continue;

        let m;
        if (!cab.cliente && (m = /^ESTIMADOS?\s+SE.?ORES?\s+(.+)$/i.exec(t))) {
            cab.cliente = m[1].trim();
        }
        if (!cab.cuit && (m = /C\.?U\.?I\.?T\.?\s*[:\s]*([\d]{2}-?\d{8}-?\d)/i.exec(t))) {
            cab.cuit = m[1].trim();
            const resto = t.slice(m.index + m[0].length).trim();
            if (resto) cab.condicionIVA = resto;
        }
        if (!cab.ingresosBrutos && (m = /INGRESOS\s+BRUTOS:?\s*([\d.\-]+)/i.exec(t))) {
            cab.ingresosBrutos = m[1].trim();
        }
        if (!cab.periodo && (m = /EXTRACTO\s+DEL\s+(\d{2}\/\d{2}\/\d{4})\s+AL\s+(\d{2}\/\d{2}\/\d{4})/i.exec(t))) {
            cab.desde = m[1];
            cab.hasta = m[2];
            cab.periodo = `${m[1]} al ${m[2]}`;
            cab.anio = parseInt(m[2].split('/')[2], 10);
        }
    }
    return cab;
}

// ============================================================================
//  EXTRACCIÓN DE LA TABLA "RESUMEN DE CUENTAS" (PRODUCTO ...)
// ============================================================================
function extraerResumenCuentas(allFilas, idxHeader) {
    const cuentas = [];
    for (let i = idxHeader + 1; i < allFilas.length; i++) {
        const items = filaAItems(allFilas[i]);
        if (!items.length) continue;
        const t = textoFila(items);
        // El bloque termina al llegar a la apertura de la 1ª cuenta o a un título.
        if (/NRO\.\s*[\d-]+$/.test(t)) break;
        if (/DETALLE DE OPERACIONES/i.test(t)) break;
        if (/^_{3,}$/.test(t)) break;

        const reg = { producto: '', sucursal: '', cuenta: '', cbu: '', saldoAnterior: '', saldoActual: '' };
        for (const it of items) {
            if (it.x < 135) {
                reg.producto += (reg.producto ? ' ' : '') + it.texto;
            } else if (it.x < 163) {
                reg.sucursal += (reg.sucursal ? ' ' : '') + it.texto;
            } else if (it.x < 220) {
                reg.cuenta += (reg.cuenta ? ' ' : '') + it.texto;
            } else if (it.x < 335) {
                reg.cbu += (reg.cbu ? ' ' : '') + it.texto;
            } else if (esImporte(it.texto)) {
                if (it.end < COL.CRE_END) reg.saldoAnterior = parsearMonto(it.texto);
                else reg.saldoActual = parsearMonto(it.texto);
            }
        }
        Object.keys(reg).forEach(k => {
            if (typeof reg[k] === 'string') reg[k] = reg[k].replace(/\s+/g, ' ').trim();
        });
        if (reg.cuenta && reg.cbu) cuentas.push(reg);
    }
    return cuentas;
}

// ============================================================================
//  PARSEO DE FILAS DE MOVIMIENTO
// ============================================================================
// ¿El item es el NRO de referencia de la operación? Se ubica por borde derecho
// (ver COL.NRO_END), así que no importa cuántos dígitos tenga.
function esNroReferencia(it) {
    return /^\d+$/.test(it.texto) && Math.abs(it.end - COL.NRO_END) <= COL.NRO_TOL;
}

function asignarMonto(mov, it) {
    if (!esImporte(it.texto)) return;
    if (it.end < COL.DEB_END) mov.DEBITO = parsearMonto(it.texto);
    else if (it.end < COL.CRE_END) mov.CREDITO = parsearMonto(it.texto);
    else mov.SALDO = parsearMonto(it.texto);
}

function nuevaCuenta(textoApertura, nro) {
    const producto = textoApertura.replace(/\s*NRO\.\s*[\d-]+\s*$/i, '').trim();
    let moneda = '$';
    if (/U\$S/i.test(producto)) moneda = 'U$S';
    return { producto, nro, moneda, movimientos: [] };
}

// Detecta encabezados de los bloques de resumen finales. Devuelve la clave de
// sección o null. Se evalúa de la más específica a la más genérica.
function detectarSeccion(t) {
    if (/IMPUESTOS\s+LIQUIDADOS\s+POR\s+DEBITOS/i.test(t)) return 'IMP_LIQUIDADOS';
    if (/DETALLE\s+DE\s+IMPUESTOS\b/i.test(t)) return 'IMPUESTOS';
    if (/RESUMEN\s+DE\s+ACUERDOS/i.test(t)) return 'ACUERDOS';
    if (/CUOTAS\s+DE\s+PRESTAMOS\s+PROXIMOS/i.test(t)) return 'CUOTAS_PRESTAMOS';
    if (/COMPOSICION\s+DE\s+CUOTAS/i.test(t)) return 'COMPOSICION_CUOTAS';
    if (/CONCEPTOS\s+PENDIENTES\s+DE\s+COBRO/i.test(t)) return 'CONCEPTOS_PENDIENTES';
    return null;
}

// Marcadores de texto legal / pie que cierran cualquier captura de sección.
const FIN_DOCUMENTO = [
    'REGIMEN DE GARANTIAS DE DEPOSITOS',
    'FONDOS COMUNES DE INVERSION',
    'CALCULO DE INTERESES POR DESCUBIERTO',
    'ACLARACIONES:'
];

function procesarFilas(allFilas) {
    const cabecera = extraerCabecera(allFilas);
    const cuentas = [];
    const secciones = {}; // clave -> { titulo, filasItems: [...], filas: [[celda,...],...] }

    const TITULOS_SECCION = {
        ACUERDOS: 'RESUMEN DE ACUERDOS',
        IMPUESTOS: 'DETALLE DE IMPUESTOS',
        IMP_LIQUIDADOS: 'IMPUESTOS LIQUIDADOS POR DEBITOS',
        CUOTAS_PRESTAMOS: 'CUOTAS DE PRESTAMOS PROXIMOS A VENCER',
        COMPOSICION_CUOTAS: 'COMPOSICION DE CUOTAS',
        CONCEPTOS_PENDIENTES: 'CONCEPTOS PENDIENTES DE COBRO'
    };

    let cuentaActual = null;
    let modo = null;        // 'DETALLE' (tabla de movimientos) o null
    let seccionActual = null; // clave de sección de resumen en captura
    let ultimaFecha = null;

    for (let i = 0; i < allFilas.length; i++) {
        const items = filaAItems(allFilas[i]);
        if (!items.length) continue;
        const t = textoFila(items);

        // --- Encabezado / pie repetido en cada página: se ignora ---
        // (si no, se cuela en la descripción de los movimientos que cruzan de página)
        if (/^HOJA\s+\d+\s+DE\s+\d+$/i.test(t)) continue;
        if (/^\d{6,}-[A-Z]$/.test(t)) continue; // nro de resumen, ej "7663360-P"

        // --- Encabezado de la tabla resumen de cuentas (cabecera, 1 sola vez) ---
        if (/PRODUCTO\b.*\bCBU\b.*SALDO\s+ANTERIOR/i.test(t) && !cabecera.cuentasResumen) {
            cabecera.cuentasResumen = extraerResumenCuentas(allFilas, i);
            continue;
        }

        // --- Texto legal / pie de página: corta toda captura ---
        if (FIN_DOCUMENTO.some(mk => t.includes(mk))) {
            modo = null;
            seccionActual = null;
            // no cortamos cuentaActual: nada más relevante después
            continue;
        }

        // --- Apertura de cuenta: "<PRODUCTO> ... NRO. <nro>" (nro al final) ---
        const aper = /^(.+?\bNRO\.\s*([\d-]+))$/i.exec(t);
        if (aper && /NRO\.\s*[\d-]+$/.test(t) && !/^PRODUCTO\b/i.test(t)) {
            cuentaActual = nuevaCuenta(aper[1], aper[2]);
            cuentas.push(cuentaActual);
            modo = null;
            seccionActual = null;
            ultimaFecha = null;
            continue;
        }

        // --- Encabezado de un bloque de resumen final ---
        const sec = detectarSeccion(t);
        if (sec) {
            seccionActual = sec;
            modo = null;
            if (!secciones[sec]) secciones[sec] = { titulo: TITULOS_SECCION[sec], filasItems: [], filas: [] };
            continue;
        }

        // --- Captura de bloque de resumen ---
        // Se guardan los items crudos (con sus coordenadas): la grilla se arma
        // después, en estructurarSeccion, ubicando cada token en su columna.
        if (seccionActual) {
            if (/^_{3,}$/.test(t)) { seccionActual = null; continue; }
            secciones[seccionActual].filasItems.push(items);
            continue;
        }

        if (!cuentaActual) continue;

        // --- Dentro de una cuenta ---
        if (/DETALLE\s+DE\s+OPERACIONES/i.test(t)) { modo = 'DETALLE'; continue; }

        if (/NO\s+HUBO\s+NINGUNA\s+ACTIVIDAD/i.test(t)) {
            cuentaActual.sinActividad = true;
            continue;
        }

        // Encabezado de la tabla de movimientos
        if (/\bFECHA\b/.test(t) && /\bDEBITO\b/.test(t) && /\bCREDITO\b/.test(t) && /\bSALDO\b/.test(t)) {
            continue;
        }

        // ¿Es una línea de operación? -> tiene un guion marcador en x≈[75,86]
        const guion = items.find(it => it.texto === '-' && it.x >= 75 && it.x <= 86);

        if (guion) {
            // Fecha (opcional, solo en el primer mov del día)
            const itFecha = items.find(it => it.x >= COL.FECHA.min && it.x <= COL.FECHA.max && /^\d{2}-[A-Z]{3}$/.test(it.texto));
            if (itFecha) ultimaFecha = itFecha.texto;

            const mov = {
                FECHA: ultimaFecha || '',
                DESCRIPCION: '', NRO: '', DEBITO: '', CREDITO: '', SALDO: ''
            };
            for (const it of items) {
                if (it === itFecha || it === guion) continue;
                if (esNroReferencia(it)) {
                    mov.NRO += (mov.NRO ? ' ' : '') + it.texto;
                } else if (it.x >= COL.DESC.min && it.x < COL.DESC.max) {
                    mov.DESCRIPCION += (mov.DESCRIPCION ? ' ' : '') + it.texto;
                } else {
                    asignarMonto(mov, it);
                }
            }
            mov.DESCRIPCION = mov.DESCRIPCION.replace(/\s+/g, ' ').trim();
            mov.NRO = parsearNro(mov.NRO);
            cuentaActual.movimientos.push(mov);
            continue;
        }

        // --- Línea de continuación (sin guion): se concatena a la descripción ---
        if (modo === 'DETALLE' && cuentaActual.movimientos.length) {
            const ultimo = cuentaActual.movimientos[cuentaActual.movimientos.length - 1];
            const textoCont = items
                .filter(it => it.x >= COL.DESC.min && !esImporte(it.texto))
                .map(it => it.texto).join(' ').trim();
            if (textoCont) {
                ultimo.DESCRIPCION = (ultimo.DESCRIPCION + ' ' + textoCont).replace(/\s+/g, ' ').trim();
            }
        }
    }

    // Convertir fechas DD-MMM a Date para todas las cuentas
    for (const c of cuentas) {
        for (const mov of c.movimientos) {
            if (mov.FECHA) {
                const d = fechaAObjeto(mov.FECHA, cabecera.anio);
                if (d) mov.FECHA = d;
            }
        }
    }

    // Armado de la grilla de cada bloque de resumen por coordenada de columna.
    for (const clave of Object.keys(secciones)) {
        const { filas, headers, formatos } = estructurarSeccion(clave, secciones[clave].filasItems);
        secciones[clave].filas = filas;
        secciones[clave].headers = headers;
        secciones[clave].formatos = formatos;
    }

    return { cabecera, cuentas, secciones };
}

// ============================================================================
//  APLANADO (fallback para consumidores que esperan `datos`)
// ============================================================================
function aplanar(cuentas) {
    const filas = [];
    for (const c of cuentas) {
        for (const mov of c.movimientos) {
            filas.push({ CUENTA: c.nro, PRODUCTO: c.producto, ...mov });
        }
    }
    return filas;
}

// ============================================================================
//  GENERACIÓN DEL EXCEL (Modo B)
// ============================================================================
// Colores, fuentes y formatos compartidos por todos los Excel de salida.
const {
    FILL_TITULO, FONT_TITULO, FILL_ENCABEZADO, FONT_ENCABEZADO, FMT_MONTO, FMT_FECHA,
    estilizarEncabezado, estilizarEtiqueta, aplicarCebra
} = require('../../utils/estilosExcel');
// Para el importe que el PDF marca con "*" (remite a la nota al pie): se guarda
// como número —así suma— y el asterisco se conserva en el formato de la celda.
const FMT_MONTO_NOTA = '0.00"*"';
// Tasas que el PDF escribe con el símbolo detrás ("37.00 %").
const FMT_TASA_PCT = '0.00"%"';

// Leyenda que el PDF trae para las cuentas que no registraron movimientos.
const LEYENDA_SIN_ACTIVIDAD = 'NO HUBO NINGUNA ACTIVIDAD DURANTE EL PERIODO DEL EXTRACTO';

function nombreHojaSeguro(base, usados) {
    let nombre = base.replace(/[\\/*?\[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31);
    let final = nombre, n = 2;
    while (usados.has(final)) {
        const sufijo = ` ${n++}`;
        final = nombre.slice(0, 31 - sufijo.length) + sufijo;
    }
    usados.add(final);
    return final;
}

async function generarExcel(procesado, rutaSalida) {
    const { cabecera, cuentas, secciones } = procesado;
    const workbook = new ExcelJS.Workbook();
    const usados = new Set();

    // ---------------- Hoja 1: Datos Generales ----------------
    const sheet = workbook.addWorksheet(nombreHojaSeguro('Datos Generales', usados));
    sheet.columns = [
        { key: 'a', width: 22 }, { key: 'b', width: 26 }, { key: 'c', width: 14 },
        { key: 'd', width: 26 }, { key: 'e', width: 18 }, { key: 'f', width: 18 }
    ];

    let row = 1;
    const titulo = (texto, hasta = 'F') => {
        const c = sheet.getCell(`A${row}`);
        c.value = texto; c.font = FONT_TITULO; c.fill = FILL_TITULO;
        sheet.mergeCells(`A${row}:${hasta}${row}`);
        row++;
    };
    const propValor = (prop, val) => {
        const c1 = sheet.getCell(`A${row}`);
        c1.value = prop; estilizarEtiqueta(c1);
        sheet.getCell(`B${row}`).value = val;
        row++;
    };

    titulo('DATOS DEL CLIENTE');
    [
        ['Cliente', cabecera.cliente],
        ['C.U.I.T', cabecera.cuit],
        ['Condición IVA', cabecera.condicionIVA],
        ['Ingresos Brutos', cabecera.ingresosBrutos],
        ['Período del Extracto', cabecera.periodo]
    ].forEach(([p, v]) => { if (v) propValor(p, v); });

    row++;

    if (cabecera.cuentasResumen && cabecera.cuentasResumen.length) {
        titulo('RESUMEN DE CUENTAS');
        const headers = ['PRODUCTO', 'SUC', 'CUENTA', 'CBU', 'SALDO ANTERIOR', 'SALDO ACTUAL'];
        headers.forEach((h, idx) => {
            const c = sheet.getCell(row, idx + 1);
            c.value = h; c.font = FONT_ENCABEZADO; c.fill = FILL_ENCABEZADO;
        });
        row++;
        for (const c of cabecera.cuentasResumen) {
            sheet.getCell(row, 1).value = c.producto;
            sheet.getCell(row, 2).value = c.sucursal;
            sheet.getCell(row, 3).value = c.cuenta;
            sheet.getCell(row, 4).value = c.cbu;
            const ca = sheet.getCell(row, 5); ca.value = c.saldoAnterior; ca.numFmt = FMT_MONTO;
            const cb = sheet.getCell(row, 6); cb.value = c.saldoActual; cb.numFmt = FMT_MONTO;
            row++;
        }
    }

    // ---------------- Una hoja por cuenta con movimientos ----------------
    let nCuenta = 1;
    for (const cuenta of cuentas) {
        // Las cuentas sin actividad igual generan hoja: traen solo el SALDO
        // FINAL, pero el usuario espera una hoja por cada cuenta del extracto.
        if (!cuenta.movimientos.length) continue;
        const nombre = nombreHojaSeguro(`Cuenta ${nCuenta} - ${cuenta.nro}`, usados);
        const hoja = workbook.addWorksheet(nombre);

        hoja.getCell('A1').value = `${cuenta.producto} - NRO.: ${cuenta.nro}`;
        hoja.getCell('A1').font = FONT_TITULO;
        hoja.getCell('A1').fill = FILL_TITULO;
        hoja.mergeCells('A1:F1');

        let filaHeader = 2;
        if (cuenta.sinActividad) {
            const aviso = hoja.getCell('A2');
            aviso.value = LEYENDA_SIN_ACTIVIDAD;
            aviso.font = { italic: true };
            hoja.mergeCells('A2:F2');
            filaHeader = 3;
        }

        const headerRow = hoja.getRow(filaHeader);
        headerRow.values = ['FECHA', 'DESCRIPCION', 'NRO', 'DEBITO', 'CREDITO', 'SALDO'];
        estilizarEncabezado(headerRow);

        hoja.columns = [
            { key: 'FECHA', width: 12, style: { numFmt: FMT_FECHA } },
            { key: 'DESCRIPCION', width: 48 },
            { key: 'NRO', width: 12 },
            { key: 'DEBITO', width: 16, style: { numFmt: FMT_MONTO } },
            { key: 'CREDITO', width: 16, style: { numFmt: FMT_MONTO } },
            { key: 'SALDO', width: 18, style: { numFmt: FMT_MONTO } }
        ];

        cuenta.movimientos.forEach(mov => hoja.addRow(mov));
        aplicarCebra(hoja, filaHeader + 1, hoja.rowCount, 6);
        hoja.views = [{ state: 'frozen', ySplit: filaHeader }];
        nCuenta++;
    }

    // ---------------- Hoja de Resúmenes (bloques apilados) ----------------
    const clavesConDatos = Object.keys(secciones).filter(k => secciones[k].filas.length);
    if (clavesConDatos.length) {
        const hoja = workbook.addWorksheet(nombreHojaSeguro('Resumenes', usados));
        let r = 1;
        let maxCols = 1;
        for (const clave of clavesConDatos) {
            const sec = secciones[clave];
            const filas = sec.filas;
            const formatos = sec.formatos || [];
            const esHeader = new Set(sec.headers || []);

            // Título del bloque
            const cT = hoja.getCell(r, 1);
            cT.value = sec.titulo; cT.font = FONT_TITULO; cT.fill = FILL_TITULO;
            const anchoBloque = Math.max(1, ...filas.map(f => f.length));
            maxCols = Math.max(maxCols, anchoBloque);
            hoja.mergeCells(r, 1, r, anchoBloque);
            r++;
            // Filas del bloque
            filas.forEach((fila, idxFila) => {
                fila.forEach((celda, idx) => {
                    const cell = hoja.getCell(r, idx + 1);
                    cell.value = celda;
                    const fmt = formatos[idxFila] && formatos[idxFila][idx];
                    if (fmt) { cell.numFmt = fmt; cell.alignment = { horizontal: 'right' }; }
                    if (esHeader.has(idxFila)) { cell.font = FONT_ENCABEZADO; cell.fill = FILL_ENCABEZADO; }
                });
                r++;
            });
            r++; // línea en blanco entre bloques
        }
        hoja.columns.forEach((col, idx) => { col.width = idx === 0 ? 40 : 20; });
    }

    await workbook.xlsx.writeFile(rutaSalida);
    return rutaSalida;
}

// ============================================================================
//  FUNCIÓN PRINCIPAL (interfaz del manager)
// ============================================================================
async function procesarBancoGalicia(allFilas, metadata = {}) {
    try {
        const procesado = procesarFilas(allFilas);
        const datosPlanos = aplanar(procesado.cuentas);
        const nCuentas = procesado.cuentas.filter(c => c.movimientos.length).length;
        console.log(`[banco_galicia] ${nCuentas} cuenta(s) con movimientos, ${datosPlanos.length} movimientos totales`);

        const baseName = metadata.rutaCompleta
            ? path.basename(metadata.rutaCompleta, path.extname(metadata.rutaCompleta))
            : null;

        let rutaSalida = null;
        if (baseName) {
            const dirSalida = path.dirname(metadata.rutaCompleta);
            rutaSalida = path.join(dirSalida, `${baseName}.xlsx`);
            await generarExcel(procesado, rutaSalida);
            console.log(`[banco_galicia] Excel generado: ${rutaSalida}`);
        }

        return {
            datos: datosPlanos,
            cabecera: procesado.cabecera,
            excelPath: rutaSalida,
            suggestedFileName: baseName ? `${baseName}.xlsx` : undefined
        };
    } catch (err) {
        console.error(`Error al procesar PDF de Banco Galicia: ${err.message}`);
        console.error(err.stack);
        return null;
    }
}

// ============================================================================
//  BLOQUE DE PRUEBA INDEPENDIENTE
// ============================================================================
if (require.main === module) {
    (async () => {
        const pdfjsLib = require('pdfjs-dist/build/pdf.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');
        pdfjsLib.GlobalWorkerOptions.standardFontDataUrl =
            path.join(path.dirname(require.resolve('pdfjs-dist/build/pdf.js')), '../standard_fonts/');

        const ruta = process.argv[2];
        if (!ruta) { console.error('Uso: node banco_galicia.js <ruta_al_pdf>'); return; }

        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await require('fs').promises.readFile(ruta)), verbosity: 0 }).promise;
        const allFilas = [];
        for (let n = 1; n <= pdf.numPages; n++) {
            const page = await pdf.getPage(n);
            const content = await page.getTextContent();
            const map = new Map();
            content.items.forEach(it => {
                const y = it.transform[5];
                const ye = [...map.keys()].find(k => Math.abs(y - k) <= 5);
                if (ye !== undefined) map.get(ye).push(it); else map.set(y, [it]);
            });
            const filas = [...map.entries()].sort((a, b) => b[0] - a[0])
                .map(([y, its]) => ({ y, items: its.sort((a, b) => a.transform[4] - b.transform[4]) }));
            allFilas.push(...filas);
        }

        const res = await procesarBancoGalicia(allFilas, { rutaCompleta: ruta });
        if (res) {
            console.log(`✓ OK — ${res.datos.length} movimientos. Excel: ${res.excelPath}`);
        } else {
            console.log('✗ Falló el procesamiento');
        }
    })();
}

module.exports = { procesarBancoGalicia, procesarFilas };
