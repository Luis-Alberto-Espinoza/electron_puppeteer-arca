// PASO 4: Verificar el badge de la tab "Deudas".
// Devuelve { sinDeuda: boolean, cantidad: number|null, raw: string|null }.
//
// Estrategia de espera (race condition real del SCT):
//   El badge se renderiza con valor 0 inicialmente y luego AFIP lo actualiza
//   con el valor real de manera asíncrona. Si leemos demasiado pronto, vemos
//   0 cuando en realidad hay deuda.
//
// Para evitar el setTimeout fijo:
//   1. Polling cada 200ms del badge Y de la cantidad de filas en el tbody.
//   2. Apenas detectamos deuda (badge > 0 o filas > 0), retornamos.
//   3. Si tras varias lecturas seguidas siguen ambas en 0, declaramos sin deuda.
//   4. Hard-stop con TIMEOUT_TOTAL (8s) para no colgar.
//
// El tab vive dentro del iframe del SCT.

const { getSctFrame, FN_FIND_TAB_DEUDAS } = require('./_helpers.js');

const TIMEOUT_TOTAL_MS = 8000;
const INTERVALO_POLLING_MS = 200;
const LECTURAS_ESTABLES_PARA_SIN_DEUDA = 6; // ~1.2s en 0

async function leerEstado(frame) {
    return await frame.evaluate(`(function() {
        const findTab = ${FN_FIND_TAB_DEUDAS};
        const tabDeudas = findTab();
        if (!tabDeudas) return { found: false };

        // 1) Intentar leer el badge específico (clases conocidas).
        const badge = tabDeudas.querySelector('span.badge.badge-danger')
                   || tabDeudas.querySelector('.badge.badge-danger')
                   || tabDeudas.querySelector('.badge');

        let cantidadBadge = 0;
        let raw = null;
        let badgePresent = false;
        if (badge) {
            badgePresent = true;
            raw = (badge.textContent || '').trim();
            const n = parseInt(raw.replace(/\\D/g, ''), 10);
            cantidadBadge = Number.isFinite(n) ? n : 0;
        }

        // 2) Fallback robusto: leer el texto completo del tab y extraer el
        //    primer número. AFIP a veces pone "Deudas 6" como textContent
        //    del <a> sin un <span class="badge"> independiente.
        const tabText = (tabDeudas.textContent || '').replace(/\\s+/g, ' ').trim();
        const m = tabText.match(/(\\d+)/);
        const cantidadEnTexto = m ? parseInt(m[1], 10) : 0;

        // Tomar la mayor de las dos lecturas — si alguna detectó deuda, vale.
        const cantidad = Math.max(cantidadBadge, cantidadEnTexto);

        // 3) Filas visibles en la tab activa.
        const filas = document.querySelectorAll('.tab-pane.active tbody tr[role="row"]').length;

        return {
            found: true,
            badgePresent,
            raw,
            tabText,
            cantidad,
            cantidadBadge,
            cantidadEnTexto,
            filas
        };
    })()`);
}

async function ejecutar(page) {
    try {

        const frame = await getSctFrame(page);

        const inicio = Date.now();
        let mejorCantidad = 0;
        let mejorRaw = null;
        let mejorFilas = 0;
        let lecturasEstablesEnCero = 0;
        let ultimoFound = false;

        while (Date.now() - inicio < TIMEOUT_TOTAL_MS) {
            const info = await leerEstado(frame);
            if (!info.found) {
                // El tab no apareció todavía; reintentar.
                await new Promise(r => setTimeout(r, INTERVALO_POLLING_MS));
                continue;
            }
            ultimoFound = true;

            if (info.cantidad > mejorCantidad) {
                mejorCantidad = info.cantidad;
                mejorRaw = info.raw;
            }
            if (info.filas > mejorFilas) mejorFilas = info.filas;

            // Cualquiera de los dos > 0 es señal definitiva de deuda — salir.
            if (mejorCantidad > 0 || mejorFilas > 0) {
                const cantidad = Math.max(mejorCantidad, mejorFilas);
                console.log(`  ✅ [SCT] Deudas detectadas: ${cantidad}${mejorFilas !== mejorCantidad ? ` (tab=${mejorCantidad}, filas=${mejorFilas})` : ''}`);
                return { success: true, sinDeuda: false, cantidad, raw: mejorRaw };
            }

            // Lectura 0/0: incrementar el contador de estabilidad.
            lecturasEstablesEnCero++;
            if (lecturasEstablesEnCero >= LECTURAS_ESTABLES_PARA_SIN_DEUDA) {
                console.log('  ✅ [SCT] Sin deuda (badge y tabla en 0 tras polling estable)');
                return { success: true, sinDeuda: true, cantidad: 0, raw: mejorRaw };
            }

            await new Promise(r => setTimeout(r, INTERVALO_POLLING_MS));
        }

        if (!ultimoFound) {
            throw new Error('No se encontró el tab Deudas para leer el badge');
        }

        // Timeout duro: si nunca vimos nada > 0, reportamos sin deuda con warning.
        console.warn(`  ⚠️ [SCT] Timeout en paso 4 — declarando sin deuda (badge=${mejorCantidad}, filas=${mejorFilas})`);
        return { success: true, sinDeuda: true, cantidad: 0, raw: mejorRaw };

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_4_verificarBadge:', error.message);
        return { success: false, message: error.message };
    }
}

module.exports = { ejecutar };
