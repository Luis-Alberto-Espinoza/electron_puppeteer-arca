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

        // UI nueva de AFIP/ARCA: los medios de pago ahora son
        // <button class="...edpeffectbutton"> que adentro tienen
        // <img id="0" src=".../edp0.gif">. El id del <img> sigue siendo
        // el mismo mapeo (0 = QR, 1001 = Link, etc.).
        const SELECTOR_BOTONES = 'button.edpeffectbutton';
        try {
            await page.waitForSelector(SELECTOR_BOTONES, { timeout: 10000 });
        } catch (errSelector) {
            // No aparecieron los botones de medio de pago: dejamos una pista
            // acotada (solo lo que menciona qr/pago) por si AFIP volvió a cambiar.
            const relevantes = await page.evaluate(() => {
                const candidatos = Array.from(document.querySelectorAll('button, a, input, img, [role="button"]'));
                return candidatos
                    .filter(el => /qr|pago|medio/i.test(el.outerHTML))
                    .map(el => ({
                        tag: el.tagName.toLowerCase(),
                        id: el.id || null,
                        clase: el.className || null,
                        alt: el.getAttribute('alt') || null,
                        texto: (el.textContent || '').trim().slice(0, 40) || null
                    }));
            });

            console.error("  ❌ No aparecieron los botones de medio de pago (button.edpeffectbutton).");
            console.error("  Candidatos con 'qr'/'pago':", JSON.stringify(relevantes));
            throw errSelector;
        }

        // Buscar el botón y hacer CLICK REAL.
        // El <img> del medio tiene id === medioId (ej: "0" para QR);
        // clickeamos el <button> que lo contiene.
        const clickRealizado = await page.evaluate((targetId) => {
            const img = document.querySelector(`button.edpeffectbutton img[id="${targetId}"]`);

            if (img) {
                const button = img.closest('button');
                if (button) {
                    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    button.click();
                    return { encontrado: true, clickRealizado: true, via: 'img-id' };
                }
            }

            // Fallback: por el aria-label del botón (ej: "...ARCA-QR")
            const porSrc = document.querySelector(`button.edpeffectbutton img[src*="edp${targetId}."]`);
            if (porSrc) {
                const button = porSrc.closest('button');
                if (button) {
                    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    button.click();
                    return { encontrado: true, clickRealizado: true, via: 'img-src' };
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
