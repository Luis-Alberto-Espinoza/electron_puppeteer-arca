// paso_15_explorarBotonesMas.js
// Paso EXPLORATORIO: en la página actual (Liquidación), detecta TODOS los botones de
// acción — incluidos los "+" de ÍCONO (img detallar.png, caption vacío) que los volcados
// por caption se pierden. Para cada uno arma un "contexto" (la etiqueta/fila/sección que
// tiene al lado) para saber qué agrega cada "+": Retenciones, Percepciones, etc.
//
// Objetivo: tener el "abanico de posibilidades" para después mostrarlo en el frontend.
// NO clickea nada: solo releva.

/**
 * @param {import('puppeteer').Page} page
 */
async function ejecutar(page) {
    console.log('[DDJJ paso_15] Relevando botones de acción / "+" de la página...');

    const data = await page.evaluate(() => {
        const txt = (el) => (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
        const visible = (el) => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
        };
        const base = (src) => { try { return src ? src.split('/').pop() : null; } catch (_) { return src; } };

        // Contexto de un botón: la etiqueta/fila/sección más cercana que lo explique.
        const contexto = (btn) => {
            const w = btn.closest('.GridFieldWrapper');
            if (w) {
                const t = txt(w.querySelector('.dynaFormGrid-propertyTitle'));
                if (t) return { tipo: 'campo', texto: t };
            }
            const row = btn.closest('.v-table-row, .v-table-row-odd, tr');
            if (row) {
                const clon = row.cloneNode(true);
                clon.querySelectorAll('input').forEach(n => n.remove());
                return { tipo: 'fila', texto: txt(clon).slice(0, 90) };
            }
            // Subir hasta encontrar un caption de sección/panel.
            let n = btn;
            for (let i = 0; i < 8 && n.parentElement; i++) {
                n = n.parentElement;
                const c = n.querySelector('.v-captiontext');
                if (c && txt(c)) return { tipo: 'seccion', texto: txt(c) };
            }
            return { tipo: 'desconocido', texto: '' };
        };

        const botones = Array.from(document.querySelectorAll('.v-button, [role="button"]'))
            .filter(visible)
            .map((b, i) => {
                const img = b.querySelector('img');
                const caption = txt(b.querySelector('.v-button-caption')) || txt(b);
                return {
                    i,
                    caption: caption || '(sin texto)',
                    icono: base(img && img.getAttribute('src')),
                    esAccionField: b.className.includes('dynaFormActionField'),
                    clase: b.className,
                    contexto: contexto(b)
                };
            });

        return { url: location.href, totalBotones: botones.length, botones };
    });

    // "+" = botones de ícono / acción (los que nos interesan para retenciones).
    const masMas = data.botones.filter(b => b.esAccionField || (b.icono && b.caption === '(sin texto)'));

    const resumen = [
        `--- paso_15 botones de acción / "+" ---`,
        `URL: ${data.url}`,
        `Botones visibles: ${data.totalBotones} | de acción/"+": ${masMas.length}`,
        ...masMas.map(b => `  + [${b.i}] icono=${b.icono || '-'} accionField=${b.esAccionField} | contexto(${b.contexto.tipo}): "${b.contexto.texto}"`),
        '',
        `(Todos los botones, por las dudas):`,
        ...data.botones.map(b => `  [${b.i}] "${b.caption}" icono=${b.icono || '-'} | ctx: "${b.contexto.texto}"`)
    ].join('\n');

    console.log('[DDJJ paso_15]\n' + resumen);
    return { ...data, masMas, resumen };
}

module.exports = { ejecutar };
