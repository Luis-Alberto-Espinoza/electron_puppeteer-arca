// paso_9_clickDetallar.js
// Abre la carga inline de alícuotas clickeando el "+" (detallar) de UNA actividad de la
// grilla de Determinación.
//
//  - Con `codigo` (Actividad id del Excel): JOIN 1 → abre el "+" de la fila cuyo código
//    coincide (el orden Excel ≠ AFIP, por eso matcheamos por código, no por posición).
//  - Sin `codigo`: itera los "+" hasta que uno abra (compat con el hardcode de prueba).
//
// Algunos "+" están visibles pero MUERTOS (AFIP no los habilita) → esperamos Vaadin idle
// + reintentamos. Siempre logueamos la grilla (códigos) como diagnóstico.

const nav = require('./_navegacion.js');

/**
 * @param {import('puppeteer').Page} page
 * @param {string|null} codigo  Actividad id a abrir (null → primer "+" que funcione)
 * @returns {Promise<{abierto:boolean, codigo?:string, idx?:number, grid:Array}>}
 */
async function ejecutar(page, codigo = null) {
    const inputsAntes = await page.evaluate(() => document.querySelectorAll('input').length);

    // Diagnóstico: códigos de la grilla (orden real + si la fila tiene "+").
    const grid = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.v-table-row, .v-table-row-odd')).map((row, i) => {
            const cells = Array.from(row.querySelectorAll('.v-table-cell-content')).map(c => (c.textContent || '').trim());
            const tieneDetallar = !!Array.from(row.querySelectorAll('.v-button')).find(b => b.querySelector('img[src*="detallar"]'));
            return { i, codigo: cells[0] || '', tieneDetallar };
        });
    });
    console.log('[DDJJ paso_9] Grilla de actividades:');
    grid.forEach(g => console.log(`   fila ${g.i}: código=${g.codigo || '(?)'} ${g.tieneDetallar ? '(+)' : ''}`));

    // Click con espera idle + reintento (el "+" muerto/lento no abre al toque).
    const clickYEsperar = async (getEl) => {
        let abierto = false;
        for (let intento = 1; intento <= 3 && !abierto; intento++) {
            await nav.esperarVaadinIdle(page);
            const el = await getEl();
            if (!el) return false;
            try { await el.scrollIntoView(); } catch (_) {}
            await el.click();
            // El detalle abre rápido (cambia el conteo de inputs en ~1-2s). 3s es ceiling
            // generoso; si no abrió, reintento corto (500ms) — antes eran 7s+1,2s = demora enorme.
            abierto = await page.waitForFunction((p) => document.querySelectorAll('input').length !== p,
                { timeout: 3000 }, inputsAntes).then(() => true).catch(() => false);
            if (!abierto) await new Promise(r => setTimeout(r, 500));
        }
        return abierto;
    };

    // --- CON código: abrir el "+" de esa fila (Join 1) ---
    if (codigo != null && String(codigo).trim()) {
        const cod = String(codigo).trim();
        const objetivo = grid.find(g => g.codigo === cod);
        if (!objetivo) {
            console.warn(`[DDJJ paso_9] El código ${cod} no está en la grilla.`);
            return { abierto: false, codigo: cod, motivo: 'código no en grilla', grid };
        }
        const idx = objetivo.i;
        const abierto = await clickYEsperar(async () => {
            const h = await page.evaluateHandle((i) => {
                const rows = Array.from(document.querySelectorAll('.v-table-row, .v-table-row-odd'));
                const row = rows[i];
                let btn = row && Array.from(row.querySelectorAll('.v-button')).find(b => b.querySelector('img[src*="detallar"]'));
                if (!btn) {  // fallback: "+" global en el mismo índice (si no está dentro de la fila)
                    const all = Array.from(document.querySelectorAll('.v-button'))
                        .filter(b => b.offsetParent !== null && b.querySelector('img[src*="detallar"]'));
                    btn = all[i];
                }
                return btn || null;
            }, idx);
            return h.asElement();
        });
        console.log(abierto
            ? `[DDJJ paso_9] Detalle abierto para código ${cod} (fila ${idx}).`
            : `[DDJJ paso_9] ⚠️ No abrió el detalle del código ${cod} (fila ${idx}; ¿"+" muerto?).`);
        return { abierto, codigo: cod, idx, grid };
    }

    // --- SIN código: iterar los "+" hasta que uno abra ---
    const total = await page.evaluate(() => Array.from(document.querySelectorAll('.v-button'))
        .filter(b => b.offsetParent !== null && b.querySelector('img[src*="detallar"]')).length);
    if (!total) throw new Error('No se encontró ningún botón "detallar"');

    let abierto = false, usado = -1;
    for (let i = 0; i < total && !abierto; i++) {
        const ok = await clickYEsperar(async () => {
            const h = await page.evaluateHandle((idx) => {
                const btns = Array.from(document.querySelectorAll('.v-button'))
                    .filter(b => b.offsetParent !== null && b.querySelector('img[src*="detallar"]'));
                return btns[idx] || null;
            }, i);
            return h.asElement();
        });
        if (ok) { abierto = true; usado = i; }
        else console.warn(`[DDJJ paso_9] El "+" #${i} no abrió (¿muerto?), pruebo el siguiente...`);
    }
    console.log(abierto
        ? `[DDJJ paso_9] Detalle abierto con el "+" #${usado} (de ${total}).`
        : `[DDJJ paso_9] ⚠️ Ningún "+" abrió el detalle (probé ${total}).`);
    return { abierto, usado, total, grid };
}

module.exports = { ejecutar };
