// afip/planesDePago/resumenClienteExcel.js
// Genera un Excel resumen por cliente (CUIT consultado) agrupando todos sus planes.
// Impagos primero, luego al día. Próximos vencimientos, totales.

const XLSX = require('xlsx-js-style');
const path = require('path');
const { getDownloadPath } = require('../../utils/fileManager.js');

// Paleta
const COLOR_HEADER_BG   = { rgb: 'FF2C3E50' };
const COLOR_HEADER_FG   = { rgb: 'FFFFFFFF' };
const COLOR_IMPAGA_BG   = { rgb: 'FFF8D7DA' };
const COLOR_IMPAGA_FG   = { rgb: 'FF922B21' };
const COLOR_OK_BG       = { rgb: 'FFDFF0D8' };
const COLOR_OK_FG       = { rgb: 'FF1E6631' };
const COLOR_WARN_BG     = { rgb: 'FFFDEBD0' };
const COLOR_WARN_FG     = { rgb: 'FFB9770E' };
const COLOR_TITULO      = { rgb: 'FF2C3E50' };
const COLOR_BANNER_BG_ROJO   = { rgb: 'FFE74C3C' };
const COLOR_BANNER_BG_VERDE  = { rgb: 'FF27AE60' };
const COLOR_BANNER_FG   = { rgb: 'FFFFFFFF' };

const BORDE_FINO = { style: 'thin', color: { rgb: 'FFCCCCCC' } };
const BORDES_DEFAULT = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };

/**
 * @param {Array} datosResumenPlanes - array de `datosResumen` (uno por plan)
 * @param {Object} usuario - representante
 * @param {string} cuitConsulta - CUIT consultado
 * @param {string} downloadsPath - ruta base de descargas
 */
function generar(datosResumenPlanes, usuario, cuitConsulta, downloadsPath) {
    try {
        if (!datosResumenPlanes || datosResumenPlanes.length === 0) {
            return { success: false, message: 'Sin planes para resumir' };
        }

        const nombreUsuario = usuario.nombre || 'sin_nombre';
        const downloadDir = getDownloadPath(downloadsPath, nombreUsuario, 'archivos_afip');
        const cuitLimpio = String(cuitConsulta).replace(/-/g, '');
        const fechaISO = new Date().toISOString().slice(0, 10);
        const nombreArchivo = `ResumenCliente_${cuitLimpio}_${fechaISO}.xlsx`;
        const rutaCompleta = path.join(downloadDir, nombreArchivo);

        const wb = XLSX.utils.book_new();
        const ws = construirHoja(datosResumenPlanes, usuario, cuitLimpio, fechaISO);
        XLSX.utils.book_append_sheet(wb, ws, 'Resumen');
        XLSX.writeFile(wb, rutaCompleta);

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

function construirHoja(planes, usuario, cuit, fecha) {
    // Agregados
    const planesConImpagas = planes.filter(p => p.cantidadImpagas > 0);
    const planesAlDia = planes.filter(p => p.cantidadImpagas === 0);

    const totalRegularizar = planes.reduce((s, p) => s + (p.montoRegularizarHoy || 0), 0);
    const totalImpagas = planes.reduce((s, p) => s + (p.cantidadImpagas || 0), 0);
    const totalMoraPagada = planes.reduce((s, p) => s + (p.moraPagadaTotal || 0), 0);
    const hayDeuda = totalImpagas > 0;

    const rows = [];
    const merges = [];
    const cellMeta = [];

    // --- Título ---
    rows.push([`RESUMEN PLAN DE PAGOS — ${usuario.nombre || ''}`]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } });
    cellMeta.push({ r: 0, c: 0, style: { font: { bold: true, sz: 14, color: COLOR_TITULO }, alignment: { horizontal: 'center' } } });

    rows.push([`CUIT consultado: ${cuit}   |   Fecha consulta: ${fecha}`]);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 6 } });
    cellMeta.push({ r: 1, c: 0, style: { font: { italic: true, sz: 10, color: { rgb: 'FF666666' } }, alignment: { horizontal: 'center' } } });

    rows.push([]); // separador

    // --- Banner de estado ---
    const bannerRowIdx = rows.length;
    const bannerTexto = hayDeuda
        ? `⚠  CON DEUDA — A REGULARIZAR: $ ${formatearMoneda(totalRegularizar)}`
        : `✓  SIN DEUDAS — Todos los planes están al día`;
    rows.push([bannerTexto]);
    merges.push({ s: { r: bannerRowIdx, c: 0 }, e: { r: bannerRowIdx, c: 6 } });
    cellMeta.push({
        r: bannerRowIdx, c: 0,
        style: {
            font: { bold: true, sz: 13, color: COLOR_BANNER_FG },
            fill: { patternType: 'solid', fgColor: hayDeuda ? COLOR_BANNER_BG_ROJO : COLOR_BANNER_BG_VERDE },
            alignment: { horizontal: 'center', vertical: 'center' }
        }
    });

    rows.push([]); // separador

    // --- KPIs resumen ---
    const kpiRowIdx = rows.length;
    rows.push([
        'Planes consultados', 'Con impagas', 'Al día', 'Cuotas impagas', 'Monto a regularizar', 'Mora pagada histórica', ''
    ]);
    for (let c = 0; c < 6; c++) {
        cellMeta.push({
            r: kpiRowIdx, c,
            style: {
                font: { bold: true, color: COLOR_HEADER_FG, sz: 10 },
                fill: { patternType: 'solid', fgColor: COLOR_HEADER_BG },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: BORDES_DEFAULT
            }
        });
    }
    const kpiValoresIdx = rows.length;
    rows.push([
        planes.length,
        planesConImpagas.length,
        planesAlDia.length,
        totalImpagas,
        totalRegularizar,
        totalMoraPagada,
        ''
    ]);
    for (let c = 0; c < 6; c++) {
        const style = {
            font: { bold: true, sz: 11 },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: BORDES_DEFAULT
        };
        if (c === 4 || c === 5) style.numFmt = '#,##0.00';
        cellMeta.push({ r: kpiValoresIdx, c, style });
    }

    rows.push([]); // separador

    // --- Sección: PLANES CON IMPAGAS ---
    if (planesConImpagas.length > 0) {
        const titRowIdx = rows.length;
        rows.push([`PLANES CON IMPAGAS (${planesConImpagas.length})`]);
        merges.push({ s: { r: titRowIdx, c: 0 }, e: { r: titRowIdx, c: 6 } });
        cellMeta.push({
            r: titRowIdx, c: 0,
            style: {
                font: { bold: true, sz: 11, color: COLOR_IMPAGA_FG },
                fill: { patternType: 'solid', fgColor: COLOR_IMPAGA_BG },
                alignment: { horizontal: 'left', vertical: 'center' }
            }
        });

        const headersRowIdx = rows.length;
        const headers = ['Plan N°', 'Tipo', 'Cuotas impagas', 'Monto a regularizar', 'Días vencida', 'Próximo intento', 'Motivo último intento'];
        rows.push(headers);
        escribirHeaders(cellMeta, headersRowIdx, headers.length);

        // Ordenar por días vencida desc
        const impagasOrdenadas = [...planesConImpagas].sort((a, b) => (b.diasVencidaPrimeraImpaga || 0) - (a.diasVencidaPrimeraImpaga || 0));

        for (const p of impagasOrdenadas) {
            const rowIdx = rows.length;
            rows.push([
                p.planNumero || '',
                p.planTipo || '',
                p.cantidadImpagas || 0,
                p.montoRegularizarHoy || 0,
                p.diasVencidaPrimeraImpaga || 0,
                p.fechaReferenciaRegularizacion || '',
                p.motivosFallidos && p.motivosFallidos.length > 0 ? p.motivosFallidos.join(' / ') : ''
            ]);
            aplicarEstiloFilaImpaga(cellMeta, rowIdx, 7);
            cellMeta.push({ r: rowIdx, c: 3, style: { numFmt: '#,##0.00', font: { bold: true, color: COLOR_IMPAGA_FG }, fill: { patternType: 'solid', fgColor: COLOR_IMPAGA_BG }, border: BORDES_DEFAULT, alignment: { horizontal: 'right', vertical: 'center' } } });
        }

        rows.push([]); // separador
    }

    // --- Sección: PLANES AL DÍA ---
    if (planesAlDia.length > 0) {
        const titRowIdx = rows.length;
        rows.push([`PLANES AL DÍA (${planesAlDia.length})`]);
        merges.push({ s: { r: titRowIdx, c: 0 }, e: { r: titRowIdx, c: 6 } });
        cellMeta.push({
            r: titRowIdx, c: 0,
            style: {
                font: { bold: true, sz: 11, color: COLOR_OK_FG },
                fill: { patternType: 'solid', fgColor: COLOR_OK_BG },
                alignment: { horizontal: 'left', vertical: 'center' }
            }
        });

        const headersRowIdx = rows.length;
        const headers = ['Plan N°', 'Tipo', 'Cuotas totales', 'Próximo vto.', 'Próximo monto', 'Mora pagada', 'Situación'];
        rows.push(headers);
        escribirHeaders(cellMeta, headersRowIdx, headers.length);

        // Ordenar por fecha próxima (la más cercana primero)
        const alDiaOrdenados = [...planesAlDia].sort((a, b) => {
            const da = parseFechaArg(a.proximaCuotaFecha);
            const db = parseFechaArg(b.proximaCuotaFecha);
            const ta = da ? da.getTime() : Infinity;
            const tb = db ? db.getTime() : Infinity;
            return ta - tb;
        });

        for (const p of alDiaOrdenados) {
            const rowIdx = rows.length;
            rows.push([
                p.planNumero || '',
                p.planTipo || '',
                p.planCuotas || p.cantidadTotal || '',
                p.proximaCuotaFecha || '—',
                p.proximaCuotaMonto || 0,
                p.moraPagadaTotal || 0,
                p.planSituacion || ''
            ]);
            aplicarEstiloFilaOk(cellMeta, rowIdx, 7);
            cellMeta.push({ r: rowIdx, c: 4, style: { numFmt: '#,##0.00', font: { color: COLOR_OK_FG }, border: BORDES_DEFAULT, alignment: { horizontal: 'right', vertical: 'center' } } });
            cellMeta.push({ r: rowIdx, c: 5, style: { numFmt: '#,##0.00', font: { color: COLOR_OK_FG }, border: BORDES_DEFAULT, alignment: { horizontal: 'right', vertical: 'center' } } });
        }

        rows.push([]); // separador
    }

    // --- Pie: nota informativa ---
    const pieRowIdx = rows.length;
    rows.push(['Abrir el PDF/Excel de cada plan para ver el detalle de cuotas e intentos de cobro.']);
    merges.push({ s: { r: pieRowIdx, c: 0 }, e: { r: pieRowIdx, c: 6 } });
    cellMeta.push({
        r: pieRowIdx, c: 0,
        style: { font: { italic: true, sz: 9, color: { rgb: 'FF777777' } }, alignment: { horizontal: 'center' } }
    });

    // --- Crear worksheet ---
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = merges;

    // Aplicar metadata
    for (const meta of cellMeta) {
        const addr = XLSX.utils.encode_cell({ r: meta.r, c: meta.c });
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        if (meta.style) ws[addr].s = meta.style;
        if (meta.style && meta.style.numFmt) ws[addr].z = meta.style.numFmt;
    }

    ws['!cols'] = [
        { wch: 14 }, { wch: 15 }, { wch: 16 }, { wch: 20 },
        { wch: 14 }, { wch: 22 }, { wch: 30 }
    ];

    // Altura del banner
    ws['!rows'] = [];
    ws['!rows'][bannerRowIdx] = { hpt: 32 };

    return ws;
}

// Helpers de estilo
function escribirHeaders(cellMeta, r, nCols) {
    for (let c = 0; c < nCols; c++) {
        cellMeta.push({
            r, c,
            style: {
                font: { bold: true, color: COLOR_HEADER_FG, sz: 10 },
                fill: { patternType: 'solid', fgColor: COLOR_HEADER_BG },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: BORDES_DEFAULT
            }
        });
    }
}

function aplicarEstiloFilaImpaga(cellMeta, r, nCols) {
    for (let c = 0; c < nCols; c++) {
        cellMeta.push({
            r, c,
            style: {
                font: { color: COLOR_IMPAGA_FG },
                fill: { patternType: 'solid', fgColor: COLOR_IMPAGA_BG },
                border: BORDES_DEFAULT,
                alignment: { horizontal: c >= 2 && c <= 4 ? 'center' : 'left', vertical: 'center' }
            }
        });
    }
}

function aplicarEstiloFilaOk(cellMeta, r, nCols) {
    for (let c = 0; c < nCols; c++) {
        cellMeta.push({
            r, c,
            style: {
                font: { color: COLOR_OK_FG },
                fill: { patternType: 'solid', fgColor: COLOR_OK_BG },
                border: BORDES_DEFAULT,
                alignment: { horizontal: c >= 2 ? 'center' : 'left', vertical: 'center' }
            }
        });
    }
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
