// paso_7_aceptar.js
// Click en "Aceptar" (.eFormAceptarButton) para CREAR la DDJJ.
// Maneja el caso conocido: si ya existe un formulario en estado BORRADOR / EN
// PROCESO / CON ERROR, el portal muestra un error de validación con botón "Volver".
//
// OJO: "Aceptar" acá CREA el formulario (abre el F.5111 vacío para cargar). NO es
// la presentación final de la DDJJ con los números — eso es una etapa posterior.

/**
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{status:'aceptado'|'borrador-existente'|'error', mensaje:string, url:string}>}
 */
async function ejecutar(page) {
    console.log('[DDJJ paso_7] Click "Aceptar"...');

    // Click real en el Aceptar visible (puede haber otro oculto de la vista Buscar).
    const handle = await page.evaluateHandle(() => {
        const btns = Array.from(document.querySelectorAll('.eFormAceptarButton'));
        return btns.find(b => b.offsetParent !== null) || btns[0] || null;
    });
    const el = handle.asElement();
    if (!el) throw new Error('No se encontró el botón "Aceptar"');
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();

    // Esperar: error de validación (borrador/en proceso) o avance al formulario.
    let status = 'aceptado';
    let mensaje = '';
    try {
        await page.waitForFunction(() => {
            const err = document.querySelector('.v-label-errorDesc, .errorDesc');
            return err && err.offsetParent !== null && (err.textContent || '').trim().length > 0;
        }, { timeout: 8000 });

        mensaje = await page.evaluate(() => {
            const err = document.querySelector('.v-label-errorDesc, .errorDesc');
            return err ? (err.textContent || '').trim() : '';
        });
        status = /borrador|proceso|error/i.test(mensaje) ? 'borrador-existente' : 'error';
        console.warn(`[DDJJ paso_7] Validación del portal: "${mensaje}"`);

        // Click "Volver" para dejar la vista limpia.
        const volver = await page.evaluateHandle(() => {
            return Array.from(document.querySelectorAll('.v-button')).find(b => {
                const c = b.querySelector('.v-button-caption');
                return c && /volver/i.test(c.textContent);
            }) || null;
        });
        const vEl = volver.asElement();
        if (vEl) { try { await vEl.click(); } catch (_) {} }

    } catch (_) {
        // No apareció error → el alta avanzó (se abrió el formulario a cargar).
        status = 'aceptado';
        console.log('[DDJJ paso_7] Aceptar OK: el formulario se abrió (sin error de validación).');
    }

    return { status, mensaje, url: page.url() };
}

module.exports = { ejecutar };
