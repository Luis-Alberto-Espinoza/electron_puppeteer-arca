/**
 * PASO 8: Seleccionar medio de pago (CLICK REAL)
 * Mapeo de IDs de medios de pago:
 * - pago_qr: 0
 * - pagar_link: 1001
 * - pago_mis_cuentas: 1002
 * - interbanking: 1003
 * - xn_group: 1005
 *
 * IMPORTANTE: Esta versión HACE CLICK REAL en el medio de pago.
 * Después del click se abrirá un modal de confirmación.
 */

// Mapeo de IDs del frontend a IDs de AFIP
const MAPEO_MEDIOS_PAGO = {
    'pago_qr': '0',
    'pagar_link': '1001',
    'pago_mis_cuentas': '1002',
    'interbanking': '1003',
    'xn_group': '1005'
};

async function ejecutar(page, medioPago) {
    try {
        const medioId = MAPEO_MEDIOS_PAGO[medioPago.id];

        if (!medioId) {
            throw new Error(`Medio de pago no válido: ${medioPago.id}`);
        }

        console.log(`  → Seleccionando medio de pago: ${medioPago.nombre}...`);

        // Esperar a que aparezcan los botones de medios de pago
        await page.waitForSelector('input[type="image"]', { timeout: 10000 });

        // Buscar el botón y hacer CLICK REAL
        const clickRealizado = await page.evaluate((targetId) => {
            const input = document.querySelector(`input[type="image"][id="${targetId}"]`);

            if (input) {
                const button = input.closest('button');
                if (button) {
                    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    button.click();
                    return { encontrado: true, clickRealizado: true };
                }
            }

            return { encontrado: false, clickRealizado: false };
        }, medioId);

        if (!clickRealizado.encontrado || !clickRealizado.clickRealizado) {
            throw new Error(`No se pudo hacer click en el medio de pago con ID: ${medioId}`);
        }

        console.log(`  ✅ Medio de pago seleccionado: ${medioPago.nombre}`);

        // Esperar 2 segundos para que aparezca el modal
        await new Promise(resolve => setTimeout(resolve, 2000));

        return {
            success: true,
            message: `Click realizado en medio de pago ${medioPago.nombre}`,
            clickRealizado: true,
            elementoEncontrado: clickRealizado
        };

    } catch (error) {
        console.error("  ❌ Error en paso_8_seleccionarMedioPago:", error);
        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = { ejecutar };
