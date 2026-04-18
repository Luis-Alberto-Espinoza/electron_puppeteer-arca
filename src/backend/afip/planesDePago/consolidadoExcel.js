// afip/planesDePago/consolidadoExcel.js
// Genera un archivo Excel consolidado con el resultado del lote de Planes de Pago.
// Tres hojas: Resumen por cliente | Detalle por plan | Cuotas impagas
// Ubicación: gestor_afip_atm/consolidados_afip/planes_de_pago/
// Colores y formateo numérico con xlsx-js-style.

const XLSX = require('xlsx-js-style');
const path = require('path');
const fs = require('fs');
const { getConsolidadoAfipPath } = require('../../utils/fileManager.js');

// Paleta
const COLOR_HEADER_BG   = { rgb: 'FF2C3E50' };
const COLOR_HEADER_FG   = { rgb: 'FFFFFFFF' };
const COLOR_CRITICO_BG  = { rgb: 'FFF8D7DA' };
const COLOR_CRITICO_FG  = { rgb: 'FF922B21' };
const COLOR_ALERTA_BG   = { rgb: 'FFFDEBD0' };
const COLOR_ALERTA_FG   = { rgb: 'FFB9770E' };
const COLOR_OK_BG       = { rgb: 'FFDFF0D8' };
const COLOR_OK_FG       = { rgb: 'FF1E6631' };
const COLOR_SINDATOS_BG = { rgb: 'FFE5E7E9' };
const COLOR_SINDATOS_FG = { rgb: 'FF5D6D7E' };

const BORDE_FINO = { style: 'thin', color: { rgb: 'FFCCCCCC' } };
const BORDES_DEFAULT = { top: BORDE_FINO, bottom: BORDE_FINO, left: BORDE_FINO, right: BORDE_FINO };

function coloresDeUrgencia(u) {
    switch (u) {
        case 'critico':   return { bg: COLOR_CRITICO_BG,  fg: COLOR_CRITICO_FG };
        case 'alerta':    return { bg: COLOR_ALERTA_BG,   fg: COLOR_ALERTA_FG };
        case 'ok':        return { bg: COLOR_OK_BG,       fg: COLOR_OK_FG };
        default:          return { bg: COLOR_SINDATOS_BG, fg: COLOR_SINDATOS_FG };
    }
}

/**
 * Genera el Excel consolidado a partir del array resultadosGlobales.
 * @param {Array} resultadosGlobales
 * @param {string} downloadsPath
 * @returns {{ success, path?, nombre?, totales?, message? }}
 */
function generar(resultadosGlobales, downloadsPath) {
    try {
        const fechaHoy = new Date();
        const fechaStr = formatearFechaISO(fechaHoy);
        const fechaArg = formatearFechaArg(fechaHoy);

        const carpetaDestino = getConsolidadoAfipPath(downloadsPath, 'planes_de_pago');
        const nombreArchivo = `Resumen_PlanesDePago_${fechaStr}.xlsx`;
        const rutaCompleta = path.join(carpetaDestino, nombreArchivo);

        const filasPorCliente = [];
        const filasPorPlan = [];
        const filasImpagas = [];

        for (const bloqueRep of (resultadosGlobales || [])) {
            const representante = bloqueRep.representante || {};
            const resultadosCuits = bloqueRep.resultados || [];

            if (!bloqueRep.success && resultadosCuits.length === 0) {
                filasPorCliente.push({
                    'Urgencia': 'sin_datos',
                    'Representante': representante.nombre || '',
                    'CUIT Representante': representante.cuit || '',
                    'CUIT Consultado': '',
                    'Alias/Cliente': '',
                    'Planes consultados': 0,
                    'Planes con impagas': 0,
                    'Cuotas impagas': 0,
                    'Monto a regularizar hoy': 0,
                    'Mora total pagada': 0,
                    'Observación': bloqueRep.message || 'Error procesando representante'
                });
                continue;
            }

            for (const resCuit of resultadosCuits) {
                const cuitConsulta = resCuit.cuitConsulta || {};
                const planes = resCuit.planes || [];

                if (resCuit.sinPlanesVigentes) {
                    filasPorCliente.push({
                        'Urgencia': 'ok',
                        'Representante': representante.nombre || '',
                        'CUIT Representante': representante.cuit || '',
                        'CUIT Consultado': cuitConsulta.cuit || '',
                        'Alias/Cliente': cuitConsulta.alias || '',
                        'Planes consultados': 0,
                        'Planes con impagas': 0,
                        'Cuotas impagas': 0,
                        'Monto a regularizar hoy': 0,
                        'Mora total pagada': 0,
                        'Observación': 'Sin planes vigentes'
                    });
                    continue;
                }

                if (!resCuit.success) {
                    filasPorCliente.push({
                        'Urgencia': 'sin_datos',
                        'Representante': representante.nombre || '',
                        'CUIT Representante': representante.cuit || '',
                        'CUIT Consultado': cuitConsulta.cuit || '',
                        'Alias/Cliente': cuitConsulta.alias || '',
                        'Planes consultados': 0,
                        'Planes con impagas': 0,
                        'Cuotas impagas': 0,
                        'Monto a regularizar hoy': 0,
                        'Mora total pagada': 0,
                        'Observación': resCuit.message || 'Error al consultar'
                    });
                    continue;
                }

                let cuotasImpagasTotal = 0;
                let planesConImpagas = 0;
                let montoRegularizarTotal = 0;
                let moraPagadaCliente = 0;
                let peorUrgencia = 'ok';

                for (const planRes of planes) {
                    if (!planRes.datosResumen) continue;
                    const r = planRes.datosResumen;

                    cuotasImpagasTotal += (r.cantidadImpagas || 0);
                    if (r.cantidadImpagas > 0) planesConImpagas++;
                    montoRegularizarTotal += (r.montoRegularizarHoy || 0);
                    moraPagadaCliente += (r.moraPagadaTotal || 0);
                    peorUrgencia = peorEntre(peorUrgencia, r.urgencia);

                    filasPorPlan.push({
                        'Urgencia': r.urgencia,
                        'Representante': representante.nombre || '',
                        'CUIT Representante': representante.cuit || '',
                        'CUIT Consultado': cuitConsulta.cuit || '',
                        'Alias/Cliente': cuitConsulta.alias || '',
                        'Plan N°': r.planNumero,
                        'Tipo': r.planTipo || '',
                        'Cuotas totales': toNum(r.planCuotas || r.cantidadTotal),
                        'Cuotas canceladas': r.cantidadCanceladas || 0,
                        'Cuotas impagas': r.cantidadImpagas || 0,
                        'Cuotas pendientes': r.cantidadPendientes || 0,
                        'Monto a regularizar': r.montoRegularizarHoy || 0,
                        'Días vencida (1° impaga)': r.diasVencidaPrimeraImpaga || 0,
                        'Próximo vencimiento': r.proximaCuotaFecha || '',
                        'Próximo monto': r.proximaCuotaMonto || 0,
                        'Pagos con atraso': r.cantidadPagosAtrasados || 0,
                        'Mora total pagada': r.moraPagadaTotal || 0,
                        'Situación AFIP': r.planSituacion || ''
                    });

                    for (const cuota of (r.cuotasImpagas || [])) {
                        filasImpagas.push({
                            'Días vencida': diasDesdeHoy(cuota.vencimientoOriginal),
                            'Representante': representante.nombre || '',
                            'CUIT Consultado': cuitConsulta.cuit || '',
                            'Alias/Cliente': cuitConsulta.alias || '',
                            'Plan N°': r.planNumero,
                            'Cuota N°': cuota.cuotaNro,
                            'Vencimiento original': cuota.vencimientoOriginal,
                            'Monto original': parseNumero(cuota.totalOriginal),
                            'Monto actualizado': parseNumero(cuota.montoActualAUltimaFecha),
                            'Fecha actualización': cuota.fechaUltimoIntento,
                            'Intentos fallidos': cuota.cantidadFallidos || 0,
                            'Último motivo': cuota.motivoUltimoIntento || ''
                        });
                    }
                }

                filasPorCliente.push({
                    'Urgencia': peorUrgencia,
                    'Representante': representante.nombre || '',
                    'CUIT Representante': representante.cuit || '',
                    'CUIT Consultado': cuitConsulta.cuit || '',
                    'Alias/Cliente': cuitConsulta.alias || '',
                    'Planes consultados': planes.length,
                    'Planes con impagas': planesConImpagas,
                    'Cuotas impagas': cuotasImpagasTotal,
                    'Monto a regularizar hoy': montoRegularizarTotal,
                    'Mora total pagada': moraPagadaCliente,
                    'Observación': cuotasImpagasTotal > 0 ? 'Con impagas' : 'Al día'
                });
            }
        }

        // Merge con archivo existente del día (si existe):
        //   - Resumen por cliente: dedup por CUIT Consultado (la nueva corrida gana)
        //   - Detalle por plan: dedup por CUIT Consultado + Plan N°
        //   - Cuotas impagas: si el plan (CUIT+Plan) se reprocesó, eliminar TODAS sus
        //     impagas viejas y poner solo las nuevas (refleja el estado actual)
        let infoMerge = { hubo: false, clientes: 0, planes: 0, impagas: 0 };
        if (fs.existsSync(rutaCompleta)) {
            try {
                const datosPrevios = leerConsolidadoExistente(rutaCompleta);
                const clavesClientesNuevas = new Set(filasPorCliente.map(f => claveCliente(f)));
                const clavesPlanesNuevas = new Set(filasPorPlan.map(f => clavePlan(f)));

                // Plans reprocesados que aparecen en las filas nuevas (aunque no tengan
                // cuotas impagas nuevas, su set de impagas previas debe descartarse)
                const clavesPlanesTocados = new Set([
                    ...filasPorPlan.map(f => clavePlan(f)),
                    ...filasImpagas.map(f => clavePlan(f))
                ]);

                const prevClientes = (datosPrevios.clientes || [])
                    .filter(f => !clavesClientesNuevas.has(claveCliente(f)));
                const prevPlanes = (datosPrevios.planes || [])
                    .filter(f => !clavesPlanesNuevas.has(clavePlan(f)));
                const prevImpagas = (datosPrevios.impagas || [])
                    .filter(f => !clavesPlanesTocados.has(clavePlan(f)));

                filasPorCliente.unshift(...prevClientes);
                filasPorPlan.unshift(...prevPlanes);
                filasImpagas.unshift(...prevImpagas);

                infoMerge = {
                    hubo: true,
                    clientes: prevClientes.length,
                    planes: prevPlanes.length,
                    impagas: prevImpagas.length
                };
            } catch (err) {
                console.warn(`[Consolidado Excel] No se pudo leer el archivo existente (se regenera desde cero): ${err.message}`);
            }
        }

        // Ordenar
        const ordenUrg = { 'critico': 0, 'alerta': 1, 'ok': 2, 'sin_datos': 3 };
        filasPorCliente.sort((a, b) => (ordenUrg[a.Urgencia] ?? 9) - (ordenUrg[b.Urgencia] ?? 9));
        filasPorPlan.sort((a, b) => (ordenUrg[a.Urgencia] ?? 9) - (ordenUrg[b.Urgencia] ?? 9));
        filasImpagas.sort((a, b) => (b['Días vencida'] || 0) - (a['Días vencida'] || 0));

        // Construir workbook
        const workbook = XLSX.utils.book_new();

        const columnasMonedaCliente = ['Monto a regularizar hoy', 'Mora total pagada'];
        const columnasMonedaPlan = ['Monto a regularizar', 'Próximo monto', 'Mora total pagada'];
        const columnasMonedaImpagas = ['Monto original', 'Monto actualizado'];

        const hojaCliente = construirHojaConEstilos(filasPorCliente, columnasMonedaCliente, 'Urgencia');
        hojaCliente['!cols'] = anchosCliente();

        const hojaPlan = construirHojaConEstilos(filasPorPlan, columnasMonedaPlan, 'Urgencia');
        hojaPlan['!cols'] = anchosPlan();

        const hojaImpagas = construirHojaConEstilos(filasImpagas, columnasMonedaImpagas, null);
        hojaImpagas['!cols'] = anchosImpagas();

        XLSX.utils.book_append_sheet(workbook, hojaCliente, 'Resumen por cliente');
        XLSX.utils.book_append_sheet(workbook, hojaPlan, 'Detalle por plan');
        XLSX.utils.book_append_sheet(workbook, hojaImpagas, 'Cuotas impagas');

        try {
            XLSX.writeFile(workbook, rutaCompleta);
        } catch (e) {
            if (e && (e.code === 'EBUSY' || /EBUSY|permission|EACCES/i.test(e.message))) {
                return {
                    success: false,
                    message: `No se pudo escribir el consolidado (¿está abierto en Excel?): ${rutaCompleta}`
                };
            }
            throw e;
        }

        if (infoMerge.hubo) {
            console.log(`[Consolidado Excel] Actualizado (merge por fecha): ${rutaCompleta}`);
            console.log(`  Preservadas: ${infoMerge.clientes} clientes, ${infoMerge.planes} planes, ${infoMerge.impagas} impagas`);
        } else {
            console.log(`[Consolidado Excel] Generado: ${rutaCompleta}`);
        }
        console.log(`  Totales finales: ${filasPorCliente.length} clientes | ${filasPorPlan.length} planes | ${filasImpagas.length} impagas`);

        return {
            success: true,
            path: rutaCompleta,
            nombre: nombreArchivo,
            fecha: fechaArg,
            merge: infoMerge.hubo,
            totales: {
                clientes: filasPorCliente.length,
                planes: filasPorPlan.length,
                impagas: filasImpagas.length
            }
        };

    } catch (error) {
        console.error('[Consolidado Excel] Error:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Lee un consolidado existente y devuelve las filas de cada hoja como objetos planos.
 * Si una hoja no existe o está vacía, devuelve array vacío.
 */
function leerConsolidadoExistente(rutaArchivo) {
    const wb = XLSX.readFile(rutaArchivo, { cellDates: false });
    const leerHoja = (nombreHoja) => {
        const ws = wb.Sheets[nombreHoja];
        if (!ws) return [];
        return XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' });
    };
    return {
        clientes: leerHoja('Resumen por cliente'),
        planes: leerHoja('Detalle por plan'),
        impagas: leerHoja('Cuotas impagas')
    };
}

function claveCliente(fila) {
    return String(fila['CUIT Consultado'] || '').trim();
}

function clavePlan(fila) {
    const cuit = String(fila['CUIT Consultado'] || '').trim();
    const plan = String(fila['Plan N°'] || '').trim();
    return `${cuit}::${plan}`;
}

// ─── Helpers ───

/**
 * Construye una hoja con AOA para control total de estilos y tipos de dato.
 * Aplica colores por fila según el valor de la columna `columnaUrgencia` (si existe).
 */
function construirHojaConEstilos(filas, columnasMoneda, columnaUrgencia) {
    if (!filas || filas.length === 0) {
        return XLSX.utils.aoa_to_sheet([['Sin datos']]);
    }

    const headers = Object.keys(filas[0]);
    const rows = [headers];

    for (const fila of filas) {
        rows.push(headers.map(h => fila[h]));
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Estilos de encabezado
    for (let c = 0; c < headers.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        if (!ws[addr]) continue;
        ws[addr].s = {
            font: { bold: true, color: COLOR_HEADER_FG, sz: 10 },
            fill: { patternType: 'solid', fgColor: COLOR_HEADER_BG },
            alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
            border: BORDES_DEFAULT
        };
    }

    // Estilos de filas (colores por urgencia, formato de moneda, números como números)
    const columnasMonedaIdx = (columnasMoneda || []).map(n => headers.indexOf(n)).filter(i => i >= 0);
    const idxUrgencia = columnaUrgencia ? headers.indexOf(columnaUrgencia) : -1;

    for (let rFila = 1; rFila < rows.length; rFila++) {
        const filaData = filas[rFila - 1];
        const colores = idxUrgencia >= 0 ? coloresDeUrgencia(filaData[columnaUrgencia]) : null;

        for (let c = 0; c < headers.length; c++) {
            const addr = XLSX.utils.encode_cell({ r: rFila, c });
            if (!ws[addr]) continue;

            const estilo = {
                border: BORDES_DEFAULT,
                alignment: { horizontal: 'left', vertical: 'center' }
            };

            // Números: asegurar tipo numérico + alineación derecha
            if (typeof ws[addr].v === 'number') {
                ws[addr].t = 'n';
                estilo.alignment = { horizontal: 'right', vertical: 'center' };
            }

            // Moneda
            if (columnasMonedaIdx.includes(c)) {
                estilo.numFmt = '#,##0.00';
                ws[addr].z = '#,##0.00';
            }

            // Color por urgencia (fila)
            if (colores) {
                estilo.fill = { patternType: 'solid', fgColor: colores.bg };
                estilo.font = { color: colores.fg };
                // Destacar celda de urgencia
                if (c === idxUrgencia) {
                    estilo.font = { color: colores.fg, bold: true };
                    estilo.alignment = { horizontal: 'center', vertical: 'center' };
                }
            }

            ws[addr].s = estilo;
        }
    }

    // Autofilter sobre toda la tabla
    if (ws['!ref']) {
        ws['!autofilter'] = { ref: ws['!ref'] };
    }
    // Congelar encabezado
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    return ws;
}

function peorEntre(a, b) {
    const peso = { 'critico': 3, 'alerta': 2, 'ok': 1, 'sin_datos': 0 };
    return (peso[a] || 0) >= (peso[b] || 0) ? a : b;
}

function parseNumero(texto) {
    if (typeof texto === 'number') return texto;
    if (!texto) return 0;
    const limpio = String(texto).replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const n = parseFloat(limpio);
    return isNaN(n) ? 0 : n;
}

function toNum(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    const n = parseInt(String(v).replace(/\D/g, ''), 10);
    return isNaN(n) ? 0 : n;
}

function parseFechaArg(texto) {
    if (!texto) return null;
    const m = String(texto).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
}

function diasDesdeHoy(fechaStr) {
    const d = parseFechaArg(fechaStr);
    if (!d) return 0;
    return Math.round((new Date() - d) / (1000 * 60 * 60 * 24));
}

function formatearFechaISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatearFechaArg(date) {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
}

function anchosCliente() {
    return [
        { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
        { wch: 25 }, { wch: 12 }, { wch: 14 }, { wch: 13 },
        { wch: 20 }, { wch: 18 }, { wch: 20 }
    ];
}

function anchosPlan() {
    return [
        { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
        { wch: 25 }, { wch: 10 }, { wch: 14 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 },
        { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 10 },
        { wch: 16 }, { wch: 18 }
    ];
}

function anchosImpagas() {
    return [
        { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 25 },
        { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 28 }
    ];
}

module.exports = { generar };
