// afip/planesDePago/consolidadoExcel.js
// Genera un archivo Excel consolidado con el resultado del lote de Planes de Pago.
// Tres hojas: Resumen por cliente | Detalle por plan | Cuotas impagas
// Ubicación: gestor_afip_atm/consolidados_afip/planes_de_pago/
// ExcelJS + hoja de estilos única (tablasPdf/motor/utils/estilosExcel.js).

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { getConsolidadoAfipPath } = require('../../utils/fileManager.js');
const estilos = require('../../tablasPdf/motor/utils/estilosExcel.js');
const { valorCelda } = require('./excelPlan.js');

// Columnas que cambiaron de nombre: al mezclar con un consolidado del día hecho
// con la versión anterior, se leen con el nombre nuevo (si no, se duplicarían).
const RENOMBRES = { 'Próximo monto': 'Próximo monto (1° vto.)' };

// Urgencia del plan/cliente → estado de color de la hoja de estilos
const ESTADO_POR_URGENCIA = { critico: 'error', alerta: 'aviso', ok: 'ok', sin_datos: 'neutro' };

/**
 * Genera el Excel consolidado a partir del array resultadosGlobales.
 * @param {Array} resultadosGlobales
 * @param {string} downloadsPath
 * @returns {{ success, path?, nombre?, totales?, message? }}
 */
async function generar(resultadosGlobales, downloadsPath) {
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
                        'Próximo monto (1° vto.)': r.proximaCuotaMonto || 0,
                        'Próximo monto (2° vto.)': r.proximaCuotaMonto2doVto ?? '',
                        'Pagos con atraso': r.cantidadPagosAtrasados || 0,
                        'Mora total pagada': r.moraPagadaTotal || 0,
                        'Situación AFIP': r.planSituacion || ''
                    });

                    for (const cuota of (r.cuotasImpagas || [])) {
                        // El último intento suele ser el próximo débito proyectado
                        // (sin motivo): el motivo útil es el del último FALLIDO.
                        const ultimoFallido = (cuota.intentos || []).filter(i => i.fueFallido && i.motivo).pop();
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
                            'Último motivo': ultimoFallido ? ultimoFallido.motivo : (cuota.motivoUltimoIntento || '')
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
                const datosPrevios = await leerConsolidadoExistente(rutaCompleta);
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
        const workbook = new ExcelJS.Workbook();
        agregarHoja(workbook, 'Resumen por cliente', filasPorCliente, ['Monto a regularizar hoy', 'Mora total pagada'], 'Urgencia');
        agregarHoja(workbook, 'Detalle por plan', filasPorPlan, ['Monto a regularizar', 'Próximo monto (1° vto.)', 'Próximo monto (2° vto.)', 'Mora total pagada'], 'Urgencia');
        agregarHoja(workbook, 'Cuotas impagas', filasImpagas, ['Monto original', 'Monto actualizado'], null);

        try {
            await workbook.xlsx.writeFile(rutaCompleta);
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
 * Lee un consolidado existente y devuelve las filas de cada hoja como objetos
 * planos { encabezado: valor }. Las fechas vuelven a texto "dd/mm/aaaa" (así
 * las guarda el resto del armado; valorCelda las reconvierte al escribir).
 * Lee tanto los consolidados nuevos (ExcelJS) como los viejos (xlsx-js-style).
 * Si una hoja no existe o está vacía, devuelve array vacío.
 */
async function leerConsolidadoExistente(rutaArchivo) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(rutaArchivo);

    const texto = (v) => {
        if (v === null || v === undefined) return '';
        if (v instanceof Date) {
            const d = String(v.getUTCDate()).padStart(2, '0');
            const m = String(v.getUTCMonth() + 1).padStart(2, '0');
            return `${d}/${m}/${v.getUTCFullYear()}`;
        }
        if (typeof v === 'object') {
            if (v.richText) return v.richText.map(t => t.text).join('');
            if ('result' in v) return v.result;
            if (v.text) return v.text;
        }
        return v;
    };

    const leerHoja = (nombreHoja) => {
        const ws = wb.getWorksheet(nombreHoja);
        if (!ws || ws.rowCount < 2) return [];
        const headers = [];
        ws.getRow(1).eachCell({ includeEmpty: true }, (celda, c) => { headers[c] = texto(celda.value); });
        if (!headers.filter(Boolean).length || headers[1] === 'Sin datos') return [];

        const filas = [];
        for (let r = 2; r <= ws.rowCount; r++) {
            const row = ws.getRow(r);
            if (!row.hasValues) continue;
            const fila = {};
            headers.forEach((h, c) => { if (h) fila[RENOMBRES[h] || h] = texto(row.getCell(c).value); });
            filas.push(fila);
        }
        return filas;
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
 * Escribe una hoja: encabezado en la fila 1, una fila por objeto. Montos con
 * miles en `columnasMoneda`; el resto de los números como enteros; fechas
 * "dd/mm/aaaa" como fecha real. Si hay `columnaUrgencia`, pinta la fila entera
 * con el color de su urgencia y destaca esa celda.
 */
function agregarHoja(workbook, nombre, filas, columnasMoneda, columnaUrgencia) {
    const hoja = workbook.addWorksheet(nombre);
    if (!filas || filas.length === 0) {
        hoja.getCell(1, 1).value = 'Sin datos';
        return;
    }

    // Encabezados: la fila con más columnas da el orden; se suman las que falten
    // (filas mezcladas de un consolidado anterior pueden traer menos).
    const base = filas.reduce((a, f) => (Object.keys(f).length > Object.keys(a).length ? f : a), filas[0]);
    const headers = Object.keys(base);
    filas.forEach(f => Object.keys(f).forEach(k => { if (!headers.includes(k)) headers.push(k); }));
    hoja.getRow(1).values = headers;
    const idxUrgencia = columnaUrgencia ? headers.indexOf(columnaUrgencia) : -1;

    filas.forEach((fila, i) => {
        const row = hoja.getRow(i + 2);
        headers.forEach((h, c) => {
            const celda = row.getCell(c + 1);
            const esMonto = columnasMoneda.includes(h);
            celda.value = valorCelda(fila[h], esMonto);
            // Formato explícito: el detector por nombre de la hoja de estilos
            // tomaría "Cuotas totales" como monto.
            if (esMonto) celda.numFmt = estilos.FMT_MONTO_MILES;
            else if (celda.value instanceof Date) celda.numFmt = estilos.FMT_FECHA;
            else if (typeof celda.value === 'number') celda.numFmt = estilos.FMT_ENTERO;
            celda.alignment = {
                horizontal: typeof celda.value === 'number' ? 'right' : (celda.value instanceof Date ? 'center' : 'left'),
                vertical: 'middle'
            };
        });

        const estado = idxUrgencia >= 0 ? ESTADO_POR_URGENCIA[fila[columnaUrgencia]] || 'neutro' : null;
        if (estado) {
            for (let c = 1; c <= headers.length; c++) estilos.marcarEstado(row.getCell(c), estado, { destacar: false });
            const celdaUrg = row.getCell(idxUrgencia + 1);
            estilos.marcarEstado(celdaUrg, estado);
            celdaUrg.alignment = { horizontal: 'center', vertical: 'middle' };
        }
    });

    estilos.estilizarTabla(hoja, { filaEncabezado: 1, fmtMonto: estilos.FMT_MONTO_MILES });
    estilos.ajustarImpresion(hoja);
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

module.exports = { generar };
