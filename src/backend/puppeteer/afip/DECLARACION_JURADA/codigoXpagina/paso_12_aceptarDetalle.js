// paso_12_aceptarDetalle.js
// Tras cargar la base (paso_11), click en "Aceptar" del detalle de alícuotas para
// CONFIRMAR la carga y volver a la solapa Determinación. El botón es un .v-button común
// con caption "Aceptar" (NO el .eFormAceptarButton del alta).
//
// Espera Vaadin idle + REINTENTA: tras el recálculo, el botón se re-renderiza y el handle
// queda stale ("Node is not clickable") → re-buscamos el botón FRESCO en cada intento.

const nav = require('./_navegacion.js');

/**
 * @param {import('puppeteer').Page} page
 */
async function ejecutar(page) {
    console.log('[DDJJ paso_12] Click "Aceptar" del detalle (volver a la vista anterior)...');
    const inputsAntes = await page.evaluate(() => document.querySelectorAll('input').length);

    const buscarAceptar = () => page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('.v-button')).find(b => {
            if (b.offsetParent === null) return false;        // visible
            const c = b.querySelector('.v-button-caption');
            return c && (c.textContent || '').trim().toLowerCase() === 'aceptar';
        }) || null;
    });

    let volvio = false;
    for (let intento = 1; intento <= 3 && !volvio; intento++) {
        await nav.esperarVaadinIdle(page);
        const el = (await buscarAceptar()).asElement();
        if (!el) throw new Error('No se encontró el botón "Aceptar" del detalle');
        try {
            try { await el.scrollIntoView(); } catch (_) {}
            await el.click();
        } catch (e) {
            console.warn(`[DDJJ paso_12] click falló (intento ${intento}/3): ${e.message}`);
            await new Promise(r => setTimeout(r, 500));
            continue;
        }
        // El cambio de vista (vuelta a Determinación) ocurre en ~1-2s tras el recálculo.
        // 4s es ceiling con margen; si no, reintento corto — antes eran 12s de espera muerta.
        volvio = await page.waitForFunction((prev) => document.querySelectorAll('input').length !== prev,
            { timeout: 4000 }, inputsAntes).then(() => true).catch(() => false);
        if (!volvio) { console.warn(`[DDJJ paso_12] no cambió la vista (intento ${intento}/3), reintento...`); await new Promise(r => setTimeout(r, 500)); }
    }

    console.log(volvio ? '[DDJJ paso_12] Volvió a la vista anterior.' : '[DDJJ paso_12] ⚠️ No se confirmó el cambio de vista tras "Aceptar".');
    return { success: true, volvio, url: page.url(), resumen: `Aceptar detalle: ${volvio ? '✅ volvió a la vista anterior' : '⚠️ no se confirmó el cambio'}` };
}

module.exports = { ejecutar };
