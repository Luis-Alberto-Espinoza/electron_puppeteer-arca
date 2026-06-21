// paso_11_cargarBase.js
// Tras "Detallar" (paso_9), la carga de alícuotas aparece INLINE en la misma página
// (NO es un popup .v-window): hay varias filas con un input "Base Imponible" editable
// y un "Impuesto Calculado" disabled que el portal recalcula SOLO (round-trip Vaadin).
//
// Este paso: ubica la fila cuya alícuota matchea la objetivo, tipea la BASE (teclado
// real, como paso_6), ESPERA a que el portal recalcule el impuesto, y lo lee.
//
// Datos (alicuotaObjetivo + base): PLACEHOLDERS hardcodeados en _datosManuales.js
// (bandera DatoAModificarPorExcel). Mañana vienen del frontend.
//
// Filas de alícuotas Mendoza: 1,75 Malargüe · 3,50 Normal · 1,25 Malargüe reducida ·
// 2,50 Reducida. (Caso prueba Debora: base 21.696.298,30 × 2,50% = 542.407,46.)

// Atributos temporales para "marcar" los inputs y agarrarlos desde Puppeteer.
const ATTR_BASE = 'data-ddjj-base-target';
const ATTR_IMP = 'data-ddjj-impuesto-target';

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} datosManuales { alicuotaObjetivo:number, base:string }
 */
async function ejecutar(page, datosManuales) {
    const { alicuotaObjetivo, base } = datosManuales || {};
    if (alicuotaObjetivo == null) throw new Error('Falta alicuotaObjetivo en datosManuales');
    if (base == null || base === '') throw new Error('Falta base en datosManuales');

    console.log(`[DDJJ paso_11] Cargar base ${base} en la fila de alícuota ${alicuotaObjetivo}...`);

    // OJO: AFIP exige la Base Imponible aunque sea 0 ("La Base Imponible es obligatoria")
    // → SIEMPRE la tipeamos. Solo nos salteamos la ESPERA del recálculo si la base es 0
    //   (base 0 → impuesto 0, no hay nada que esperar; evita el timeout de 15s).
    const baseNum = Number(String(base).replace(/\./g, '').replace(',', '.'));

    // 1. Ubicar la fila por alícuota y MARCAR sus inputs (base editable + impuesto disabled).
    //    Una "fila de alícuota" = fila que tiene un input num EDITABLE + un texto 0..100.
    //    Eso descarta la grilla de actividades (sus celdas no tienen inputs num).
    const loc = await page.evaluate((alicObj, aBase, aImp) => {
        const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
        // "2,50" → 2.5 ; "1.234,50" → 1234.5 (argentino: punto=miles, coma=decimal)
        const parseAr = (t) => {
            const s = String(t == null ? '' : t).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
            const n = parseFloat(s);
            return isNaN(n) ? null : n;
        };
        // Limpiar marcas de corridas anteriores.
        document.querySelectorAll('[' + aBase + '],[' + aImp + ']').forEach(e => {
            e.removeAttribute(aBase); e.removeAttribute(aImp);
        });

        // Subir desde el input hasta su "fila" (v-table-row / tr / o 4 niveles arriba).
        const filaDe = (el) => {
            const f = el.closest('.v-table-row, .v-table-row-odd, tr');
            if (f) return f;
            let n = el;
            for (let i = 0; i < 4 && n.parentElement; i++) n = n.parentElement;
            return n;
        };

        // Candidatos: inputs num EDITABLES y visibles (bases de alícuota + algún campo suelto).
        const bases = Array.from(document.querySelectorAll('input.inputNumberCustomField'))
            .filter(i => !i.disabled && !i.readOnly && i.offsetParent !== null);

        const diag = [];
        let elegido = null;
        for (const inp of bases) {
            const fila = filaDe(inp);
            // Texto de la fila SIN los inputs (deja las celdas de texto: alícuota, tipo, ...).
            const clon = fila.cloneNode(true);
            clon.querySelectorAll('input').forEach(n => n.remove());
            const textoFila = txt(clon);
            // Alícuota = primer token de la fila que parsea a un número 0..100.
            let alic = null;
            for (const tok of textoFila.split(/\s+/)) {
                const n = parseAr(tok);
                if (n != null && n >= 0 && n <= 100) { alic = n; break; }
            }
            diag.push({ alic, textoFila: textoFila.slice(0, 90) });

            if (elegido == null && alic != null && Math.abs(alic - alicObj) < 0.001) {
                inp.setAttribute(aBase, '1');
                // Impuesto calculado = input num disabled/readonly en la misma fila.
                const imp = Array.from(fila.querySelectorAll('input.inputNumberCustomField'))
                    .find(i => i.disabled || i.readOnly);
                if (imp) imp.setAttribute(aImp, '1');
                elegido = { alic, textoFila: textoFila.slice(0, 90), tieneImpuesto: !!imp };
            }
        }
        return { ok: !!elegido, elegido, diag };
    }, Number(alicuotaObjetivo), ATTR_BASE, ATTR_IMP);

    // Diagnóstico SIEMPRE: ver qué filas de base detectó y con qué alícuota.
    console.log('[DDJJ paso_11] Filas con base editable detectadas:');
    loc.diag.forEach((d, i) => console.log(`   #${i} alícuota=${d.alic} | "${d.textoFila}"`));

    if (!loc.ok) {
        const msg = `[DDJJ paso_11] No se encontró fila con alícuota ${alicuotaObjetivo}. ` +
            `Alícuotas detectadas: ${loc.diag.map(d => d.alic).join(' · ') || '(ninguna)'}`;
        console.warn(msg);
        return { success: false, motivo: 'sin match de alícuota', diag: loc.diag, resumen: msg };
    }
    if (!loc.elegido.tieneImpuesto) {
        console.warn('[DDJJ paso_11] ⚠️ La fila no tiene input de impuesto disabled en la misma fila; no podré verificar el cálculo.');
    }

    // 2. Tipear la base con teclado real en el input marcado.
    const inputBase = await page.$('[' + ATTR_BASE + ']');
    if (!inputBase) throw new Error('No se pudo agarrar el input de base marcado');
    try { await inputBase.scrollIntoView(); } catch (_) {}
    await inputBase.click({ clickCount: 3 });   // seleccionar lo que haya
    await inputBase.press('Backspace');          // limpiar
    await inputBase.type(String(base), { delay: 60 });
    await inputBase.press('Tab');                // blur → dispara el recálculo en el server (Vaadin)

    // 3. ESPERAR el recálculo: el impuesto (disabled) deja de estar vacío.
    //    Vaadin recalcula en el servidor (XHR async); por eso hay que esperar, no leer ya.
    let recalculo = true;
    if (loc.elegido.tieneImpuesto && baseNum > 0) {
        try {
            await page.waitForFunction((aImp) => {
                const imp = document.querySelector('[' + aImp + ']');
                return imp && imp.value && imp.value.trim() !== '';
            }, { timeout: 15000 }, ATTR_IMP);
        } catch (_) {
            recalculo = false;
            console.warn('[DDJJ paso_11] ⚠️ El impuesto no se completó en 15s. ¿Recalcula recién al Grabar, o no tomó la base?');
        }
    } else if (baseNum === 0) {
        console.log('[DDJJ paso_11] Base 0 cargada (obligatoria); no espero impuesto (0 no recalcula).');
    }

    // 3b. MÍNIMOS: algunas actividades (ej. taxi "POR VEHICULO") tienen abajo una tabla
    //     "Mínimos" con una CANTIDAD obligatoria (input maxlength=5, vs base que es 16).
    //     Default 1 (el usuario: "1 como mínimo"). Solo si el input existe y está vacío.
    const cantidad = String((datosManuales && datosManuales.cantidad) || '1');
    const ATTR_CANT = 'data-ddjj-cant-target';
    const tieneCantidad = await page.evaluate((attr) => {
        document.querySelectorAll('[' + attr + ']').forEach(e => e.removeAttribute(attr));
        const inp = Array.from(document.querySelectorAll('input.inputNumberCustomField'))
            .find(i => !i.disabled && !i.readOnly && i.offsetParent !== null
                && i.maxLength > 0 && i.maxLength <= 6
                && (!i.value || i.value.trim() === '' || i.value.trim() === '0'));
        if (!inp) return false;
        inp.setAttribute(attr, '1');
        return true;
    }, ATTR_CANT);
    if (tieneCantidad) {
        const inpCant = await page.$('[' + ATTR_CANT + ']');
        try { await inpCant.scrollIntoView(); } catch (_) {}
        await inpCant.click({ clickCount: 3 });
        await inpCant.press('Backspace');
        await inpCant.type(cantidad, { delay: 60 });
        await inpCant.press('Tab');
        await page.evaluate((attr) => { const e = document.querySelector('[' + attr + ']'); if (e) e.removeAttribute(attr); }, ATTR_CANT);
        console.log(`[DDJJ paso_11] Mínimos: Cantidad → ${cantidad}`);
    }

    // 4. Leer el "Impuesto Calculado" + limpiar marcas.
    const res = await page.evaluate((aBase, aImp) => {
        const baseInp = document.querySelector('[' + aBase + ']');
        const impInp = document.querySelector('[' + aImp + ']');
        const r = { baseTipeada: baseInp ? baseInp.value : null, impuestoCalculado: impInp ? impInp.value : null };
        if (baseInp) baseInp.removeAttribute(aBase);
        if (impInp) impInp.removeAttribute(aImp);
        return r;
    }, ATTR_BASE, ATTR_IMP);

    const resumen = [
        `--- paso_11 cargar base ---`,
        `Fila alícuota: ${loc.elegido.alic} ("${loc.elegido.textoFila}")`,
        `Base tipeada: "${res.baseTipeada}"`,
        `Impuesto calculado por el portal: "${res.impuestoCalculado || '(vacío)'}"${recalculo ? '' : ' ⚠️ (no recalculó)'}`
    ].join('\n');
    console.log('[DDJJ paso_11]\n' + resumen);

    return {
        success: true,
        alicuota: loc.elegido.alic,
        baseTipeada: res.baseTipeada,
        impuestoCalculado: res.impuestoCalculado,
        recalculo,
        resumen
    };
}

module.exports = { ejecutar };
