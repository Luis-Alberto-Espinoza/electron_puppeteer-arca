// afip/planesDePago/resumenClienteExcel.js
// Genera un Excel resumen por cliente (CUIT consultado) agrupando todos sus planes.
// Impagos primero, luego al día. Próximos vencimientos, totales.
// La deuda (banner, KPIs, impagas) sale SOLO de los vigentes; los no vigentes
// (caducos, cancelados...) van al final en su propia sección, en gris.
// ExcelJS + hoja de estilos única (tablasPdf/motor/utils/estilosExcel.js).

const ExcelJS = require('exceljs');
const path = require('path');
const { getDownloadPathContribuyente } = require('../../cliente/carpetaContribuyente.js');
const estilos = require('../../tablasPdf/motor/utils/estilosExcel.js');
const { valorCelda } = require('./excelPlan.js');

const N_COLS = 8;

/**
 * @param {Array} datosResumenPlanes - array de `datosResumen` (uno por plan)
 * @param {Object} usuario - representante (solo para el título)
 * @param {string} cuitConsulta - CUIT consultado
 * @param {string} downloadsPath - ruta base de descargas
 * @param {Object} [opciones]
 * @param {string} [opciones.rangoNoVigentes] - "03/2024 – 06/2025" si se filtró por presentación
 */
async function generar(datosResumenPlanes, usuario, cuitConsulta, downloadsPath, { rangoNoVigentes = null } = {}) {
    try {
        if (!datosResumenPlanes || datosResumenPlanes.length === 0) {
            return { success: false, message: 'Sin planes para resumir' };
        }

        // Carpeta por el OBJETIVO (cuit consultado), no por el representante que
        // loguea: misma carpeta que los PDF/Excel de cada plan.
        const downloadDir = await getDownloadPathContribuyente(downloadsPath, cuitConsulta, '', 'archivos_afip');
        const cuitLimpio = String(cuitConsulta).replace(/-/g, '');
        const fechaISO = new Date().toISOString().slice(0, 10);
        const nombreArchivo = `ResumenCliente_${cuitLimpio}_${fechaISO}.xlsx`;
        const rutaCompleta = path.join(downloadDir, nombreArchivo);

        const wb = new ExcelJS.Workbook();
        construirHoja(wb.addWorksheet('Resumen'), datosResumenPlanes, usuario, cuitLimpio, fechaISO, rangoNoVigentes);
        await wb.xlsx.writeFile(rutaCompleta);

        console.log(`  ✅ Resumen cliente guardado: ${nombreArchivo}`);

        return {
            success: true,
            xlsxPath: rutaCompleta,
            xlsxNombre: nombreArchivo
        };

    } catch (error) {
        console.error('  ❌ Error en resumenClienteExcel:', error.message);
        return { success: false, message: error.message };
    }
}

function construirHoja(hoja, todos, usuario, cuit, fecha, rangoNoVigentes) {
    // Agregados (solo vigentes)
    const planes = todos.filter(p => p.vigente !== false);
    const noVigentes = todos.filter(p => p.vigente === false);
    const planesConImpagas = planes.filter(p => p.cantidadImpagas > 0);
    const planesAlDia = planes.filter(p => p.cantidadImpagas === 0);

    const totalRegularizar = planes.reduce((s, p) => s + (p.montoRegularizarHoy || 0), 0);
    const totalImpagas = planes.reduce((s, p) => s + (p.cantidadImpagas || 0), 0);
    const totalMoraPagada = planes.reduce((s, p) => s + (p.moraPagadaTotal || 0), 0);
    const hayDeuda = totalImpagas > 0;

    let r = 1;

    // --- Título ---
    filaUnida(hoja, r, `RESUMEN PLAN DE PAGOS — ${usuario.nombre || ''}`);
    estilos.estilizarTitulo(hoja.getCell(r, 1));
    hoja.getRow(r).height = 22;
    r++;

    filaUnida(hoja, r, `CUIT consultado: ${cuit}   |   Fecha consulta: ${fecha}`);
    hoja.getCell(r, 1).font = { italic: true, color: { argb: 'FF666666' } };
    r += 2;

    // --- Banner de estado ---
    const soloNoVigentes = planes.length === 0;
    filaUnida(hoja, r, soloNoVigentes
        ? `SIN PLANES VIGENTES — ${noVigentes.length} plan(es) no vigente(s) abajo`
        : hayDeuda
            ? `⚠  CON DEUDA — A REGULARIZAR: $ ${formatearMoneda(totalRegularizar)}`
            : '✓  SIN DEUDAS — Todos los planes vigentes están al día');
    const banner = hoja.getCell(r, 1);
    banner.fill = estilos.relleno(soloNoVigentes ? estilos.COLORES.neutroTexto
        : hayDeuda ? estilos.COLORES.errorTexto : estilos.COLORES.okTexto);
    banner.font = { bold: true, size: 13, color: { argb: estilos.COLORES.textoClaro } };
    banner.alignment = { horizontal: 'center', vertical: 'middle' };
    hoja.getRow(r).height = 32;
    r += 2;

    // --- KPIs resumen ---
    hoja.getRow(r).values = ['Planes vigentes', 'Con impagas', 'Al día', 'Cuotas impagas', 'Monto a regularizar', 'Mora pagada histórica', 'Planes no vigentes'];
    estilos.estilizarEncabezado(hoja.getRow(r));
    r++;
    escribirFila(hoja, r, [
        planes.length, planesConImpagas.length, planesAlDia.length, totalImpagas, totalRegularizar, totalMoraPagada, noVigentes.length
    ], [4, 5]);
    hoja.getRow(r).eachCell(c => {
        c.font = { bold: true, size: 11 };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    r += 2;

    // --- Sección: PLANES CON IMPAGAS ---
    if (planesConImpagas.length > 0) {
        filaUnida(hoja, r, `PLANES CON IMPAGAS (${planesConImpagas.length})`);
        estilos.marcarEstado(hoja.getCell(r, 1), 'error');
        hoja.getCell(r, 1).alignment = { horizontal: 'left', vertical: 'middle' };
        r++;

        hoja.getRow(r).values = ['Plan N°', 'Tipo', 'Cuotas impagas', 'Monto a regularizar', 'Días vencida', 'Próximo intento', 'Motivo último intento'];
        estilos.estilizarEncabezado(hoja.getRow(r));
        r++;

        // Ordenar por días vencida desc
        const impagasOrdenadas = [...planesConImpagas].sort((a, b) => (b.diasVencidaPrimeraImpaga || 0) - (a.diasVencidaPrimeraImpaga || 0));
        for (const p of impagasOrdenadas) {
            escribirFila(hoja, r, [
                p.planNumero || '',
                p.planTipo || '',
                p.cantidadImpagas || 0,
                p.montoRegularizarHoy || 0,
                p.diasVencidaPrimeraImpaga || 0,
                p.fechaReferenciaRegularizacion || '',
                p.motivosFallidos && p.motivosFallidos.length > 0 ? p.motivosFallidos.join(' / ') : ''
            ], [3]);
            pintarFila(hoja, r, 'error');
            estilos.marcarEstado(hoja.getCell(r, 4), 'error'); // monto a regularizar en negrita
            r++;
        }
        r++;
    }

    // --- Sección: PLANES AL DÍA ---
    if (planesAlDia.length > 0) {
        filaUnida(hoja, r, `PLANES AL DÍA (${planesAlDia.length})`);
        estilos.marcarEstado(hoja.getCell(r, 1), 'ok');
        hoja.getCell(r, 1).alignment = { horizontal: 'left', vertical: 'middle' };
        r++;

        hoja.getRow(r).values = ['Plan N°', 'Tipo', 'Cuotas totales', 'Próximo vto.', 'Monto 1° vto.', 'Monto 2° vto.', 'Mora pagada', 'Situación'];
        estilos.estilizarEncabezado(hoja.getRow(r));
        r++;

        // Ordenar por fecha próxima (la más cercana primero)
        const alDiaOrdenados = [...planesAlDia].sort((a, b) => {
            const da = parseFechaArg(a.proximaCuotaFecha);
            const db = parseFechaArg(b.proximaCuotaFecha);
            return (da ? da.getTime() : Infinity) - (db ? db.getTime() : Infinity);
        });
        for (const p of alDiaOrdenados) {
            escribirFila(hoja, r, [
                p.planNumero || '',
                p.planTipo || '',
                p.planCuotas || p.cantidadTotal || '',
                p.proximaCuotaFecha || '—',
                p.proximaCuotaMonto || 0,
                p.proximaCuotaMonto2doVto ?? '',
                p.moraPagadaTotal || 0,
                p.planSituacion || ''
            ], [4, 5, 6]);
            pintarFila(hoja, r, 'ok');
            r++;
        }
        r++;
    }

    // --- Sección: PLANES NO VIGENTES (caducos, cancelados, ...) ---
    if (noVigentes.length > 0) {
        // Si se filtró por rango, que se vea: no es el historial completo
        filaUnida(hoja, r, `PLANES NO VIGENTES (${noVigentes.length})`
            + (rangoNoVigentes ? ` — presentados ${rangoNoVigentes}` : ''));
        estilos.marcarEstado(hoja.getCell(r, 1), 'neutro');
        hoja.getCell(r, 1).alignment = { horizontal: 'left', vertical: 'middle' };
        r++;

        hoja.getRow(r).values = ['Plan N°', 'Situación', 'Tipo', 'Presentación', 'Cuotas totales', 'Canceladas', 'Impagas', 'Total pagado'];
        estilos.estilizarEncabezado(hoja.getRow(r));
        r++;

        // Agrupados por situación (todos los caducos juntos, etc.), el más nuevo primero
        const ordenados = [...noVigentes].sort((a, b) =>
            (a.planEstado || '').localeCompare(b.planEstado || '') ||
            ((parseFechaArg(b.planPresentacion) || 0) - (parseFechaArg(a.planPresentacion) || 0)));
        for (const p of ordenados) {
            escribirFila(hoja, r, [
                p.planNumero || '',
                p.planEstado || '',
                p.planTipo || '',
                p.planPresentacion || '',
                p.planCuotas || p.cantidadTotal || '',
                p.cantidadCanceladas || 0,
                p.cantidadImpagas || 0,
                p.totalPagado || 0
            ], [7]);
            pintarFila(hoja, r, 'neutro');
            r++;
        }
        r++;
    }

    // --- Pie: nota informativa ---
    filaUnida(hoja, r, 'Abrir el PDF/Excel de cada plan para ver el detalle de cuotas e intentos de cobro (carpetas Planes_<situación>).');
    hoja.getCell(r, 1).font = { italic: true, size: 9, color: { argb: 'FF777777' } };

    estilos.autoajustarAnchos(hoja, N_COLS, { minimo: 12 });
    estilos.ajustarImpresion(hoja);
}

// ─── Helpers ───

// Texto en la columna A unido a lo ancho de la tabla, alineado al centro.
function filaUnida(hoja, r, texto) {
    hoja.getCell(r, 1).value = texto;
    hoja.mergeCells(r, 1, r, N_COLS);
    hoja.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' };
}

// Escribe valores (montos en las columnas `colsMonto`, base 0) con formato y borde.
function escribirFila(hoja, r, valores, colsMonto) {
    valores.forEach((v, c) => {
        const celda = hoja.getCell(r, c + 1);
        const esMonto = colsMonto.includes(c);
        celda.value = valorCelda(v, esMonto);
        celda.border = estilos.BORDE_FINO;
        if (esMonto) {
            celda.numFmt = estilos.FMT_MONTO_MILES;
            celda.alignment = { horizontal: 'right', vertical: 'middle' };
        } else if (celda.value instanceof Date) {
            celda.numFmt = estilos.FMT_FECHA;
            celda.alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
            celda.alignment = { horizontal: typeof celda.value === 'number' ? 'center' : 'left', vertical: 'middle' };
        }
    });
}

function pintarFila(hoja, r, estado) {
    for (let c = 1; c <= N_COLS; c++) estilos.marcarEstado(hoja.getCell(r, c), estado, { destacar: false });
}

function parseFechaArg(texto) {
    if (!texto) return null;
    const m = String(texto).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

function formatearMoneda(n) {
    if (typeof n !== 'number') n = 0;
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { generar };
