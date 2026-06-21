// paso_16_explorarMas.js
// Paso EXPLORATORIO: abre uno de los "+" detectados por paso_15 y vuelca lo que aparece
// (acá vive la carga de RETENCIONES: campos manuales y/o el botón de importar .txt).
// Objetivo: recopilar el mecanismo para el mise en place (Plan B). NO carga nada.
//
// Elige el "+" cuyo contexto mencione retenc/percep/recaud; si no, el primero de la lista.
// NO vuelve: deja abierto el detalle para que paso_16b explore "IMPORTAR".

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} botonesInfo  resultado de paso_15 ({ masMas: [...] })
 */
async function ejecutar(page, botonesInfo) {
    const masMas = (botonesInfo && botonesInfo.masMas) || [];
    if (!masMas.length) {
        console.log('[DDJJ paso_16] No hay "+" para explorar (paso_15 no detectó ninguno).');
        return { success: true, sinBotones: true, resumen: 'paso_16: no había "+" para explorar' };
    }

    const objetivo = masMas.find(b => /retenc|percep|recaud|deducc/i.test(b.contexto && b.contexto.texto || ''))
        || masMas[0];
    console.log(`[DDJJ paso_16] Abriendo "+" [${objetivo.i}] contexto: "${objetivo.contexto && objetivo.contexto.texto}"...`);

    const inputsAntes = await page.evaluate(() => document.querySelectorAll('input').length);

    // Re-localizar el botón por su índice entre los visibles (misma query que paso_15) y marcarlo.
    const marcado = await page.evaluate((idx) => {
        const visible = (el) => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
        };
        const btns = Array.from(document.querySelectorAll('.v-button, [role="button"]')).filter(visible);
        const b = btns[idx];
        if (!b) return false;
        document.querySelectorAll('[data-ddjj-mas-target]').forEach(e => e.removeAttribute('data-ddjj-mas-target'));
        b.setAttribute('data-ddjj-mas-target', '1');
        return true;
    }, objetivo.i);

    if (!marcado) {
        const msg = `[DDJJ paso_16] No pude re-localizar el "+" índice ${objetivo.i}.`;
        console.warn(msg);
        return { success: false, motivo: 're-localización falló', resumen: msg };
    }

    const el = await page.$('[data-ddjj-mas-target]');
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();
    await page.evaluate(() => { const e = document.querySelector('[data-ddjj-mas-target]'); if (e) e.removeAttribute('data-ddjj-mas-target'); });

    // Esperar a que algo cambie (la sub-vista de retención aparece).
    try {
        await page.waitForFunction((prev) => document.querySelectorAll('input').length !== prev,
            { timeout: 15000 }, inputsAntes);
        console.log('[DDJJ paso_16] Cambió la vista tras abrir el "+".');
    } catch (_) {
        console.warn('[DDJJ paso_16] No se detectó cambio tras abrir el "+".');
    }

    // Volcar la sub-vista: captions, botones (con ícono), inputs, campos, y archivos (file inputs).
    const data = await page.evaluate(() => {
        const txt = (el) => (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
        const vis = (el) => el.offsetParent !== null;
        const captions = Array.from(document.querySelectorAll('.v-captiontext')).map(txt).filter(Boolean);
        const botones = Array.from(document.querySelectorAll('.v-button')).filter(vis).map(b => {
            const img = b.querySelector('img');
            return { caption: txt(b.querySelector('.v-button-caption')) || '(sin texto)', icono: img ? (img.getAttribute('src') || '').split('/').pop() : null };
        });
        const inputs = Array.from(document.querySelectorAll('input')).filter(vis)
            .map(i => ({ tipo: i.type || 'text', clase: i.className, maxlength: i.maxLength, value: i.value }));
        const campos = Array.from(document.querySelectorAll('.GridFieldWrapper')).filter(vis)
            .map(w => {
                const lbl = txt(w.querySelector('.dynaFormGrid-propertyTitle'));
                const inp = w.querySelector('input');
                return { label: lbl, tiene: inp ? (inp.type || 'text') : 'label' };
            }).filter(c => c.label);
        // Pistas de "importar archivo": file inputs o Vaadin Upload.
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).length;
        const uploads = Array.from(document.querySelectorAll('.v-upload, .gwt-FileUpload')).length;
        return { url: location.href, captions, botones, totalInputs: inputs.length, inputs: inputs.slice(0, 60), campos, fileInputs, uploads };
    });

    const resumen = [
        `--- paso_16 abrir "+" (${objetivo.contexto && objetivo.contexto.texto}) ---`,
        `URL: ${data.url}`,
        `Captions: ${data.captions.join(' · ')}`,
        `Botones: ${data.botones.map(b => b.caption + (b.icono ? `(${b.icono})` : '')).join(' · ')}`,
        `Pistas de importar: file inputs=${data.fileInputs} · Vaadin uploads=${data.uploads}`,
        `Inputs visibles (${data.totalInputs}):`,
        ...data.inputs.map((i, n) => `  [${n}] tipo=${i.tipo} maxlen=${i.maxlength} clase="${i.clase}" value="${i.value}"`),
        `CAMPOS etiquetados (${data.campos.length}):`,
        ...data.campos.map(c => `  ${c.label} (${c.tiene})`)
    ].join('\n');

    console.log('[DDJJ paso_16]\n' + resumen);
    return { ...data, success: true, objetivo, resumen };
}

module.exports = { ejecutar };
