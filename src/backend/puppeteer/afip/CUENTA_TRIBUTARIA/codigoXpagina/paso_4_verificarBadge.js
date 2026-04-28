// PASO 4: Verificar el badge de la tab "Deudas".
// Devuelve { sinDeuda: boolean, cantidad: number|null, raw: string|null }.
// Regla: badge ausente o "0" → sinDeuda=true (cliente sin deuda, no es error).
// El tab vive dentro del iframe del SCT.

const { getSctFrame, FN_FIND_TAB_DEUDAS } = require('./_helpers.js');

async function ejecutar(page) {
    try {
        console.log('  → [SCT] Leyendo badge de Deudas...');

        const frame = await getSctFrame(page);

        // El badge a veces tarda en actualizarse desde el API; le damos 1s.
        await new Promise(r => setTimeout(r, 1000));

        const info = await frame.evaluate(`(function() {
            const findTab = ${FN_FIND_TAB_DEUDAS};
            const tabDeudas = findTab();
            if (!tabDeudas) return { found: false };

            const badge = tabDeudas.querySelector('span.badge.badge-danger')
                       || tabDeudas.querySelector('.badge.badge-danger')
                       || tabDeudas.querySelector('.badge')
                       || tabDeudas.querySelector('span');

            if (!badge) return { found: true, badgePresent: false, raw: null, cantidad: 0 };

            const raw = (badge.textContent || '').trim();
            const n = parseInt(raw.replace(/\\D/g, ''), 10);
            return { found: true, badgePresent: true, raw, cantidad: Number.isFinite(n) ? n : null };
        })()`);

        if (!info.found) {
            throw new Error('No se encontró el tab Deudas para leer el badge');
        }

        if (!info.badgePresent || !info.cantidad) {
            console.log('  ✅ [SCT] Sin deuda (badge ausente o 0)');
            return { success: true, sinDeuda: true, cantidad: 0, raw: info.raw };
        }

        console.log(`  ✅ [SCT] Deudas detectadas: ${info.cantidad}`);
        return { success: true, sinDeuda: false, cantidad: info.cantidad, raw: info.raw };

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_4_verificarBadge:', error.message);
        return { success: false, message: error.message };
    }
}

module.exports = { ejecutar };
