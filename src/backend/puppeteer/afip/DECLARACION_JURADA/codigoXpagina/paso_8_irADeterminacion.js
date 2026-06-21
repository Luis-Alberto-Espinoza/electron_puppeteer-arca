// paso_8_irADeterminacion.js
// Tras crear la DDJJ (Aceptar OK), clickea la solapa "Determinación".
// La solapa es un .v-captiontext "Determinación"; clickeamos el tab clickeable.

/**
 * @param {import('puppeteer').Page} page
 */
async function ejecutar(page) {
    console.log('[DDJJ paso_8] Click solapa "Determinación"...');

    const handle = await page.evaluateHandle(() => {
        const cap = Array.from(document.querySelectorAll('.v-captiontext'))
            .find(c => /determinaci/i.test(c.textContent || ''));
        if (!cap) return null;
        return cap.closest('.v-tabsheet-tabitem') || cap.closest('.v-caption') || cap;
    });
    const el = handle.asElement();
    if (!el) throw new Error('No se encontró la solapa "Determinación"');
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();

    // Validar: en la solapa Determinación aparece el botón "detallar" (icono).
    await page.waitForFunction(() => {
        return Array.from(document.querySelectorAll('.v-button'))
            .some(b => b.querySelector('img[src*="detallar"]'));
    }, { timeout: 15000 });

    console.log('[DDJJ paso_8] Solapa "Determinación" activa (botón detallar visible).');
}

module.exports = { ejecutar };
