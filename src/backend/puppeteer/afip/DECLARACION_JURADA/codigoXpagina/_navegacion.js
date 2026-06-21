// _navegacion.js
// Helpers de navegación entre las páginas/solapas del form Vaadin F.5111
// (Datos Informativos → Determinación → Liquidación → Consistencia IVA → ...).
// Reusable porque "Siguiente >" se clickea varias veces a lo largo del recorrido.
//
//  - volcarPagina(page, etiqueta): vuelca captions/botones/inputs/campos (genérico).
//  - siguiente(page, etiqueta):    click "Siguiente >" + espera cambio + volcado.
//  - volverDetalle(page):          click botón de ícono volver.png (sale de un sub-detalle).

/** Vuelca la página actual (qué muestra / qué pide). Devuelve { ...data, resumen }. */
async function volcarPagina(page, etiqueta = 'página') {
    const data = await page.evaluate(() => {
        const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
        const captions = Array.from(document.querySelectorAll('.v-captiontext')).map(txt).filter(Boolean);
        const botones = Array.from(document.querySelectorAll('.v-button-caption')).map(txt).filter(Boolean);
        const inputs = Array.from(document.querySelectorAll('input'))
            .filter(i => i.offsetParent !== null)
            .map(i => ({ tipo: i.type || 'text', clase: i.className, maxlength: i.maxLength, value: i.value }));
        const campos = Array.from(document.querySelectorAll('.GridFieldWrapper'))
            .filter(w => w.offsetParent !== null)
            .map(w => {
                const lbl = txt(w.querySelector('.dynaFormGrid-propertyTitle'));
                const inp = w.querySelector('input');
                const valor = inp
                    ? `[${inp.className.includes('inputNumberCustomField') ? 'num' : (inp.type || 'text')}${inp.disabled ? '·dis' : ''}="${inp.value}"]`
                    : txt(w.querySelector('.labelNumberCustomField .v-label, .v-customcomponent .v-label'));
                return { label: lbl, valor };
            })
            .filter(c => c.label);
        return { url: location.href, captions, botones, totalInputs: inputs.length, inputs: inputs.slice(0, 50), campos };
    });

    const resumen = [
        `--- ${etiqueta} ---`,
        `URL: ${data.url}`,
        `Captions: ${data.captions.join(' · ')}`,
        `Botones: ${data.botones.join(' · ')}`,
        `Inputs visibles (${data.totalInputs}):`,
        ...data.inputs.map((i, n) => `  [${n}] tipo=${i.tipo} maxlen=${i.maxlength} clase="${i.clase}" value="${i.value}"`),
        `CAMPOS etiquetados (${data.campos.length}):`,
        ...data.campos.map(c => `  ${c.label} → ${c.valor || '(vacío)'}`)
    ].join('\n');

    return { ...data, success: true, resumen };
}

/** Espera a que Vaadin termine su comunicación con el server (.v-loading-indicator oculto). */
async function esperarVaadinIdle(page, timeout = 8000) {
    try {
        await page.waitForFunction(() => {
            const li = document.querySelector('.v-loading-indicator');
            return !li || li.offsetParent === null || getComputedStyle(li).display === 'none';
        }, { timeout });
    } catch (_) { /* si no hay indicador o tarda, seguimos igual */ }
}

/** Firma de la página = etiquetas de los campos (cambia entre solapas, a diferencia
 *  del conteo de inputs, que Liquidación y Consistencia IVA comparten en 11). */
async function firmaPagina(page) {
    return await page.evaluate(() => {
        const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
        return Array.from(document.querySelectorAll('.dynaFormGrid-propertyTitle'))
            .map(txt).filter(Boolean).join('|');
    });
}

/** Devuelve el handle del botón "Siguiente >" visible (o null). */
async function botonSiguiente(page) {
    const handle = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('.v-button')).find(b => {
            if (b.offsetParent === null) return false;
            const c = b.querySelector('.v-button-caption');
            return c && /siguiente/i.test(c.textContent || '');
        }) || null;
    });
    return handle.asElement();
}

/**
 * Click "Siguiente >" + espera a que cambie la vista + vuelca la página nueva.
 * REINTENTA: justo después de cargar retenciones/volver, Vaadin sigue ocupado y el
 * primer click se ignora (a mano, re-clickear avanza). Esperamos idle y reintentamos.
 */
async function siguiente(page, etiqueta = 'Siguiente → página nueva') {
    console.log(`[DDJJ nav] Click "Siguiente >" (${etiqueta})...`);
    const firmaAntes = await firmaPagina(page);

    let avanzo = false;
    for (let intento = 1; intento <= 4 && !avanzo; intento++) {
        await esperarVaadinIdle(page);              // que Vaadin no esté procesando
        const el = await botonSiguiente(page);
        if (!el) throw new Error('No se encontró el botón "Siguiente >"');
        try { await el.scrollIntoView(); } catch (_) {}
        await el.click();

        // Avanzó = cambió la FIRMA (etiquetas de campos), no el conteo de inputs.
        // Timeout corto por intento (2.5s): si el click no enganchó (Vaadin ocupado), no
        // tiene sentido esperar 6s — mejor reintentar rápido (hay hasta 4 intentos).
        avanzo = await page.waitForFunction((prev) => {
            const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
            const f = Array.from(document.querySelectorAll('.dynaFormGrid-propertyTitle'))
                .map(txt).filter(Boolean).join('|');
            return f !== prev;
        }, { timeout: 2500 }, firmaAntes).then(() => true).catch(() => false);

        if (!avanzo) {
            console.warn(`[DDJJ nav] "Siguiente" no avanzó (intento ${intento}/4), reintento...`);
            await new Promise(r => setTimeout(r, 600));
        }
    }
    console.log(avanzo ? '[DDJJ nav] Cambió la vista tras "Siguiente".'
        : '[DDJJ nav] "Siguiente" no avanzó tras 4 intentos.');

    return { ...(await volcarPagina(page, etiqueta)), avanzo };
}

/** ¿Hay un botón "Siguiente >" visible? (señal de estar en una página navegable). */
function haySiguienteVisible() {
    return Array.from(document.querySelectorAll('.v-button')).some(b => {
        if (b.offsetParent === null) return false;
        const c = b.querySelector('.v-button-caption');
        return c && /siguiente/i.test(c.textContent || '');
    });
}

/** Click en el botón de ícono volver.png (sale de un sub-detalle, ej. el de Retenciones). */
async function volverDetalle(page) {
    console.log('[DDJJ nav] Volviendo del sub-detalle (botón volver.png)...');

    const handle = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('.v-button')).find(b => {
            if (b.offsetParent === null) return false;
            const img = b.querySelector('img');
            return img && /volver/i.test(img.getAttribute('src') || '');
        }) || null;
    });
    const el = handle.asElement();
    if (!el) { console.warn('[DDJJ nav] No encontré el botón volver.png'); return { success: false }; }
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();

    // Volvimos cuando reaparece "Siguiente >" (más confiable que contar inputs).
    try {
        await page.waitForFunction(haySiguienteVisible, { timeout: 15000 });
        console.log('[DDJJ nav] Volvió (Siguiente visible de nuevo).');
        return { success: true };
    } catch (_) {
        console.warn('[DDJJ nav] Tras "volver" no reapareció "Siguiente".');
        return { success: false };
    }
}

module.exports = { volcarPagina, siguiente, volverDetalle, esperarVaadinIdle };
