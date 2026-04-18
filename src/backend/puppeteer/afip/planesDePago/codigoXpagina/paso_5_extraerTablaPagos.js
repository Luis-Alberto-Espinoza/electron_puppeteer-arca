/**
 * PASO 5: Extraer datos de la tabla de pagos
 *
 * En detalle_pagos.aspx, extrae todos los datos de la tabla #tableDetallePagos.
 *
 * La tabla de AFIP combina una fila "padre" (<tr id="..._trRpt_N">) con varias
 * sub-filas (vencimientos/proyecciones) usando rowspan. Este paso devuelve:
 *   - `pagos` (array plano, compatibilidad hacia atrás)
 *   - `cuotasAgrupadas` (array con cuota padre + sus intentos)
 *   - `totales` (de la fila <tr id="..._trTableFooter">)
 *
 * Columnas: Cuota N° | Capital($) | Interés Financiero($) | Interés Resarcitorio($) |
 *           Total($) | Fecha Venc. | Pago | Estado de Cuota
 */

async function ejecutar(page) {
    console.log('  → Paso 5: Extrayendo datos de la tabla de pagos...');

    await page.waitForSelector('#tableDetallePagos', { timeout: 10000 });

    const resultado = await page.evaluate(() => {
        const tabla = document.getElementById('tableDetallePagos');
        if (!tabla) return { filas: [], encabezados: [], cuotasAgrupadas: [], totales: null };

        const ths = tabla.querySelectorAll('thead th');
        const encabezados = Array.from(ths).map(th => th.textContent.trim());

        const trs = Array.from(tabla.querySelectorAll('tbody tr'));

        // Separar: fila de totales / filas padre / sub-filas
        let filaTotales = null;
        const filasPadre = [];
        const subFilasPorPadre = new Map(); // indicePadre -> array de sub-filas

        let padreActualIdx = -1;

        for (const tr of trs) {
            const id = tr.id || '';

            if (id.includes('trTableFooter')) {
                filaTotales = tr;
                continue;
            }

            if (id.includes('trRpt_')) {
                filasPadre.push(tr);
                padreActualIdx = filasPadre.length - 1;
                subFilasPorPadre.set(padreActualIdx, []);
                continue;
            }

            // Sub-fila: pertenece al último padre abierto
            if (padreActualIdx >= 0) {
                subFilasPorPadre.get(padreActualIdx).push(tr);
            }
        }

        // Helper: extraer motivo de pago desde un <td>
        // Retorna { texto, motivo, fueFallido, fuePagado }
        function extraerMotivoPago(td) {
            if (!td) return { texto: '', motivo: '', fueFallido: false, fuePagado: false };

            const boton = td.querySelector('button');
            if (boton) {
                // Intento fallido: el motivo está en el title del span interno o del botón
                const span = boton.querySelector('[title]');
                const motivo = (span && span.getAttribute('title')) || boton.getAttribute('title') || '';
                return {
                    texto: td.textContent.trim(),
                    motivo: motivo.trim(),
                    fueFallido: true,
                    fuePagado: false
                };
            }

            const texto = td.textContent.trim();
            if (/pago/i.test(texto)) {
                return { texto, motivo: '', fueFallido: false, fuePagado: true };
            }

            return { texto, motivo: '', fueFallido: false, fuePagado: false };
        }

        // Helper: celdas visibles (ignora display:none)
        function celdasVisibles(tr) {
            return Array.from(tr.querySelectorAll('td')).filter(td => {
                const style = td.getAttribute('style') || '';
                return !style.includes('display:none') && !style.includes('display: none');
            });
        }

        // 1) Construir array plano (compatibilidad con paso_6 viejo)
        const filas = trs
            .filter(tr => !(tr.id || '').includes('trTableFooter'))
            .map(tr => {
                const celdas = tr.querySelectorAll('td');
                const motivoPagoData = extraerMotivoPago(celdas[6]);
                return {
                    cuotaNro: celdas[0] ? celdas[0].textContent.trim() : '',
                    capital: celdas[1] ? celdas[1].textContent.trim() : '',
                    interesFinanciero: celdas[2] ? celdas[2].textContent.trim() : '',
                    interesResarcitorio: celdas[3] ? celdas[3].textContent.trim() : '',
                    total: celdas[4] ? celdas[4].textContent.trim() : '',
                    fechaVencimiento: celdas[5] ? celdas[5].textContent.trim() : '',
                    pago: motivoPagoData.texto,
                    motivo: motivoPagoData.motivo,
                    estadoCuota: celdas[7] ? celdas[7].textContent.trim() : ''
                };
            });

        // 2) Construir cuotas agrupadas
        const cuotasAgrupadas = filasPadre.map((trPadre, idx) => {
            const celdasPadre = trPadre.querySelectorAll('td');

            const cuotaNro = celdasPadre[0] ? celdasPadre[0].textContent.trim() : '';
            const capital = celdasPadre[1] ? celdasPadre[1].textContent.trim() : '';
            const interesFinanciero = celdasPadre[2] ? celdasPadre[2].textContent.trim() : '';
            const interesResarcitorio = celdasPadre[3] ? celdasPadre[3].textContent.trim() : '';
            const total = celdasPadre[4] ? celdasPadre[4].textContent.trim() : '';
            const fechaVencimiento = celdasPadre[5] ? celdasPadre[5].textContent.trim() : '';
            const estadoCuota = celdasPadre[7] ? celdasPadre[7].textContent.trim() : '';

            const motivoPadre = extraerMotivoPago(celdasPadre[6]);

            // Intentos: empezar con el primer vencimiento (fila padre)
            const intentos = [];
            intentos.push({
                fecha: fechaVencimiento,
                interesFinanciero,
                interesResarcitorio,
                total,
                motivoTexto: motivoPadre.texto,
                motivo: motivoPadre.motivo,
                fueFallido: motivoPadre.fueFallido,
                fuePagado: motivoPadre.fuePagado
            });

            // Sub-filas: cada una es un intento adicional
            const subFilas = subFilasPorPadre.get(idx) || [];
            for (const trSub of subFilas) {
                const cs = celdasVisibles(trSub);
                // cs debería tener 5 celdas visibles: interesFin, interesResarc, total, fecha, motivoPago
                if (cs.length < 5) continue;

                const intF = cs[0] ? cs[0].textContent.trim() : '';
                const intR = cs[1] ? cs[1].textContent.trim() : '';
                const tot = cs[2] ? cs[2].textContent.trim() : '';
                const fec = cs[3] ? cs[3].textContent.trim() : '';
                const motivoSub = extraerMotivoPago(cs[4]);

                intentos.push({
                    fecha: fec,
                    interesFinanciero: intF,
                    interesResarcitorio: intR,
                    total: tot,
                    motivoTexto: motivoSub.texto,
                    motivo: motivoSub.motivo,
                    fueFallido: motivoSub.fueFallido,
                    fuePagado: motivoSub.fuePagado
                });
            }

            // Derivados útiles
            const intentoPagado = intentos.find(i => i.fuePagado);
            const intentosFallidos = intentos.filter(i => i.fueFallido);
            const ultimoIntento = intentos[intentos.length - 1];

            return {
                cuotaNro,
                capital,
                interesFinancieroOriginal: interesFinanciero,
                totalOriginal: total,
                vencimientoOriginal: fechaVencimiento,
                estado: estadoCuota,
                intentos,
                // Flags y derivados:
                cantidadIntentos: intentos.length,
                cantidadFallidos: intentosFallidos.length,
                fueCancelada: /cancelada/i.test(estadoCuota),
                estaImpaga: /impaga/i.test(estadoCuota),
                fechaPagoEfectiva: intentoPagado ? intentoPagado.fecha : '',
                montoPagado: intentoPagado ? intentoPagado.total : '',
                interesMoraPagado: intentoPagado ? intentoPagado.interesResarcitorio : '',
                montoActualAUltimaFecha: ultimoIntento ? ultimoIntento.total : '',
                fechaUltimoIntento: ultimoIntento ? ultimoIntento.fecha : '',
                motivoUltimoIntento: ultimoIntento ? ultimoIntento.motivo : ''
            };
        });

        // 3) Extraer totales del footer
        let totales = null;
        if (filaTotales) {
            const tdsFooter = Array.from(filaTotales.querySelectorAll('td'));
            // Estructura: [Total Pagado:] [Capital] [Int.Financiero] [Int.Resarcitorio] [Total] [colspan vacío]
            totales = {
                capitalPagado: tdsFooter[1] ? tdsFooter[1].textContent.trim() : '',
                interesFinancieroPagado: tdsFooter[2] ? tdsFooter[2].textContent.trim() : '',
                moraPagada: tdsFooter[3] ? tdsFooter[3].textContent.trim() : '',
                totalPagado: tdsFooter[4] ? tdsFooter[4].textContent.trim() : ''
            };
        }

        return { filas, encabezados, cuotasAgrupadas, totales };
    });

    const cantCuotas = resultado.cuotasAgrupadas.length;
    const cantImpagas = resultado.cuotasAgrupadas.filter(c => c.estaImpaga).length;
    console.log(`  ✅ Extraídas ${resultado.filas.length} fila(s), ${cantCuotas} cuota(s) agrupada(s), ${cantImpagas} impaga(s).`);

    return {
        success: true,
        pagos: resultado.filas,
        encabezados: resultado.encabezados,
        totalFilas: resultado.filas.length,
        cuotasAgrupadas: resultado.cuotasAgrupadas,
        totales: resultado.totales
    };
}

module.exports = { ejecutar };
