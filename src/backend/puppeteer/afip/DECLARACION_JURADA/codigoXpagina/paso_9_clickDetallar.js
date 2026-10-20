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
            // El click de Puppeteer calcula coordenadas en pantalla; en Windows (portable) a veces
            // no ubica el "+" ("Node is either not clickable...") y voltea todo el flujo.
            // Fallback: click desde el DOM (no depende de coordenadas) y sigue el reintento.
            let metodo = 'puppeteer';
            try {
                await el.click();
            } catch (e) {
                metodo = 'DOM';
                console.warn(`[DDJJ paso_9] intento ${intento}: click de Puppeteer falló (${e.message}) → click por DOM.`);
                // Diagnóstico: tamaño/posición del "+" vs ventana y escala de pantalla
                // (sospecha: escalado de Windows 125%/150% descoloca las coordenadas).
                try {
                    const d = await el.evaluate(b => {
                        const r = b.getBoundingClientRect();
                        return {
                            rect: `x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} h=${Math.round(r.height)}`,
                            ventana: `${window.innerWidth}x${window.innerHeight}`,
                            dpr: window.devicePixelRatio,
                            visible: b.offsetParent !== null,
                            clases: b.className
                        };
                    });
                    console.warn(`[DDJJ paso_9]    "+": ${d.rect} | ventana ${d.ventana} | devicePixelRatio ${d.dpr} | visible=${d.visible} | class="${d.clases}"`);
                } catch (eDiag) {
                    console.warn(`[DDJJ paso_9]    (no pude leer el diagnóstico del "+": ${eDiag.message})`);
                }
                try { await el.evaluate(b => b.click()); }
                catch (eDom) { console.error(`[DDJJ paso_9] intento ${intento}: click por DOM TAMBIÉN falló (${eDom.message}).`); }
            }
            // El detalle abre rápido (cambia el conteo de inputs en ~1-2s). 3s es ceiling
            // generoso; si no abrió, reintento corto (500ms) — antes eran 7s+1,2s = demora enorme.
            abierto = await page.waitForFunction((p) => document.querySelectorAll('input').length !== p,
                { timeout: 3000 }, inputsAntes).then(() => true).catch(() => false);
            console.log(`[DDJJ paso_9] intento ${intento} (click ${metodo}): ${abierto ? 'abrió el detalle' : 'NO abrió en 3s'}`);
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
