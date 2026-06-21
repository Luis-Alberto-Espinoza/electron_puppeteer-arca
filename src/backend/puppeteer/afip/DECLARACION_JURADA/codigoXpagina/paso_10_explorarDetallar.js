// paso_10_explorarDetallar.js
// Paso de EXPLORACIÓN: vuelca el form que abrió "detallar" para saber qué campos
// pide (acá van los números del Excel: base, alícuota, etc.). No interactúa.

/**
 * @param {import('puppeteer').Page} page
 */
async function ejecutar(page) {
    console.log('[DDJJ paso_10] Explorando form de "detallar"...');

    const data = await page.evaluate(() => {
        const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();

        const captions = Array.from(document.querySelectorAll('.v-captiontext')).map(txt).filter(Boolean);
        const botones = Array.from(document.querySelectorAll('.v-button-caption')).map(txt).filter(Boolean);

        // Inputs de texto visibles, con su clase (las clases eForm* suelen identificar el campo).
        const inputs = Array.from(document.querySelectorAll('input'))
            .filter(i => i.offsetParent !== null)
            .map(i => ({ tipo: i.type || 'text', clase: i.className, maxlength: i.maxLength, value: i.value }));

        // Combos visibles dentro del detalle.
        const combos = Array.from(document.querySelectorAll('.v-filterselect'))
            .filter(c => c.offsetParent !== null).length;

        // Capturar la GRILLA de actividades (headers + filas). Vaadin classic Table
        // (.v-table) o, como fallback, una <table> HTML con inputs numéricos.
        const celda = (td) => {
            const inp = td.querySelector('input');
            if (inp) {
                const num = inp.className.includes('inputNumberCustomField');
                const flags = (inp.disabled ? '·dis' : '') + (inp.readOnly ? '·ro' : '');
                return `[${num ? 'num' : (inp.type || 'text')}${flags}="${inp.value}"]`;
            }
            return txt(td);
        };
        let grilla = null;
        const vtable = document.querySelector('.v-table');
        if (vtable) {
            // Los headers Vaadin pueden estar en distintos nodos según versión.
            let headers = Array.from(vtable.querySelectorAll('.v-table-header-cell .v-table-caption-container')).map(txt).filter(Boolean);
            if (headers.length === 0) headers = Array.from(vtable.querySelectorAll('.v-table-header-cell')).map(txt).filter(Boolean);
            if (headers.length === 0) headers = Array.from(vtable.querySelectorAll('th')).map(txt).filter(Boolean);
            const rows = Array.from(vtable.querySelectorAll('.v-table-row, .v-table-row-odd')).slice(0, 12)
                .map(tr => Array.from(tr.querySelectorAll('.v-table-cell-content')).map(celda));
            grilla = { tipo: 'v-table', headers, rows };
        } else {
            const t = Array.from(document.querySelectorAll('table')).find(tb => tb.querySelector('.inputNumberCustomField'));
            if (t) {
                const headers = Array.from(t.querySelectorAll('th')).map(txt);
                const rows = Array.from(t.querySelectorAll('tbody tr')).slice(0, 12)
                    .map(tr => Array.from(tr.children).map(celda));
                grilla = { tipo: 'html-table', headers, rows };
            }
        }

        // Campos ETIQUETADOS: cada GridFieldWrapper tiene un título y un input/label.
        // Esto revela "Base Imponible → [input]" cuando se abre el sub-form del Detallar.
        const campos = Array.from(document.querySelectorAll('.GridFieldWrapper'))
            .filter(w => w.offsetParent !== null)
            .map(w => {
                const lbl = txt(w.querySelector('.dynaFormGrid-propertyTitle'));
                const inp = w.querySelector('input');
                let valor;
                if (inp) {
                    const num = inp.className.includes('inputNumberCustomField');
                    valor = `[${num ? 'num' : (inp.type || 'text')}${inp.disabled ? '·dis' : ''}="${inp.value}"]`;
                } else {
                    valor = txt(w.querySelector('.labelNumberCustomField .v-label, .v-customcomponent .v-label'));
                }
                return { label: lbl, valor };
            })
            .filter(c => c.label);

        return { url: location.href, captions, botones, combosVisibles: combos, totalInputs: inputs.length, inputs: inputs.slice(0, 50), grilla, campos };
    });

    const resumen = [
        `--- Form "detallar" ---`,
        `Captions: ${data.captions.join(' · ')}`,
        `Botones: ${data.botones.join(' · ')}`,
        `Combos visibles: ${data.combosVisibles}`,
        `Inputs visibles (${data.totalInputs}):`,
        ...data.inputs.map((i, n) => `  [${n}] tipo=${i.tipo} maxlen=${i.maxlength} clase="${i.clase}" value="${i.value}"`),
        '',
        data.grilla
            ? [`GRILLA (${data.grilla.tipo}):`,
               `  Headers: ${data.grilla.headers.join(' | ')}`,
               ...data.grilla.rows.map((r, n) => `  Fila ${n}: ${r.join(' | ')}`)].join('\n')
            : 'GRILLA: no se detectó tabla con inputs numéricos.',
        '',
        `CAMPOS etiquetados (${(data.campos || []).length}):`,
        ...(data.campos || []).map(c => `  ${c.label} → ${c.valor || '(vacío)'}`)
    ].join('\n');

    console.log('[DDJJ paso_10]\n' + resumen);
    return { ...data, resumen };
}

module.exports = { ejecutar };
