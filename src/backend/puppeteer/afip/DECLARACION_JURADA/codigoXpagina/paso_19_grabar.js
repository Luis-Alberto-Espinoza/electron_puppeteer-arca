// paso_19_grabar.js
// Click en "Grabar" → guarda la DDJJ como BORRADOR (NO es la presentación final, que es
// "Presentar"). Persiste en AFIP: tras grabar, ese período queda con borrador → reabrirlo
// da "borrador-existente" (camino de recuperación con "Buscar": pendiente).
//
// Maneja un eventual popup de confirmación y captura el mensaje resultante (éxito/validación).

const nav = require('./_navegacion.js');

async function capturarMensaje(page, ms = 6000) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
        const t = await page.evaluate(() => {
            const n = document.querySelector('.v-Notification, .v-label-errorDesc, .errorDesc');
            return n && n.offsetParent !== null ? (n.textContent || '').replace(/\s+/g, ' ').trim() : '';
        });
        if (t) return t;
        await new Promise(r => setTimeout(r, 400));
    }
    return '';
}

/**
 * @param {import('puppeteer').Page} page
 */
async function ejecutar(page) {
    console.log('[DDJJ paso_19] Click "Grabar" (guardar borrador)...');
    await nav.esperarVaadinIdle(page);

    const h = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('.v-button')).find(b => {
            if (b.offsetParent === null) return false;
            const c = b.querySelector('.v-button-caption');
            return c && /^grabar$/i.test((c.textContent || '').trim());
        }) || null;
    });
    const el = h.asElement();
    if (!el) throw new Error('No se encontró el botón "Grabar"');
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();
    await nav.esperarVaadinIdle(page);
    await new Promise(r => setTimeout(r, 1500));

    // ¿Apareció un popup de confirmación? Lo relevamos y, si tiene botón claro, lo aceptamos.
    const popup = await page.evaluate(() => {
        const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
        const win = Array.from(document.querySelectorAll('.v-window')).find(w => w.offsetParent !== null);
        if (!win) return null;
        return {
            titulo: txt(win.querySelector('.v-window-header, .v-window-caption')),
            texto: txt(win).slice(0, 220),
            botones: Array.from(win.querySelectorAll('.v-button-caption')).map(txt).filter(Boolean)
        };
    });
    let confirmado = false;
    if (popup) {
        console.log(`[DDJJ paso_19] Popup: "${popup.titulo}" | botones: ${popup.botones.join(' · ')} | ${popup.texto}`);
        const hc = await page.evaluateHandle(() => {
            const win = Array.from(document.querySelectorAll('.v-window')).find(w => w.offsetParent !== null);
            if (!win) return null;
            return Array.from(win.querySelectorAll('.v-button')).find(b => {
                const c = b.querySelector('.v-button-caption');
                return c && /(aceptar|confirmar|grabar|^s[ií]$)/i.test((c.textContent || '').trim());
            }) || null;
        });
        const ec = hc.asElement();
        if (ec) { try { await ec.click(); } catch (_) {} confirmado = true; await nav.esperarVaadinIdle(page); }
        else console.warn('[DDJJ paso_19] Popup sin botón de confirmación reconocible — NO se grabó (revisar a mano).');
    }

    const mensaje = await capturarMensaje(page, 6000);
    const ok = /grabad|guardad|correctamente|exitos/i.test(mensaje);

    const resumen = ['--- paso_19 Grabar ---',
        popup ? `Confirmación: "${popup.titulo}" [${popup.botones.join(', ')}]${confirmado ? ' → aceptada' : ' → NO aceptada'}` : 'Sin popup de confirmación.',
        `Mensaje AFIP: "${mensaje || '(no capturé)'}"`,
        `Resultado: ${ok ? '✅ grabado' : (mensaje ? '⚠️ revisar (¿validación?)' : '❓ sin mensaje visible — confirmar a mano')}`
    ].join('\n');
    console.log('[DDJJ paso_19]\n' + resumen);
    return { success: true, grabado: ok, popup, confirmado, mensaje, resumen };
}

module.exports = { ejecutar };
