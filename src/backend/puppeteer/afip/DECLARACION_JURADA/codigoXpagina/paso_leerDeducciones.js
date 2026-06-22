// paso_leerDeducciones.js
// En la solapa "Liquidación", LEE (read-only) los importes que AFIP ya calculó para cada
// fila de deducciones (Retenciones Sufridas, Percepciones, SIRCREB/SIRCUPA, …) + el
// "Total de Deducciones". Es la fuente de verdad: AFIP suma los .txt con sus reglas.
//
// Corre DESPUÉS de paso_18 (retenciones importadas) y de paso_completarLiquidacion, mientras
// seguimos parados en Liquidación (antes de paso_17 "Siguiente").
//
// Técnica: misma alineación vertical que paso_completarLiquidacion, pero al revés (leemos el
// input numérico readonly alineado con cada etiqueta, no escribimos). 100% lectura → sin riesgo.

// Etiquetas EXACTAS de la tabla de deducciones de la Liquidación (F.5111).
const ETIQUETAS_DEDUCCIONES = [
    'Retenciones Sufridas',
    'Percepciones Aduaneras',
    'Percepciones',
    'Pagos a Cuenta',
    'Recaudaciones SIRCREB/SIRCUPA',
    'Otros Débitos',
    'Otros Créditos',
    'Total de Deducciones'
];

/** "143231.07" / "143.231,07" / "$ 1.256,00" → 1256.0 (número). Vacío/"-" → 0. */
function parseImporte(raw) {
    let s = String(raw == null ? '' : raw).replace(/[^\d.,-]/g, '').trim();
    if (!s || s === '-') return 0;
    const tieneComa = s.includes(','), tienePunto = s.includes('.');
    if (tieneComa && tienePunto) {
        // El último separador es el decimal; el otro es de miles.
        s = s.lastIndexOf(',') > s.lastIndexOf('.')
            ? s.replace(/\./g, '').replace(',', '.')   // formato AR: 1.256,00
            : s.replace(/,/g, '');                      // formato US: 1,256.00
    } else if (tieneComa) {
        s = s.replace(',', '.');                        // solo coma → decimal
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}

async function ejecutar(page, etiquetas = ETIQUETAS_DEDUCCIONES) {
    const crudos = await page.evaluate((labels) => {
        const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        // Todos los inputs numéricos visibles (incluye readonly: los importes lo son).
        const inputs = Array.from(document.querySelectorAll('input.inputNumberCustomField'))
            .filter(i => i.offsetParent !== null)
            .map(i => {
                const b = i.getBoundingClientRect();
                return { value: i.value, centro: (b.top + b.bottom) / 2 };
            });
        const out = {};
        for (const lbl of labels) {
            // Celda hoja visible cuyo texto sea EXACTAMENTE la etiqueta (distingue
            // "Percepciones" de "Percepciones Aduaneras").
            const celda = Array.from(document.querySelectorAll('div, td, span'))
                .find(e => e.children.length === 0 && e.offsetParent !== null && norm(e.textContent) === norm(lbl));
            if (!celda) { out[lbl] = null; continue; }   // null = etiqueta no encontrada
            const r = celda.getBoundingClientRect();
            const centroLbl = (r.top + r.bottom) / 2;
            let best = null, bestD = Infinity;
            for (const i of inputs) {
                const d = Math.abs(i.centro - centroLbl);
                if (d < bestD) { bestD = d; best = i; }
            }
            out[lbl] = (best && bestD <= 18) ? best.value : null;
        }
        return out;
    }, etiquetas);

    const deducciones = {};
    const lineas = ['--- Deducciones calculadas por AFIP (Liquidación) ---'];
    for (const lbl of etiquetas) {
        const raw = crudos[lbl];
        if (raw == null) { lineas.push(`  ${lbl}: — (no leído)`); continue; }
        const valor = parseImporte(raw);
        deducciones[lbl] = valor;
        lineas.push(`  ${lbl}: ${valor} (AFIP: "${raw}")`);
    }
    const resumen = lineas.join('\n');
    console.log('[DDJJ leerDeducciones]\n' + resumen);

    return { success: true, deducciones, resumen };
}

module.exports = { ejecutar, ETIQUETAS_DEDUCCIONES, parseImporte };
