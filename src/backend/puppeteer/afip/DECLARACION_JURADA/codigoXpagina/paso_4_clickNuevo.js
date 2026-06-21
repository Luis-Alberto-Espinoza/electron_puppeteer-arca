// paso_4_clickNuevo.js
// Click en el botón "Nuevo" (div.v-button) y espera la vista de alta:
// aparecen los campos requeridos (*) Organismo / Formulario.

/**
 * @param {import('puppeteer').Page} page
 */
async function ejecutar(page) {
    console.log('[DDJJ paso_4] Click "Nuevo"...');

    const handle = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('.v-button')).find(b => {
            const cap = b.querySelector('.v-button-caption');
            return cap && /nuevo/i.test(cap.textContent);
        }) || null;
    });
    const el = handle.asElement();
    if (!el) throw new Error('No se encontró el botón "Nuevo"');
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();

    await page.waitForFunction(() => {
        return !!document.querySelector('.v-required-field-indicator')
            || !!document.querySelector('.v-filterselect-required');
    }, { timeout: 20000 });

    console.log('[DDJJ paso_4] Vista "Nuevo" lista.');
}

module.exports = { ejecutar };
