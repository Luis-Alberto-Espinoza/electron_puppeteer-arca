// paso_completarLiquidacion.js
// En la solapa "Liquidación" completa los dos campos editables que NO salen del Detallar
// ni de las retenciones:
//   - "Fecha de Pago": v-datefield (DD/MM/AAAA). Viene del FRONTEND (calendario), requerida.
//     Es un GridFieldWrapper con propertyTitle "Fecha de Pago" → mismo patrón que paso_13.
//   - "Saldo a Favor del Período Anterior": input numérico de la tabla de deducciones
//     (v-table, NO es GridFieldWrapper). Viene del EXCEL (safAnterior). El Excel lo guarda
//     NEGATIVO (negativo = a favor); AFIP pide el monto a favor en POSITIVO → Math.abs.
//
// Defensivo (es plata): ANTES de escribir loguea el valor que AFIP ya trae en cada campo,
// para verificar en vivo (a) si AFIP precarga el saldo y (b) el signo correcto.
//
// El saldo está en una v-table de Vaadin, donde la columna de descripción y la de inputs
// se renderizan por separado → no sirve "subir al .v-table-row". Lo ubicamos por ALINEACIÓN
// VERTICAL: el input numérico visible cuyo centro está a la misma altura que la etiqueta.

const ATTR = 'data-ddjj-liq-target';

/** Escribe en el input de un GridFieldWrapper localizado por su etiqueta. */
async function escribirCampoGrid(page, etiqueta, valor) {
    const loc = await page.evaluate((lbl, attr) => {
        const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        document.querySelectorAll('[' + attr + ']').forEach(e => e.removeAttribute(attr));
        const w = Array.from(document.querySelectorAll('.GridFieldWrapper')).find(w => {
            const t = w.querySelector('.dynaFormGrid-propertyTitle');
            return t && norm(t.textContent) === norm(lbl);
        });
        if (!w) return { found: false };
        const inp = w.querySelector('input');
        if (!inp || inp.disabled || inp.readOnly) return { found: false, dis: true };
        inp.setAttribute(attr, '1');
        return { found: true, previo: inp.value };
    }, etiqueta, ATTR);
    return tipear(page, etiqueta, valor, loc);
}

/** Escribe en el input numérico alineado verticalmente con la etiqueta (filas de v-table). */
async function escribirEnFilaTabla(page, etiqueta, valor) {
    const loc = await page.evaluate((lbl, attr) => {
        const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        document.querySelectorAll('[' + attr + ']').forEach(e => e.removeAttribute(attr));
        // Nodo hoja visible cuyo texto sea exactamente la etiqueta (celda de descripción).
        const celda = Array.from(document.querySelectorAll('div, td, span'))
            .find(e => e.children.length === 0 && e.offsetParent !== null && norm(e.textContent) === norm(lbl));
        if (!celda) return { found: false };
        const ry = celda.getBoundingClientRect();
        const centroLbl = (ry.top + ry.bottom) / 2;
        // Input numérico/texto editable más cercano EN ALTURA a la etiqueta.
        const inputs = Array.from(document.querySelectorAll('input.inputNumberCustomField, input.v-textfield'))
            .filter(i => i.offsetParent !== null && !i.disabled && !i.readOnly);
        let best = null, bestD = Infinity;
        for (const i of inputs) {
            const b = i.getBoundingClientRect();
            const d = Math.abs((b.top + b.bottom) / 2 - centroLbl);
            if (d < bestD) { bestD = d; best = i; }
        }
        if (!best || bestD > 18) return { found: true, sinInput: true, bestD };
        best.setAttribute(attr, '1');
        return { found: true, previo: best.value, bestD };
    }, etiqueta, ATTR);
    return tipear(page, etiqueta, valor, loc);
}

/** Tipeo común: valida la localización, loguea el valor previo de AFIP y escribe con teclado real. */
async function tipear(page, etiqueta, valor, loc) {
    if (!loc.found) {
        console.warn(`[DDJJ pasoLiq] ⚠️ No encontré "${etiqueta}"${loc.dis ? ' (disabled)' : ''}.`);
        return { ok: false, etiqueta };
    }
    if (loc.sinInput) {
        console.warn(`[DDJJ pasoLiq] ⚠️ "${etiqueta}": no hallé input alineado (dist=${loc.bestD}).`);
        return { ok: false, etiqueta };
    }
    console.log(`[DDJJ pasoLiq] "${etiqueta}" — AFIP traía "${loc.previo}", escribo "${valor}".`);

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
    return { ok: true, etiqueta, previo: loc.previo, valor: val };
}

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} datos { fechaPago: 'DD/MM/AAAA', saldoAFavorAnterior: number (negativo=a favor) }
 */
async function ejecutar(page, datos) {
    const { fechaPago, saldoAFavorAnterior } = datos || {};
    let resFecha = null, resSaldo = null;

    // ORDEN pedido: PRIMERO el saldo anterior (y el resto), la fecha de pago AL FINAL
    // (así el último foco/recálculo queda en la fecha justo antes del "Siguiente").
    const saldo = Number(saldoAFavorAnterior || 0);
    if (saldo) {
        // Excel negativo (a favor) → AFIP positivo. Se loguea el crudo para verificar el signo.
        const valor = Math.abs(saldo).toFixed(2).replace('.', ',');
        console.log(`[DDJJ pasoLiq] Saldo a favor anterior del Excel = ${saldo} → escribo (abs) "${valor}".`);
        resSaldo = await escribirEnFilaTabla(page, 'Saldo a Favor del Período Anterior', valor);
    } else {
        console.log('[DDJJ pasoLiq] Saldo a favor anterior = 0 → no se escribe.');
    }

    if (fechaPago) {
        resFecha = await escribirCampoGrid(page, 'Fecha de Pago', fechaPago);
    } else {
        console.log('[DDJJ pasoLiq] Sin fecha de pago → no se escribe.');
    }

    // Vaadin recalcula tras escribir; no lo esperamos acá (sería sumar demora). El "Siguiente"
    // del paso_17 ya reintenta rápido si el primer click cae con Vaadin ocupado.

    const linea = (r, vacio) => r ? (r.ok ? `✅ "${r.valor}" (AFIP traía "${r.previo}")` : `❌ ${r.etiqueta}`) : vacio;
    const resumen = [
        '--- Liquidación: fecha de pago + saldo anterior ---',
        `Fecha de Pago: ${linea(resFecha, '— (no enviada)')}`,
        `Saldo a Favor del Período Anterior: ${linea(resSaldo, '0 → no se escribe')}`
    ].join('\n');
    console.log('[DDJJ pasoLiq]\n' + resumen);

    return { success: true, fecha: resFecha, saldo: resSaldo, resumen };
}

module.exports = { ejecutar };
