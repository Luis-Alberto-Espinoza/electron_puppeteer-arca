// paso_13_completarTotales.js
// En la página "Determinación" (ya de vuelta del Detallar), completa los totales que
// se cargan a mano y NO salen del Detallar. Hoy: "Total de Ingresos No gravados".
//
// Los campos se ubican por su ETIQUETA visible (.GridFieldWrapper → .dynaFormGrid-propertyTitle),
// no por posición. Los valores vienen de datosManuales.totalesDeterminacion (PLACEHOLDERS
// flagged DatoAModificarPorExcel; mañana del frontend). Vacío/null → se saltea el campo.

const ATTR = 'data-ddjj-total-target';

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} datosManuales { totalesDeterminacion: { [etiqueta]: valor } }
 */
async function ejecutar(page, datosManuales) {
    const totales = (datosManuales && datosManuales.totalesDeterminacion) || {};
    const entradas = Object.entries(totales).filter(([, v]) => v != null && String(v) !== '');

    if (!entradas.length) {
        console.log('[DDJJ paso_13] No hay totales para completar.');
        return { success: true, completados: [], resumen: 'Totales: nada para completar' };
    }
    console.log('[DDJJ paso_13] Completando totales de la página...');

    const completados = [];
    for (const [etiqueta, valor] of entradas) {
        // Marcar el input editable del GridFieldWrapper cuyo título matchea la etiqueta.
        const ok = await page.evaluate((lbl, attr) => {
            const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
            document.querySelectorAll('[' + attr + ']').forEach(e => e.removeAttribute(attr));
            const w = Array.from(document.querySelectorAll('.GridFieldWrapper')).find(w => {
                const t = w.querySelector('.dynaFormGrid-propertyTitle');
                return t && norm(t.textContent) === norm(lbl);
            });
            if (!w) return false;
            const inp = w.querySelector('input');
            if (!inp || inp.disabled || inp.readOnly) return false;
            inp.setAttribute(attr, '1');
            return true;
        }, etiqueta, ATTR);

        if (!ok) {
            console.warn(`[DDJJ paso_13] ⚠️ No encontré input editable para "${etiqueta}".`);
            completados.push({ etiqueta, ok: false });
            continue;
        }

        const inp = await page.$('[' + ATTR + ']');
        try { await inp.scrollIntoView(); } catch (_) {}
        await inp.click({ clickCount: 3 });
        await inp.press('Backspace');
        await inp.type(String(valor), { delay: 60 });
        await inp.press('Tab');

        const val = await page.evaluate((attr) => {
            const e = document.querySelector('[' + attr + ']');
            const v = e ? e.value : null;
            if (e) e.removeAttribute(attr);
            return v;
        }, ATTR);
        completados.push({ etiqueta, ok: true, valor: val });
        console.log(`[DDJJ paso_13] "${etiqueta}" → "${val}"`);
    }

    const resumen = 'Totales: ' + completados.map(c => `${c.etiqueta}=${c.ok ? `"${c.valor}"` : '❌'}`).join(' · ');
    return { success: true, completados, resumen };
}

module.exports = { ejecutar };
