/**
 * PASO 7: Generar Excel del plan (mismo contenido que el PDF)
 *
 * Al lado del PDF genera un .xlsx con la tabla de pagos. Los números se
 * escriben como número (no texto) para que el contador pueda operar con
 * ellos. Aplica colores: impaga=rojo, cancelada=verde, intento fallido=ámbar.
 */

const XLSX = require('xlsx-js-style');
const path = require('path');
const { parseNumero } = require('../../../../afip/planesDePago/datosResumenBuilder.js');

// Paleta
const COLOR_HEADER_BG   = { rgb: 'FF2C3E50' };
const COLOR_HEADER_FG   = { rgb: 'FFFFFFFF' };
const COLOR_IMPAGA_BG   = { rgb: 'FFF8D7DA' };
const COLOR_IMPAGA_FG   = { rgb: 'FF922B21' };
const COLOR_OK_BG       = { rgb: 'FFDFF0D8' };
const COLOR_OK_FG       = { rgb: 'FF1E6631' };
const COLOR_FALLIDO_BG  = { rgb: 'FFFDEBD0' };
const COLOR_FALLIDO_FG  = { rgb: 'FFB9770E' };
const COLOR_TOTALES_BG  = { rgb: 'FFD9EDF7' };
const COLOR_TOTALES_FG  = { rgb: 'FF1F5F7A' };

const BORDE_FINO = { style: 'thin', color: { rgb: 'FFCCCCCC' } };
const BORDES_DEFAULT = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };

function ejecutar(datosTabla, infoPlan, usuario, cuitConsulta, pdfInfo) {
    try {
        if (!pdfInfo || !pdfInfo.downloadDir) {
            return { success: false, message: 'Falta downloadDir del PDF' };
        }

        const numeroPlan = infoPlan.numero || 'SinNumero';
        console.log(`  → Paso 7: Generando Excel del plan #${numeroPlan}...`);

        const cuitLimpio = String(cuitConsulta).replace(/-/g, '');
        const fechaDescarga = new Date().toISOString().slice(0, 10);
        const finalFilename = `PlanDePago_${cuitLimpio}_Plan${numeroPlan}_${fechaDescarga}.xlsx`;
        const destPath = path.join(pdfInfo.downloadDir, finalFilename);

        const wb = XLSX.utils.book_new();
        const ws = construirHoja(datosTabla, infoPlan, cuitLimpio, fechaDescarga);
        XLSX.utils.book_append_sheet(wb, ws, 'Detalle de Pagos');
        XLSX.writeFile(wb, destPath);

        console.log(`  ✅ Excel guardado: ${finalFilename}`);

        return {
            success: true,
            xlsxPath: destPath,
            xlsxNombre: finalFilename
        };

    } catch (error) {
        console.error('  ❌ Error en paso_7_generarExcelPlan:', error.message);
        return { success: false, message: error.message };
    }
}

function construirHoja(datosTabla, infoPlan, cuit, fecha) {
    const cuotas = (datosTabla && datosTabla.cuotasAgrupadas) || [];
    const totales = (datosTabla && datosTabla.totales) || {};

    // Arrancamos construyendo una matriz AOA (arrays of arrays) para tener
    // control total sobre cada celda y merges.
    const rows = [];
    const merges = [];
    const cellMeta = []; // { r, c, style, numFmt, type }

    // --- Header ---
    rows.push([`Detalle de Pagos - Plan N° ${infoPlan.numero || ''}`]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } });
    cellMeta.push({ r: 0, c: 0, style: { font: { bold: true, sz: 14, color: { rgb: 'FF2C3E50' } }, alignment: { horizontal: 'center' } } });

    const subtituloPartes = [`CUIT: ${cuit}`, `Consulta: ${fecha}`];
    if (infoPlan.cuotas) subtituloPartes.push(`Cuotas: ${infoPlan.cuotas}`);
    if (infoPlan.tipo) subtituloPartes.push(`Tipo: ${infoPlan.tipo}`);
    if (infoPlan.situacion) subtituloPartes.push(`Situación: ${infoPlan.situacion}`);
    rows.push([subtituloPartes.join(' | ')]);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 7 } });
    cellMeta.push({ r: 1, c: 0, style: { font: { italic: true, sz: 10, color: { rgb: 'FF666666' } }, alignment: { horizontal: 'center' } } });

    rows.push([]); // fila en blanco

    // --- Encabezados de tabla ---
    const headerRowIdx = rows.length;
    const headers = [
        'Cuota N°', 'Capital ($)', 'Interés Financiero ($)', 'Interés Resarcitorio ($)',
        'Total ($)', 'Fecha Venc.', 'Pago / Motivo', 'Estado'
    ];
    rows.push(headers);
    for (let c = 0; c < headers.length; c++) {
        cellMeta.push({
            r: headerRowIdx, c,
            style: {
                font: { bold: true, color: COLOR_HEADER_FG },
                fill: { patternType: 'solid', fgColor: COLOR_HEADER_BG },
                alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
                border: BORDES_DEFAULT
            }
        });
    }

    // --- Filas de cuotas (con merges verticales en col 0, 1 y 7) ---
    for (const cuota of cuotas) {
        const intentos = cuota.intentos || [];
        const rowspan = intentos.length || 1;
        const firstRowIdx = rows.length;

        const estadoEsImpaga = cuota.estaImpaga;
        const estadoEsOk = cuota.fueCancelada;

        const fillEstado = estadoEsImpaga ? COLOR_IMPAGA_BG : estadoEsOk ? COLOR_OK_BG : null;
        const fontEstado = estadoEsImpaga ? COLOR_IMPAGA_FG : estadoEsOk ? COLOR_OK_FG : null;

        for (let i = 0; i < Math.max(rowspan, 1); i++) {
            const intento = intentos[i] || {};
            const esPrimeraFila = i === 0;

            const pagoTexto = intento.fuePagado ? 'Pago'
                : intento.fueFallido ? (intento.motivo || 'Intento fallido')
                : (intento.motivoTexto || '');

            const row = [
                esPrimeraFila ? (cuota.cuotaNro || '') : '',
                esPrimeraFila ? parseNumero(cuota.capital) : '',
                parseNumero(intento.interesFinanciero),
                parseNumero(intento.interesResarcitorio),
                parseNumero(intento.total),
                intento.fecha || '',
                pagoTexto,
                esPrimeraFila ? (cuota.estado || '') : ''
            ];
            rows.push(row);

            const rowIdx = firstRowIdx + i;

            // Estilos por columna
            for (let c = 0; c < row.length; c++) {
                const style = { border: BORDES_DEFAULT, alignment: { horizontal: c === 0 || c === 5 || c === 6 || c === 7 ? 'center' : 'right', vertical: 'center' } };

                // Fondo "Estado" para toda la fila si impaga / ok (solo sutil en fila principal)
                if (esPrimeraFila && fillEstado && c === 7) {
                    style.fill = { patternType: 'solid', fgColor: fillEstado };
                    style.font = { bold: true, color: fontEstado };
                }

                // Formato número para capital, intF, intR, total
                if (c >= 1 && c <= 4) {
                    style.numFmt = '#,##0.00';
                }

                // Columna "Pago / Motivo"
                if (c === 6) {
                    if (intento.fuePagado) {
                        style.font = { bold: true, color: COLOR_OK_FG };
                        style.fill = { patternType: 'solid', fgColor: COLOR_OK_BG };
                    } else if (intento.fueFallido) {
                        style.font = { italic: true, color: COLOR_FALLIDO_FG };
                        style.fill = { patternType: 'solid', fgColor: COLOR_FALLIDO_BG };
                    }
                }

                cellMeta.push({ r: rowIdx, c, style });
            }
        }

        // Merges verticales para col 0 (cuotaNro), 1 (capital), 7 (estado)
        if (rowspan > 1) {
            merges.push({ s: { r: firstRowIdx, c: 0 }, e: { r: firstRowIdx + rowspan - 1, c: 0 } });
            merges.push({ s: { r: firstRowIdx, c: 1 }, e: { r: firstRowIdx + rowspan - 1, c: 1 } });
            merges.push({ s: { r: firstRowIdx, c: 7 }, e: { r: firstRowIdx + rowspan - 1, c: 7 } });
        }
    }

    // --- Fila de totales ---
    if (totales && (totales.totalPagado || totales.capitalPagado)) {
        const rowIdx = rows.length;
        rows.push([
            'Total Pagado:',
            parseNumero(totales.capitalPagado),
            parseNumero(totales.interesFinancieroPagado),
            parseNumero(totales.moraPagada),
            parseNumero(totales.totalPagado),
            '', '', ''
        ]);
        merges.push({ s: { r: rowIdx, c: 5 }, e: { r: rowIdx, c: 7 } });

        for (let c = 0; c < 8; c++) {
            const style = {
                font: { bold: true, color: COLOR_TOTALES_FG },
                fill: { patternType: 'solid', fgColor: COLOR_TOTALES_BG },
                border: BORDES_DEFAULT,
                alignment: { horizontal: c === 0 ? 'center' : 'right', vertical: 'center' }
            };
            if (c >= 1 && c <= 4) style.numFmt = '#,##0.00';
            cellMeta.push({ r: rowIdx, c, style });
        }
    }

    // --- Crear hoja con AOA y aplicar merges/styles ---
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = merges;

    // Aplicar metadata a celdas
    for (const meta of cellMeta) {
        const addr = XLSX.utils.encode_cell({ r: meta.r, c: meta.c });
        if (!ws[addr]) {
            ws[addr] = { t: 's', v: '' };
        }
        if (meta.style) ws[addr].s = meta.style;
        if (meta.style && meta.style.numFmt) ws[addr].z = meta.style.numFmt;
    }

    // Anchos de columna
    ws['!cols'] = [
        { wch: 10 },  // Cuota N°
        { wch: 15 },  // Capital
        { wch: 18 },  // Int. Financiero
        { wch: 18 },  // Int. Resarcitorio
        { wch: 15 },  // Total
        { wch: 12 },  // Fecha
        { wch: 28 },  // Pago / Motivo
        { wch: 16 }   // Estado
    ];

    // Congelar encabezados
    ws['!freeze'] = { xSplit: 0, ySplit: headerRowIdx + 1 };

    // Autofilter desde la fila de headers
    const rangoMax = XLSX.utils.decode_range(ws['!ref']);
    ws['!autofilter'] = {
        ref: XLSX.utils.encode_range({
            s: { r: headerRowIdx, c: 0 },
            e: { r: rangoMax.e.r, c: 7 }
        })
    };

    return ws;
}

module.exports = { ejecutar };
