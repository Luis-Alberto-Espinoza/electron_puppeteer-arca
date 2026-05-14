// PASO 10: Seleccionar medio de pago.
// Click real sobre el botón asociado al input[type="image"][id="<medioId>"].
// Tras el click aparece el modal de confirmación (paso 11).
//
// Mapeo idéntico al del módulo VEP (ver doc §10).
//
// Patrones aplicados (ver doc §7.0):
//   7.0.2 click real,
//   7.0.3 esperar al modal,
//   7.0.6 — busca en TODOS los frames (no solo en el del SCT) porque AFIP
//   puede renderizar esta vista en otro frame.

const { frameConSelector, esperarFrameConSelector } = require('./_helpers.js');

const MAPEO_MEDIOS_PAGO = {
    'pago_qr':          '0',
    'pagar_link':       '1001',
    'pago_mis_cuentas': '1002',
    'interbanking':     '1003',
    'xn_group':         '1005'
};

const TIMEOUT_MODAL = 15000;

async function clickMedioPago(frame, medioId) {
    return await frame.evaluate((targetId) => {
        const input = document.querySelector(`input[type="image"][id="${CSS.escape(targetId)}"]`);
        if (!input) return { encontrado: false };

        // Si vive dentro de un <button> envolvente, clickear el botón.
        // Si no, clickear el input directamente.
        const target = input.closest('button') || input;
        try { target.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {}
        target.click();
        return { encontrado: true, clickeado: true };
    }, medioId);
}

async function ejecutar(page, medioPago) {
    try {
        if (!medioPago || !medioPago.id) {
            throw new Error('medioPago no provisto');
        }
        const medioId = MAPEO_MEDIOS_PAGO[medioPago.id];
        if (!medioId) {
            throw new Error(`Medio de pago no válido: ${medioPago.id}`);
        }

        console.log(`  → [SCT] Seleccionando medio de pago: ${medioPago.nombre} (id=${medioId})...`);

        // Buscar en cualquier frame el input del medio de pago elegido.
        const selectorInput = `input[type="image"][id="${medioId}"]`;
        const frame = await esperarFrameConSelector(page, selectorInput, { timeout: 15000 });

        const r = await clickMedioPago(frame, medioId);
        if (!r.encontrado) {
            throw new Error(`No se encontró el medio de pago con id=${medioId}`);
        }

        // Esperar al modal en el frame que lo tenga.
        const inicio = Date.now();
        while (Date.now() - inicio < TIMEOUT_MODAL) {
            const fModal = await frameConSelector(page, '.modal.show');
            if (fModal) {
                console.log(`  ✅ [SCT] Modal visible — medio "${medioPago.nombre}" seleccionado`);
                return { success: true, medioPago };
            }
            await new Promise(r => setTimeout(r, 300));
        }

        throw new Error('Timeout esperando el modal de confirmación');

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_10_seleccionarMedioPago:', error);
        return { success: false, message: error.message };
    }
}

module.exports = { ejecutar, MAPEO_MEDIOS_PAGO };
