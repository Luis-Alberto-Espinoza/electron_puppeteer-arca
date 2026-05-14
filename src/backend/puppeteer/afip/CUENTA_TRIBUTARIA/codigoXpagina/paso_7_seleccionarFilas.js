// PASO 7: Marcar las filas de deuda que el usuario eligió.
//
// Dos modos:
//   - 'ids-explicitos'        : recibe ids exactos de checkbox (segunda pasada Flujo A).
//   - 'match-periodo-impuesto': recibe { periodo, impuesto } y matchea por regex
//                               sobre el id del checkbox (Flujo B, fase 5).
//
// El id de cada checkbox tiene formato "E-I-C-S-AAAAMM-Q":
//   E = establecimiento, I = impuesto, C = concepto, S = subconcepto,
//   AAAAMM = periodo, Q = cuota.
//
// Patrones aplicados (ver doc §7.0):
//   7.0.2 click real (sobre el <label>, más confiable que el input en Bootstrap-Vue),
//   7.0.3 validar `input.checked === true` después del click,
//   7.0.6 todo vive en el iframe del SCT,
//   7.0.7 scope a .tab-pane.active.

const { getSctFrame } = require('./_helpers.js');

const SCOPE = '.tab-pane.active';
const SEL_CHECKBOXES = `${SCOPE} tbody input[type="checkbox"]`;

function escaparRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Marca un checkbox por id. Click sobre el <label for="..."> si existe;
 * si no, fallback al input directo.
 *
 * Devuelve true si después del click el input quedó `checked`.
 */
async function marcarPorId(frame, id) {
    return await frame.evaluate((id, scope) => {
        const root = document.querySelector(scope) || document;
        const input = root.querySelector(`input[type="checkbox"][id="${CSS.escape(id)}"]`);
        if (!input) return { encontrado: false, marcado: false };

        // Si ya está marcado, listo.
        if (input.checked) return { encontrado: true, marcado: true, yaEstaba: true };

        // Preferir el label (más confiable con Bootstrap-Vue).
        const label = root.querySelector(`label[for="${CSS.escape(id)}"]`);
        const target = label || input;

        try { target.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {}
        target.click();

        return { encontrado: true, marcado: input.checked === true };
    }, id, SCOPE);
}

/**
 * Espera (con polling corto) a que el input quede checked tras el click.
 * Vue puede tardar un tick en propagar el v-model.
 */
async function esperarChecked(frame, id, timeout = 1500) {
    const inicio = Date.now();
    while (Date.now() - inicio < timeout) {
        const ok = await frame.evaluate((id, scope) => {
            const root = document.querySelector(scope) || document;
            const input = root.querySelector(`input[type="checkbox"][id="${CSS.escape(id)}"]`);
            return !!(input && input.checked);
        }, id, SCOPE);
        if (ok) return true;
        await new Promise(r => setTimeout(r, 100));
    }
    return false;
}

// ============================================================
// MODO 1: ids explícitos
// ============================================================

async function ejecutarModoIds(frame, ids) {
    const marcadas = [];
    const noEncontradas = [];

    for (const id of ids) {
        const r = await marcarPorId(frame, id);
        if (!r.encontrado) {
            noEncontradas.push(id);
            continue;
        }
        // Confirmar que realmente quedó tildado (sino reintentar una vez).
        let ok = r.marcado || await esperarChecked(frame, id);
        if (!ok) {
            // Reintento único: volver a hacer click.
            await marcarPorId(frame, id);
            ok = await esperarChecked(frame, id);
        }
        if (ok) {
            marcadas.push(id);
        } else {
            noEncontradas.push(id);
        }
    }

    return { marcadas, noEncontradas };
}

// ============================================================
// MODO 2: match periodo+impuesto (Flujo B — fase 5)
// ============================================================

async function obtenerIdsCheckboxes(frame) {
    return await frame.evaluate((scope) => {
        const root = document.querySelector(scope) || document;
        const inputs = Array.from(root.querySelectorAll('tbody input[type="checkbox"][id]'));
        return inputs.map(i => i.id);
    }, SCOPE);
}

async function ejecutarModoMatch(frame, deudasABuscar) {
    const idsDisponibles = await obtenerIdsCheckboxes(frame);
    const matcheadas = [];
    const noMatcheadas = [];

    for (const entrada of deudasABuscar) {
        const { periodo, impuesto } = entrada || {};
        if (!periodo || !impuesto) {
            noMatcheadas.push({ ...entrada, motivo: 'periodo o impuesto vacío' });
            continue;
        }
        // Formato: E-I-C-S-AAAAMM-Q. I y AAAAMM son fijos por entrada; el resto comodín.
        const regex = new RegExp(`^\\d+-${escaparRegex(impuesto)}-\\d+-\\d+-${escaparRegex(periodo)}-\\d+$`);
        const ids = idsDisponibles.filter(id => regex.test(id));

        if (ids.length === 0) {
            noMatcheadas.push({ ...entrada, motivo: 'sin coincidencias' });
            continue;
        }

        // Tildar todas las que matcheen.
        const idsMarcados = [];
        for (const id of ids) {
            const r = await marcarPorId(frame, id);
            const ok = r.marcado || await esperarChecked(frame, id);
            if (ok) idsMarcados.push(id);
        }
        matcheadas.push({ ...entrada, idsMarcados, cantidad: idsMarcados.length });
    }

    return { matcheadas, noMatcheadas };
}

// ============================================================
// EJECUTAR
// ============================================================

async function ejecutar(page, opciones = {}) {
    try {
        const { modo, idsSeleccionadas, deudasABuscar } = opciones;
        console.log(`  → [SCT] Seleccionando filas (modo=${modo})...`);

        const frame = await getSctFrame(page);

        // Asegurar que la tabla esté presente antes de hacer cualquier cosa.
        await frame.waitForSelector(SEL_CHECKBOXES, { timeout: 15000 });

        if (modo === 'ids-explicitos') {
            if (!Array.isArray(idsSeleccionadas) || idsSeleccionadas.length === 0) {
                return { success: false, message: 'No se recibieron ids para marcar' };
            }
            const { marcadas, noEncontradas } = await ejecutarModoIds(frame, idsSeleccionadas);
            const ok = marcadas.length > 0;
            console.log(`  ${ok ? '✅' : '❌'} [SCT] Filas marcadas: ${marcadas.length}/${idsSeleccionadas.length}`);
            if (noEncontradas.length) {
                console.warn(`  ⚠️ [SCT] No se pudieron marcar: ${noEncontradas.join(', ')}`);
            }
            return {
                success: ok,
                modo,
                marcadas,
                noEncontradas,
                message: ok
                    ? `${marcadas.length}/${idsSeleccionadas.length} fila(s) marcada(s)`
                    : `Ninguna de las ${idsSeleccionadas.length} fila(s) pudo marcarse`
            };
        }

        if (modo === 'match-periodo-impuesto') {
            if (!Array.isArray(deudasABuscar) || deudasABuscar.length === 0) {
                return { success: false, message: 'No se recibieron deudas a buscar' };
            }
            const { matcheadas, noMatcheadas } = await ejecutarModoMatch(frame, deudasABuscar);
            const ok = matcheadas.length > 0;
            console.log(`  ${ok ? '✅' : 'ℹ️'} [SCT] Match: ${matcheadas.length}/${deudasABuscar.length} entradas con coincidencias`);
            return {
                success: ok,
                modo,
                matcheadas,
                noMatcheadas,
                message: ok
                    ? `${matcheadas.length}/${deudasABuscar.length} entrada(s) matchearon`
                    : 'Ninguna entrada matcheó'
            };
        }

        return { success: false, message: `Modo desconocido: ${modo}` };

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_7_seleccionarFilas:', error);
        return { success: false, message: error.message };
    }
}

module.exports = { ejecutar };
