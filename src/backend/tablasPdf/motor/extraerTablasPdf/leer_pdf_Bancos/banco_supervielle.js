// ============================================================================
// PROCESADOR BANCO SUPERVIELLE - RESUMEN DE CUENTA CORRIENTE
// ============================================================================
// Estructura del PDF:
//   Página 1:   encabezado (titular, CUIT, CBU), "INFORMACION SOBRE EL SALDO DE
//               SUS CUENTAS", acuerdos, límites de tarjeta, y arranque del
//               "Detalle de Movimientos"
//   Páginas 2+: continuación del detalle, sin repetir encabezado de tabla
//   Última pág: impuestos Ley 25413 y "SALDO PERIODO ACTUAL"
//
// Particularidades de este resumen (por las que el método genérico lo rompe):
//   1. Un movimiento puede ocupar VARIAS filas: la primera trae fecha e importes,
//      y debajo vienen 1..3 filas de detalle sin fecha (CBU, beneficiario, CUIT,
//      "Operación NNN Generada el DD/MM/YY"). Esas filas se acumulan en DETALLE,
//      no generan un movimiento nuevo.
//   2. Los saldos negativos se marcan con un GUION AL FINAL: "533.802,96-".
//   3. Débito, Crédito y Saldo están alineados a la DERECHA y sin encabezado de
//      columna en la tabla, así que se distinguen por BORDE DERECHO (x + width),
//      no por X de inicio (ver 0.5 de la plantilla).
//   4. La tabla de la página 1 está corrida ~20px a la IZQUIERDA respecto de las
//      páginas 2+. Por eso las columnas NO se fijan con coordenadas absolutas:
//      se anclan a la X de la fecha de cada fila, cuyo offset relativo sí es
//      idéntico en los dos layouts.
//
//        p1:  fecha@38  desc@86   ref@235  debito~350  credito~427  saldo~522
//        p2+: fecha@58  desc@106  ref@254  debito~369  credito~445  saldo~541
// ============================================================================

const path = require('path');
const ExcelJS = require('exceljs');

const FECHA_RE = /^\d{2}\/\d{2}\/\d{2}$/;
const IMPORTE_RE = /^[\d.]+,\d{2}-?$/;

// La fecha es el ancla de la fila: siempre es el primer item y arranca al margen.
const FECHA_X_MAX = 100;

// Offsets de columna medidos DESDE la X de la fecha de la propia fila.
// Los de texto son X de inicio; los numéricos son BORDE DERECHO (x + width).
const OFF = {
    DESC_MIN:    30,
    DESC_MAX:   175,   // corte desc/ref: la desc llega hasta ~+159, la ref arranca en ~+196
    REF_MIN:    175,
    REF_MAX:    280,
    DEBITO:  { min: 285, max: 330 },   // ~+312
    CREDITO: { min: 365, max: 405 },   // ~+388
    SALDO:   { min: 455, max: 510 }    // ~+484
};

const INICIO_TABLA = 'Detalle de Movimientos';
const FIN_TABLA = 'SALDO PERIODO ACTUAL';

// Ruido que cae dentro del rango de la tabla y no pertenece a ningún movimiento
const RUIDO = [
    'PYME EMPRENDE',
    'Saldo del período anterior'
];

// --- UTILIDADES ---

function filaAItems(fila) {
    if (!fila || !Array.isArray(fila.items)) return [];
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

// "1.549.919,23" -> 1549919.23 ; "533.802,96-" -> -533802.96
function parsearMonto(str) {
    if (typeof str !== 'string' || !str.trim()) return '';
    const s = str.trim();
    const negativo = s.endsWith('-') || s.startsWith('-');
    const limpio = s.replace(/-/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(limpio);
    if (isNaN(num)) return s;
    return negativo ? -num : num;
}

// "01/12/25" -> "01/12/2025" (el convertidor genérico parsea DD/MM/YYYY)
function normalizarFecha(f) {
    const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(f);
    if (!m) return f;
    return `${m[1]}/${m[2]}/20${m[3]}`;
}

function enRango(valor, rango) {
    return valor >= rango.min && valor <= rango.max;
}

// ============================================================================
// METADATOS (encabezado de la página 1)
// ============================================================================

function extraerMetadatos(allFilas) {
    const meta = {};

    for (const fila of allFilas.slice(0, 30)) {
        const t = textoFila(filaAItems(fila));
        if (!t) continue;

        const per = /RESUMEN DE CUENTA DESDE\s+(\S+)\s+HASTA\s+(\S+)/i.exec(t);
        if (per) {
            meta['Período desde'] = normalizarFecha(per[1]);
            meta['Período hasta'] = normalizarFecha(per[2]);
        }

        const cuit = /C\.U\.I\.T\.\s+([\d-]{11,})/i.exec(t);
        if (cuit && !meta['CUIT']) meta['CUIT'] = cuit[1];

        const titular = /^(.+?)\s+Responsable Inscripto$/i.exec(t);
        if (titular && !meta['Titular']) meta['Titular'] = titular[1].trim();

        const nro = /NUMERO DE CUENTA\s+([\d/-]+)\s+CLAVE BANCARIA UNICA\s+(\d+)\s+(\d+)/i.exec(t);
        if (nro) {
            meta['Número de cuenta'] = nro[1];
            meta['CBU'] = nro[2] + nro[3];
        }

        if (/^Saldo del período anterior/i.test(t)) {
            const items = filaAItems(fila);
            const imp = items.find(it => IMPORTE_RE.test(it.texto));
            if (imp) meta['Saldo período anterior'] = parsearMonto(imp.texto);
        }
    }

    // El saldo final está al pie del documento
    for (const fila of allFilas.slice(-25)) {
        const items = filaAItems(fila);
        const t = textoFila(items);
        if (t.startsWith(FIN_TABLA)) {
            const imp = items.find(it => IMPORTE_RE.test(it.texto));
            if (imp) meta['Saldo período actual'] = parsearMonto(imp.texto);
        }
    }

    return meta;
}

// ============================================================================
// MOVIMIENTOS
// ============================================================================

function extraerMovimientos(allFilas) {
    const movimientos = [];
    const impuestos = [];
    let dentroDeTabla = false;

    for (const fila of allFilas) {
        const items = filaAItems(fila);
        if (!items.length) continue;
        const t = textoFila(items);

        if (!dentroDeTabla) {
            if (t.startsWith(INICIO_TABLA)) dentroDeTabla = true;
            continue;
        }

        if (t.startsWith(FIN_TABLA)) break;

        // Pie legal de cada página: siempre por debajo del área de la tabla
        if (fila.y < 200) continue;
        if (RUIDO.some(r => t.startsWith(r))) continue;

        // --- Cierre del período: no son movimientos, van a su propia tabla ---
        // Aparecen al pie, sin fecha, justo antes de "SALDO PERIODO ACTUAL". Si no
        // se interceptan acá, se pegan como DETALLE del último movimiento.
        const imp = /^Imp Ley 25413\s+(s\/\w+)\s+(\S+)\s+([\d.]+,\d{2}-?)$/i.exec(t);
        if (imp) {
            impuestos.push({
                CONCEPTO: `Imp Ley 25413 ${imp[1]}`,
                PERIODO: imp[2],
                IMPORTE: parsearMonto(imp[3])
            });
            continue;
        }

        const itFecha = items.find(it => it.x < FECHA_X_MAX && FECHA_RE.test(it.texto));

        // --- Fila de continuación: se acumula en el movimiento anterior ---
        if (!itFecha) {
            if (!movimientos.length) continue;
            const ultimo = movimientos[movimientos.length - 1];
            ultimo.DETALLE = (ultimo.DETALLE ? ultimo.DETALLE + ' | ' : '') + t;
            continue;
        }

        // --- Fila de movimiento nuevo ---
        const mov = {
            FECHA: normalizarFecha(itFecha.texto),
            DESCRIPCION: '',
            REFERENCIA: '',
            DEBITO: '',
            CREDITO: '',
            SALDO: '',
            DETALLE: ''
        };

        // Todas las columnas se miden respecto del margen de la fila (ver nota 4)
        const base = itFecha.x;

        for (const it of items) {
            if (it === itFecha) continue;

            const dx = it.x - base;
            const dEnd = it.end - base;

            if (IMPORTE_RE.test(it.texto)) {
                if (enRango(dEnd, OFF.SALDO)) { mov.SALDO = parsearMonto(it.texto); continue; }
                if (enRango(dEnd, OFF.CREDITO)) { mov.CREDITO = parsearMonto(it.texto); continue; }
                if (enRango(dEnd, OFF.DEBITO)) { mov.DEBITO = parsearMonto(it.texto); continue; }
            }

            if (dx >= OFF.REF_MIN && dx < OFF.REF_MAX) {
                mov.REFERENCIA += (mov.REFERENCIA ? ' ' : '') + it.texto;
            } else if (dx >= OFF.DESC_MIN && dx < OFF.DESC_MAX) {
                mov.DESCRIPCION += (mov.DESCRIPCION ? ' ' : '') + it.texto;
            }
        }

        mov.DESCRIPCION = mov.DESCRIPCION.replace(/\s+/g, ' ').trim();
        mov.REFERENCIA = mov.REFERENCIA.replace(/\s+/g, ' ').trim();
        movimientos.push(mov);
    }

    return { movimientos, impuestos };
}

// ============================================================================
// VALIDACIÓN "DE ORO": saldoAnterior - debito + credito == saldo
// ============================================================================

function validarSaldos(movimientos, saldoInicial) {
    if (typeof saldoInicial !== 'number' || !movimientos.length) {
        return { verificados: 0, fallas: [] };
    }
    const fallas = [];
    let saldo = saldoInicial;

    movimientos.forEach((m, i) => {
        const deb = typeof m.DEBITO === 'number' ? m.DEBITO : 0;
        const cre = typeof m.CREDITO === 'number' ? m.CREDITO : 0;
        saldo = Math.round((saldo - deb + cre) * 100) / 100;
        if (typeof m.SALDO === 'number' && Math.abs(saldo - m.SALDO) > 0.011) {
            fallas.push({ indice: i, esperado: saldo, leido: m.SALDO, mov: m });
            saldo = m.SALDO; // resincronizar para no arrastrar el error
        }
    });

    return { verificados: movimientos.length, fallas };
}

// ============================================================================
// GENERACIÓN DEL EXCEL (Modo B)
// ============================================================================
// Se usa Modo B —y no el convertidor genérico— por una razón concreta:
// `cleanCellData` convierte a Number todo string de solo dígitos, y eso le come
// el cero inicial a los comprobantes ("0970100049" -> 970100049), que son 177 de
// los 254 movimientos. Escribiendo el workbook acá se fuerza REFERENCIA a texto.
// Es el mismo motivo por el que banco_galicia.js también es Modo B.

// Colores, fuentes y formatos compartidos por todos los Excel de salida.
const {
    FILL_TITULO, FONT_TITULO, FMT_MONTO, FMT_FECHA,
    estilizarEncabezado, estilizarEtiqueta, aplicarCebra
} = require('../../utils/estilosExcel');

// "01/12/2025" -> Date (ExcelJS lo escribe como fecha real con FMT_FECHA)
function fechaAObjeto(f) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f || '');
    if (!m) return f;
    return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
}

async function generarExcel({ meta, movimientos, impuestos }, rutaSalida) {
    const workbook = new ExcelJS.Workbook();

    // ---------------- Hoja 1: Datos Generales ----------------
    const hojaMeta = workbook.addWorksheet('Datos Generales');
    hojaMeta.columns = [{ key: 'a', width: 26 }, { key: 'b', width: 32 }];

    const c1 = hojaMeta.getCell('A1');
    c1.value = 'RESUMEN DE CUENTA - BANCO SUPERVIELLE';
    c1.font = FONT_TITULO;
    c1.fill = FILL_TITULO;
    hojaMeta.mergeCells('A1:B1');

    let fila = 2;
    for (const clave of Object.keys(meta)) {
        const celdaProp = hojaMeta.getCell(`A${fila}`);
        celdaProp.value = clave;
        estilizarEtiqueta(celdaProp);

        const celdaVal = hojaMeta.getCell(`B${fila}`);
        const valor = meta[clave];
        if (typeof valor === 'number') {
            celdaVal.value = valor;
            celdaVal.numFmt = FMT_MONTO;
        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(valor)) {
            celdaVal.value = fechaAObjeto(valor);
            celdaVal.numFmt = FMT_FECHA;
        } else {
            // CUIT, CBU y nro de cuenta van como texto para no perder ceros
            celdaVal.value = valor;
            celdaVal.alignment = { horizontal: 'left' };
        }
        fila++;
    }

    // ---------------- Hoja 2: Movimientos ----------------
    const hoja = workbook.addWorksheet('Movimientos');
    hoja.columns = [
        { key: 'FECHA', width: 12 },
        { key: 'DESCRIPCION', width: 34 },
        { key: 'REFERENCIA', width: 15 },
        { key: 'DEBITO', width: 15 },
        { key: 'CREDITO', width: 15 },
        { key: 'SALDO', width: 16 },
        { key: 'DETALLE', width: 60 }
    ];

    const encabezado = hoja.getRow(1);
    encabezado.values = ['FECHA', 'DESCRIPCION', 'REFERENCIA', 'DEBITO', 'CREDITO', 'SALDO', 'DETALLE'];
    estilizarEncabezado(encabezado);

    movimientos.forEach(mov => {
        const r = hoja.addRow([
            fechaAObjeto(mov.FECHA),
            mov.DESCRIPCION,
            mov.REFERENCIA,
            mov.DEBITO === '' ? null : mov.DEBITO,
            mov.CREDITO === '' ? null : mov.CREDITO,
            mov.SALDO === '' ? null : mov.SALDO,
            mov.DETALLE
        ]);
        r.getCell(1).numFmt = FMT_FECHA;
        // CLAVE: el comprobante se escribe como texto explícito. Si se deja que
        // Excel lo interprete, "0970100049" pierde el cero inicial.
        const ref = r.getCell(3);
        ref.value = { richText: [{ text: String(mov.REFERENCIA || '') }] };
        ref.alignment = { horizontal: 'left' };
        [4, 5, 6].forEach(n => { r.getCell(n).numFmt = FMT_MONTO; });
    });

    aplicarCebra(hoja, 2, hoja.rowCount, 7);
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
    hoja.autoFilter = { from: 'A1', to: 'G1' };

    // ---------------- Hoja 3: Impuestos Ley 25413 ----------------
    if (impuestos.length) {
        const hojaImp = workbook.addWorksheet('Impuestos Ley 25413');
        hojaImp.columns = [
            { key: 'CONCEPTO', width: 30 },
            { key: 'PERIODO', width: 12 },
            { key: 'IMPORTE', width: 16 }
        ];
        const encImp = hojaImp.getRow(1);
        encImp.values = ['CONCEPTO', 'PERIODO', 'IMPORTE'];
        estilizarEncabezado(encImp);

        impuestos.forEach(i => {
            const r = hojaImp.addRow([i.CONCEPTO, i.PERIODO, i.IMPORTE]);
            r.getCell(3).numFmt = FMT_MONTO;
        });
        aplicarCebra(hojaImp, 2, hojaImp.rowCount, 3);
    }

    await workbook.xlsx.writeFile(rutaSalida);
    return rutaSalida;
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

async function procesarBancoSupervielle(allFilas, metadata = {}) {
    if (!allFilas || allFilas.length === 0) {
        return { exito: false, error: 'No se recibieron datos del PDF.' };
    }

    const meta = extraerMetadatos(allFilas);
    const { movimientos, impuestos } = extraerMovimientos(allFilas);

    if (!movimientos.length) {
        return { exito: false, error: 'No se encontró la tabla de movimientos.' };
    }

    const { fallas } = validarSaldos(movimientos, meta['Saldo período anterior']);
    if (fallas.length) {
        console.warn(`[Supervielle] ${fallas.length} de ${movimientos.length} movimientos no cierran contra el saldo acumulado.`);
    }

    // El .xlsx se escribe con el mismo nombre del PDF y en su MISMO directorio
    // (nada de subcarpetas output/ o salida/ — ver PARTE 4.2 de la plantilla).
    const baseName = metadata.rutaCompleta
        ? path.basename(metadata.rutaCompleta, path.extname(metadata.rutaCompleta))
        : null;

    let rutaSalida = null;
    if (baseName) {
        rutaSalida = path.join(path.dirname(metadata.rutaCompleta), `${baseName}.xlsx`);
        await generarExcel({ meta, movimientos, impuestos }, rutaSalida);
    }

    return {
        exito: true,
        datos: movimientos,
        metadatos: meta,
        impuestos,
        excelPath: rutaSalida,
        suggestedFileName: baseName ? `${baseName}.xlsx` : 'Supervielle_Extracto.xlsx'
    };
}

module.exports = { procesarBancoSupervielle };

// ============================================================================
// BLOQUE DE PRUEBA INDEPENDIENTE
//   node src/backend/extraerTablasPdf/leer_pdf_Bancos/banco_supervielle.js <pdf>
// ============================================================================

if (require.main === module) {
    (async () => {
        const pdfjsLib = require('pdfjs-dist/build/pdf.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');
        pdfjsLib.GlobalWorkerOptions.standardFontDataUrl =
            path.join(path.dirname(require.resolve('pdfjs-dist/build/pdf.js')), '../standard_fonts/');

        const ruta = process.argv[2];
        if (!ruta) { console.error('Uso: node banco_supervielle.js <ruta_al_pdf>'); return; }

        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await require('fs').promises.readFile(ruta)), verbosity: 0 }).promise;
        const allFilas = [];
        for (let n = 1; n <= pdf.numPages; n++) {
            const content = await (await pdf.getPage(n)).getTextContent();
            const map = new Map();
            content.items.forEach(it => {
                const y = it.transform[5];
                const ye = [...map.keys()].find(k => Math.abs(y - k) <= 5);
                if (ye !== undefined) map.get(ye).push(it); else map.set(y, [it]);
            });
            allFilas.push(...[...map.entries()].sort((a, b) => b[0] - a[0])
                .map(([y, its]) => ({ y, items: its.sort((a, b) => a.transform[4] - b.transform[4]) })));
        }

        const res = await procesarBancoSupervielle(allFilas, { rutaCompleta: ruta, nombreArchivo: path.basename(ruta) });
        if (!res.exito) { console.error('✗ Falló:', res.error); return; }

        const meta = res.metadatos;
        const movs = res.datos;
        const imps = res.impuestos;

        console.log('--- Datos Generales ---');
        Object.keys(meta).forEach(k => console.log(`  ${k}: ${meta[k]}`));

        const { fallas } = validarSaldos(movs, meta['Saldo período anterior']);
        const sumDeb = movs.reduce((a, m) => a + (typeof m.DEBITO === 'number' ? m.DEBITO : 0), 0);
        const sumCre = movs.reduce((a, m) => a + (typeof m.CREDITO === 'number' ? m.CREDITO : 0), 0);

        console.log(`\n--- Movimientos: ${movs.length} ---`);
        console.log(`Con DETALLE adjunto: ${movs.filter(m => m.DETALLE).length}`);
        console.log(`Débitos: ${movs.filter(m => m.DEBITO !== '').length} (${sumDeb.toFixed(2)}) | Créditos: ${movs.filter(m => m.CREDITO !== '').length} (${sumCre.toFixed(2)})`);
        console.log(`Validación de saldo: ${fallas.length === 0 ? '✓ cierran los ' + movs.length : '✗ ' + fallas.length + ' fallas'}`);
        fallas.slice(0, 8).forEach(f => console.log(`   [${f.indice}] esperado ${f.esperado} / leído ${f.leido} :: ${f.mov.FECHA} ${f.mov.DESCRIPCION}`));

        console.log('\n--- Impuestos Ley 25413 ---'); console.table(imps);
        console.log('\n--- Primeros 8 movimientos ---'); console.table(movs.slice(0, 8));
        console.log(`\nExcel: ${res.excelPath}`);
    })();
}
