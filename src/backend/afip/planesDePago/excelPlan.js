/**
 * Excel POR PLAN: un .xlsx con una hoja por sección del plan
 *   Pagos | Plan de Pago | Oblig. Impositivas | Oblig. Previsionales
 * (solo las que el plan tiene). Usa ExcelJS + la hoja de estilos única
 * (tablasPdf/motor/utils/estilosExcel.js), montos con separador de miles.
 *
 * Trabaja sobre el "modelo" genérico de tabla (ver paso_8_extraerSeccion):
 *   { cabecera, columnas: [{ titulo, numero }], bloques: [{ filas, total, marcas? }],
 *     mergeCols, etiquetaSubfila? }
 * En el Excel NO hay celdas combinadas en los datos (rompen filtros y sumas):
 * ver aplanar().
 */

const ExcelJS = require('exceljs');
const path = require('path');
const { parseNumero } = require('./datosResumenBuilder.js');
const estilos = require('../../tablasPdf/motor/utils/estilosExcel.js');

const FILA_ENCABEZADO = 4; // 1 título, 2 subtítulo, 3 en blanco

/**
 * Convierte la extracción de "Ver Pagos" (paso_5) al modelo genérico.
 * Cada cuota es un bloque con una fila por intento de débito.
 */
function modeloPagos(extraccion) {
    const cuotas = (extraccion && extraccion.cuotasAgrupadas) || [];
    const bloques = cuotas.map(cuota => {
        const intentos = cuota.intentos && cuota.intentos.length ? cuota.intentos : [{}];
        const filas = [];
        const marcas = [];
        intentos.forEach((it, i) => {
            const pago = it.fuePagado ? 'Pago' : it.fueFallido ? (it.motivo || 'Intento fallido') : (it.motivoTexto || '');
            filas.push([
                i === 0 ? cuota.cuotaNro || '' : '',
                i === 0 ? cuota.capital || '' : '',
                it.interesFinanciero || '', it.interesResarcitorio || '', it.total || '',
                it.fecha || '', pago,
                i === 0 ? cuota.estado || '' : ''
            ]);
            const marca = {};
            if (it.fuePagado) marca[6] = 'ok';
            else if (it.fueFallido) marca[6] = 'aviso';
            if (cuota.estaImpaga) marca[7] = 'error';
            else if (cuota.fueCancelada) marca[7] = 'ok';
            marcas.push(marca);
        });
        return { filas, marcas, total: false };
    });

    const t = extraccion && extraccion.totales;
    if (t && (t.totalPagado || t.capitalPagado)) {
        bloques.push({
            filas: [['Total Pagado', t.capitalPagado, t.interesFinancieroPagado, t.moraPagada, t.totalPagado, '', '', '']],
            total: true
        });
    }

    return {
        cabecera: {},
        columnas: [
            { titulo: 'Cuota N°' }, { titulo: 'Capital ($)', numero: true },
            { titulo: 'Interés Financiero ($)', numero: true }, { titulo: 'Interés Resarcitorio ($)', numero: true },
            { titulo: 'Total ($)', numero: true }, { titulo: 'Fecha Venc.' },
            { titulo: 'Pago / Motivo' }, { titulo: 'Estado' }
        ],
        bloques,
        mergeCols: [0, 1, 7],
        etiquetaSubfila: 'Intento'
    };
}

/**
 * Aplana los bloques de varias filas para que el Excel se pueda filtrar y sumar:
 *   - agrega una columna (etiquetaSubfila: "Vencimiento"/"Intento") con 1°, 2°…,
 *   - repite en cada fila las celdas unidas de TEXTO (ej: Cuota N°, Estado),
 *   - NO repite los montos unidos (ej: Capital), para no duplicar la suma.
 * Si ningún bloque tiene varias filas (Obligaciones), queda igual.
 */
function aplanar(modelo) {
    const { columnas, bloques, mergeCols } = modelo;
    if (!bloques.some(b => b.filas.length > 1)) return modelo;

    const repetir = (c) => mergeCols.includes(c) && !(columnas[c] && columnas[c].numero);
    const correr = (marca) => {
        if (!marca) return marca;
        const nueva = {};
        for (const [c, v] of Object.entries(marca)) nueva[Number(c) === 0 ? 0 : Number(c) + 1] = v;
        return nueva;
    };
    return {
        ...modelo,
        columnas: [columnas[0], { titulo: modelo.etiquetaSubfila || 'Vencimiento' }, ...columnas.slice(1)],
        bloques: bloques.map(b => ({
            total: b.total,
            marcas: b.marcas && b.marcas.map((m, i) => {
                // la marca de una celda repetida también se repite
                const base = { ...(i > 0 ? pick(b.marcas[0], mergeCols.filter(repetir)) : {}), ...m };
                return correr(base);
            }),
            filas: b.filas.map((fila, i) => {
                const llena = fila.map((v, c) => (i > 0 && repetir(c)) ? b.filas[0][c] : v);
                // Un total de una sola fila (ej: "Total Pagado") no tiene 1°/2°
                const orden = (b.total && b.filas.length === 1) ? '' : `${i + 1}°`;
                return [llena[0], orden, ...llena.slice(1)];
            })
        })),
        mergeCols: []
    };
}

function pick(obj, claves) {
    const r = {};
    for (const k of claves) if (obj && obj[k] !== undefined) r[k] = obj[k];
    return r;
}

// Valor de celda para Excel: montos → número redondeado a centavos (sumar
// decimales deja ruido tipo 79488.01999999999); enteros en texto ("2026", "6") →
// número (evita el "número guardado como texto"); "dd/mm/aaaa" → fecha real
// (ordena y filtra bien); vacío → null.
function valorCelda(valor, esMonto) {
    if (valor === '' || valor === null || valor === undefined) return null;
    if (esMonto) return Math.round(parseNumero(valor) * 100) / 100;
    const texto = String(valor);
    if (/^\d{1,9}$/.test(texto)) return Number(texto);
    const f = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (f) return new Date(Date.UTC(Number(f[3]), Number(f[2]) - 1, Number(f[1])));
    return valor;
}

function agregarHoja(wb, { nombre, titulo, modelo }, subtitulo) {
    const m = aplanar(modelo);
    const nCols = m.columnas.length;
    const hoja = wb.addWorksheet(nombre.slice(0, 31));

    hoja.getCell(1, 1).value = titulo;
    estilos.estilizarTitulo(hoja.getCell(1, 1));
    hoja.mergeCells(1, 1, 1, nCols);
    hoja.getRow(1).height = 22;

    hoja.getCell(2, 1).value = subtitulo;
    hoja.getCell(2, 1).font = { italic: true, color: { argb: 'FF666666' } };
    hoja.mergeCells(2, 1, 2, nCols);

    hoja.getRow(FILA_ENCABEZADO).values = m.columnas.map(c => c.titulo);

    let r = FILA_ENCABEZADO + 1;
    let ultimaDatos = FILA_ENCABEZADO;
    for (const bloque of m.bloques) {
        bloque.filas.forEach((fila, i) => {
            const row = hoja.getRow(r);
            row.values = fila.map((v, c) => valorCelda(v, m.columnas[c] && m.columnas[c].numero));
            row.eachCell(celda => {
                if (celda.value instanceof Date) {
                    celda.numFmt = estilos.FMT_FECHA;
                    celda.alignment = { horizontal: 'center', vertical: 'middle' };
                }
            });
            if (bloque.total) {
                for (let c = 1; c <= nCols; c++) {
                    const celda = row.getCell(c);
                    celda.fill = estilos.FILL_RESALTADO;
                    celda.font = { bold: true };
                }
            }
            const marca = bloque.marcas && bloque.marcas[i];
            if (marca) {
                for (const [c, estado] of Object.entries(marca)) estilos.marcarEstado(row.getCell(Number(c) + 1), estado);
            }
            if (!bloque.total) ultimaDatos = r;
            r++;
        });
    }

    estilos.estilizarTabla(hoja, { filaEncabezado: FILA_ENCABEZADO, fmtMonto: estilos.FMT_MONTO_MILES });
    // Autofiltro solo sobre los datos: que filtrar no esconda los totales.
    if (ultimaDatos > FILA_ENCABEZADO) {
        hoja.autoFilter = { from: { row: FILA_ENCABEZADO, column: 1 }, to: { row: ultimaDatos, column: nCols } };
    }
    estilos.ajustarImpresion(hoja);
}

function armarSubtitulo(cab, cuit, fecha) {
    const partes = [`CUIT: ${cuit}`];
    if (cab && cab.nombre) partes.push(cab.nombre);
    if (cab && cab.descripcion) partes.push(cab.descripcion);
    if (cab && cab.fechaConsolidacion) partes.push(`Consolidación: ${cab.fechaConsolidacion}`);
    if (cab && cab.tipoPlan) partes.push(`Tipo: ${cab.tipoPlan}`);
    partes.push(`Consulta: ${fecha}`);
    return partes.join(' | ');
}

/**
 * @param {Object} p
 * @param {Array} p.hojas - [{ nombre, titulo, modelo }]
 * @param {Object} p.plan - { numero }
 * @param {string} p.cuit
 * @param {string} p.downloadDir
 * @returns {Promise<{success, xlsxPath?, xlsxNombre?, message?}>}
 */
async function generar({ hojas, plan, cuit, downloadDir }) {
    try {
        if (!hojas || hojas.length === 0) return { success: false, message: 'Sin hojas para el Excel' };

        const cuitLimpio = String(cuit).replace(/-/g, '');
        const fecha = new Date().toISOString().slice(0, 10);
        const xlsxNombre = `Plan${plan.numero || 'SinNumero'}_${cuitLimpio}_${fecha}.xlsx`;
        const xlsxPath = path.join(downloadDir, xlsxNombre);

        const cabecera = (hojas.find(h => h.modelo.cabecera && h.modelo.cabecera.nroPlan) || {}).modelo;
        const subtitulo = armarSubtitulo(cabecera && cabecera.cabecera, cuitLimpio, fecha);

        const wb = new ExcelJS.Workbook();
        for (const h of hojas) agregarHoja(wb, h, subtitulo);
        await wb.xlsx.writeFile(xlsxPath);

        console.log(`  ✅ Excel del plan guardado (${hojas.map(h => h.nombre).join(', ')}): ${xlsxNombre}`);
        return { success: true, xlsxPath, xlsxNombre };
    } catch (error) {
        console.error('  ❌ Error generando Excel del plan:', error.message);
        return { success: false, message: error.message };
    }
}

module.exports = { generar, modeloPagos, armarSubtitulo, valorCelda };
