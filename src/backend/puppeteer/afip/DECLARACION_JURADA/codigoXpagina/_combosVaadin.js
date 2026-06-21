// _combosVaadin.js
// Helpers reutilizables para los combos Vaadin (v-filterselect) del portal fenix
// (Mis Aplicaciones Web). Los combos Organismo / Formulario / Estado comparten
// clases eForm*, así que NO se distinguen por clase: los localizamos por el
// texto de su caption (.v-captiontext).
//
// Reglas Vaadin aprendidas:
//  - El dropdown NO se abre tipeando: hay que clickear la flecha .v-filterselect-button.
//  - El popup de opciones (.v-filterselect-suggestpopup) flota en el body, fuera del form.
//  - Cada opción es un .gwt-MenuItem.
//  - Click real (mouse de Puppeteer), no sintético.

const SEL_POPUP = '.v-filterselect-suggestpopup';
const SEL_ITEM = `${SEL_POPUP} .gwt-MenuItem`;

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Función (serializable) que corre EN el navegador: ubica un elemento del combo
// a partir del texto del caption. `que` = 'button' (la flecha) o 'input'.
function buscarElementoCombo(captionText, que) {
    const cap = Array.from(document.querySelectorAll('.v-captiontext'))
        .find(c => c.textContent.trim().toLowerCase() === captionText.toLowerCase());
    if (!cap) return null;
    const selector = que === 'input'
        ? '.v-filterselect .v-filterselect-input'
        : '.v-filterselect .v-filterselect-button';
    let node = cap.closest('.v-caption') || cap;
    for (let i = 0; i < 6 && node; i++) {
        const cont = node.parentElement;
        const el = cont && cont.querySelector(selector);
        if (el) return el;
        node = cont;
    }
    return null;
}

/** Abre el dropdown del combo (click en la flecha) y espera el popup con items. */
async function abrirCombo(page, caption) {
    const handle = await page.evaluateHandle(buscarElementoCombo, caption, 'button');
    const el = handle.asElement();
    if (!el) throw new Error(`No se encontró la flecha del combo "${caption}" (por caption)`);
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();
    await page.waitForFunction((s) => {
        const p = document.querySelector(s);
        return p && p.querySelectorAll('.gwt-MenuItem').length > 0;
    }, { timeout: 15000 }, SEL_POPUP);
}

/** Lee las opciones visibles del popup actualmente abierto. */
async function leerOpciones(page, max = 100) {
    return await page.evaluate((sel, m) => {
        return Array.from(document.querySelectorAll(sel))
            .map(e => (e.textContent || '').trim())
            .filter(Boolean)
            .slice(0, m);
    }, SEL_ITEM, max);
}

/** Lee el valor actual del input del combo (para validar la selección). */
async function leerValor(page, caption) {
    return await page.evaluate((captionText) => {
        const cap = Array.from(document.querySelectorAll('.v-captiontext'))
            .find(c => c.textContent.trim().toLowerCase() === captionText.toLowerCase());
        if (!cap) return null;
        let node = cap.closest('.v-caption') || cap;
        for (let i = 0; i < 6 && node; i++) {
            const cont = node.parentElement;
            const inp = cont && cont.querySelector('.v-filterselect .v-filterselect-input');
            if (inp) return inp.value;
            node = cont;
        }
        return null;
    }, caption);
}

/**
 * Click en la opción del popup que matchee `texto`.
 * @param {Object} opts { exacto } por defecto match por "incluye" (case/acentos-insensible).
 */
async function clickOpcion(page, texto, opts = {}) {
    const exacto = !!opts.exacto;
    const buscar = () => page.evaluateHandle((sel, buscado, exact) => {
        const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
        const t = norm(buscado);
        const items = Array.from(document.querySelectorAll(sel));
        const found = items.find(it => {
            const x = norm(it.textContent);
            return exact ? x === t : x.includes(t);
        });
        return found || null;
    }, SEL_ITEM, texto, exacto);

    // El popup Vaadin se re-renderiza async: el nodo encontrado puede quedar "detached"
    // justo antes del click. Reintentamos re-buscando el nodo FRESCO (no un handle viejo).
    let ultimoError;
    for (let intento = 1; intento <= 3; intento++) {
        const handle = await buscar();
        const el = handle.asElement();
        if (!el) throw new Error(`No se encontró la opción "${texto}" en el combo abierto`);
        try {
            try { await el.scrollIntoView(); } catch (_) {}
            await el.click();
            // Esperar a que el popup se cierre (selección aplicada).
            await page.waitForFunction((s) => {
                const p = document.querySelector(s);
                return !p || p.offsetParent === null;
            }, { timeout: 8000 }, SEL_POPUP).catch(() => {});
            return;
        } catch (e) {
            ultimoError = e;
            if (/detached|not connected/i.test(e.message)) {
                console.warn(`[combos] la opción "${texto}" se re-renderizó (intento ${intento}/3), reintento...`);
                await new Promise(r => setTimeout(r, 300));
                continue;
            }
            throw e;
        }
    }
    throw ultimoError || new Error(`No se pudo clickear la opción "${texto}"`);
}

/**
 * Selección robusta: abre el combo, ESPERA a que aparezca la opción objetivo (los
 * combos dependientes como Formulario se pueblan async tras elegir Organismo),
 * clickea, VERIFICA que el valor del input cambió, y reintenta una vez. Si la
 * opción nunca aparece, tira error listando las disponibles (diagnóstico).
 * @param {Object} opts { exacto, timeout }
 */
async function seleccionar(page, caption, texto, opts = {}) {
    const timeout = opts.timeout || 12000;
    let ultimoDiag = '';

    // Cada intento RE-ABRE el combo y reintenta TODO (el popup Vaadin se re-renderiza y
    // un click/opción puede fallar transitoriamente). Atrapamos los errores y reintentamos.
    for (let intento = 1; intento <= 3; intento++) {
        try {
            await abrirCombo(page, caption);

            // Esperar a que la opción objetivo exista en el popup (poblado async).
            const aparece = await page.waitForFunction((sel, buscado) => {
                const n = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
                const t = n(buscado);
                return Array.from(document.querySelectorAll(sel)).some(it => n(it.textContent).includes(t));
            }, { timeout }, SEL_ITEM, texto).then(() => true).catch(() => false);

            if (!aparece) {
                ultimoDiag = (await leerOpciones(page, 50)).join(' | ');
                console.warn(`[combos] "${caption}": "${texto}" no apareció (intento ${intento}/3). Opciones: ${ultimoDiag || '(vacío)'}`);
                await new Promise(r => setTimeout(r, 500));
                continue;
            }

            await clickOpcion(page, texto, opts);

            // Verificar que el valor del input realmente cambió a la opción elegida.
            const ok = await page.waitForFunction((captionText, buscado) => {
                const n = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
                const cap = Array.from(document.querySelectorAll('.v-captiontext'))
                    .find(c => c.textContent.trim().toLowerCase() === captionText.toLowerCase());
                if (!cap) return false;
                let node = cap.closest('.v-caption') || cap;
                for (let i = 0; i < 6 && node; i++) {
                    const cont = node.parentElement;
                    const inp = cont && cont.querySelector('.v-filterselect .v-filterselect-input');
                    if (inp) return n(inp.value).includes(n(buscado));
                    node = cont;
                }
                return false;
            }, { timeout: 5000 }, caption, texto).then(() => true).catch(() => false);

            if (ok) return;
            console.warn(`[combos] "${caption}": el click no aplicó (intento ${intento}/3), reintento...`);
        } catch (e) {
            console.warn(`[combos] "${caption}" intento ${intento}/3 falló: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 500));
    }

    throw new Error(`No se pudo seleccionar "${texto}" en el combo "${caption}". Última lista de opciones: ${ultimoDiag || '(vacío)'}`);
}

module.exports = { abrirCombo, leerOpciones, leerValor, clickOpcion, seleccionar, norm };
