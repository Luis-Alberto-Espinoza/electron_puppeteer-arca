// PASO 2: Cambiar el CUIT interno dentro del SCT (si el usuario representa a varios).
//
// - Si no aparece el select $PropertySelection tras un timeout corto, se saltea.
// - Si aparece, se matchea la <option> por el CUIT (normalizando guiones/espacios),
//   se setea value + dispara 'change' (el form se auto-submitea).
// - Verificación: el textContent de div.razonSoc cambia respecto al valor previo.

const { esperarIframeSctListo } = require('./_helpers.js');

const SELECTOR_SELECT = 'select[name="$PropertySelection"]';
const SELECTOR_RAZON_SOC = 'div.razonSoc';

function normalizarCuit(txt) {
    return String(txt || '').replace(/\D/g, '');
}

async function ejecutar(page, cuitObjetivo, options = {}) {
    try {
        const { timeoutSelect = 3000, timeoutCambio = 15000 } = options;
        const cuitNorm = normalizarCuit(cuitObjetivo);

        if (!cuitNorm) {
            return { success: true, cambiado: false, message: 'Sin CUIT objetivo (se saltea)' };
        }

        console.log(`  → [SCT] Verificando selector de CUIT interno (objetivo ${cuitNorm})...`);

        let tieneSelect = false;
        try {
            await page.waitForSelector(SELECTOR_SELECT, { timeout: timeoutSelect });
            tieneSelect = true;
        } catch (_) {
            tieneSelect = false;
        }

        if (!tieneSelect) {
            console.log('  ℹ️ [SCT] No hay selector de CUIT interno; único CUIT del representante. Continuando.');
            return { success: true, cambiado: false, message: 'Selector ausente, se saltea' };
        }

        // Leer razón social actual para detectar cambio.
        const razonSocPrevia = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el ? (el.getAttribute('title') || el.textContent || '').trim() : '';
        }, SELECTOR_RAZON_SOC);

        // Buscar la option cuyo texto contenga el CUIT objetivo.
        const resultado = await page.evaluate((selSelect, cuitTarget) => {
            const select = document.querySelector(selSelect);
            if (!select) return { ok: false, error: 'select no encontrado' };
            const opciones = Array.from(select.options || []);
            const match = opciones.find((opt) => {
                const t = (opt.textContent || opt.value || '').replace(/\D/g, '');
                return t.includes(cuitTarget);
            });
            if (!match) return { ok: false, error: `CUIT ${cuitTarget} no encontrado en opciones`, opciones: opciones.map(o => o.textContent) };

            if (select.value === match.value) {
                return { ok: true, cambio: false, valorSeleccionado: match.value, texto: match.textContent };
            }

            select.value = match.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, cambio: true, valorSeleccionado: match.value, texto: match.textContent };
        }, SELECTOR_SELECT, cuitNorm);

        if (!resultado.ok) {
            throw new Error(resultado.error || 'No se pudo seleccionar el CUIT interno');
        }

        if (!resultado.cambio) {
            console.log(`  ✅ [SCT] CUIT interno ya seleccionado: ${resultado.texto}`);
            return { success: true, cambiado: false, yaSeleccionado: true, option: resultado.texto };
        }

        // Esperar que el SCT recargue (cambia razonSoc).
        try {
            await page.waitForFunction(
                (sel, prev) => {
                    const el = document.querySelector(sel);
                    if (!el) return false;
                    const actual = (el.getAttribute('title') || el.textContent || '').trim();
                    return actual && actual !== prev;
                },
                { timeout: timeoutCambio },
                SELECTOR_RAZON_SOC,
                razonSocPrevia
            );
        } catch (e) {
            console.warn('  ⚠️ [SCT] No se detectó cambio en razonSoc; puede ser el mismo CUIT.');
        }

        // El cambio de CUIT recarga el iframe del SCT. Esperamos a que el iframe nuevo
        // esté montado y con tabs visibles antes de devolver el control al flujo,
        // así paso_3 no agarra una referencia al iframe viejo que se está desprendiendo.
        try {
            await esperarIframeSctListo(page);
        } catch (e) {
            console.warn(`  ⚠️ [SCT] No se confirmó iframe listo tras cambio de CUIT: ${e.message}`);
        }

        console.log(`  ✅ [SCT] CUIT interno cambiado a: ${resultado.texto}`);
        return { success: true, cambiado: true, option: resultado.texto };

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_2_cambiarCuitInterno:', error);
        return { success: false, message: error.message };
    }
}

module.exports = { ejecutar };
