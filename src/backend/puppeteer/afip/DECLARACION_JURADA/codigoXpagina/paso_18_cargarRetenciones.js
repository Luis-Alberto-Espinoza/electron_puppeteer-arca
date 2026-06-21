// paso_18_cargarRetenciones.js
// LOOP de Plan B (página Liquidación): por cada retención con .txt asignado en
// datosManuales.retenciones → abrir su "+" → IMPORTAR → uploadFile(ruta) → Aceptar →
// esperar la tabla → volver.png. Itera sobre todas (Retenciones Sufridas, Percepciones, ...).
//
// Match EXACTO por la descripción de la fila (ojo: "Percepciones" es substring de
// "Percepciones Aduaneras"). NO se clickea "Seleccionar archivo" (diálogo nativo que cuelga):
// se usa input.uploadFile(ruta) directo. Tolerante: si una falla, sigue con la siguiente.

const nav = require('./_navegacion.js');

const ATTR = 'data-ddjj-ret-target';

/** Marca y clickea el "+" de la fila cuya descripción == etiqueta (exacto). */
async function abrirMas(page, etiqueta) {
    const ok = await page.evaluate((lbl, attr) => {
        const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        document.querySelectorAll('[' + attr + ']').forEach(e => e.removeAttribute(attr));
        const btns = Array.from(document.querySelectorAll('.v-button.dynaFormActionField'))
            .filter(b => b.offsetParent !== null && b.querySelector('img[src*="detallar"]'));
        for (const b of btns) {
            const row = b.closest('.v-table-row, .v-table-row-odd, tr');
            if (!row) continue;
            const desc = norm((row.querySelector('.v-customcomponent .v-label, .v-label') || {}).textContent);
            if (desc === norm(lbl)) { b.setAttribute(attr, '1'); return true; }
        }
        return false;
    }, etiqueta, ATTR);
    if (!ok) return false;

    const el = await page.$('[' + ATTR + ']');
    const inputsAntes = await page.evaluate(() => document.querySelectorAll('input').length);
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();
    await page.evaluate((attr) => { const e = document.querySelector('[' + attr + ']'); if (e) e.removeAttribute(attr); }, ATTR);
    try {
        await page.waitForFunction((p) => document.querySelectorAll('input').length !== p, { timeout: 15000 }, inputsAntes);
    } catch (_) {}
    return true;
}

/** Click en un .v-button por caption (case-insensitive). soloVentana → dentro del .v-window. */
async function clickCaption(page, regexSrc, soloVentana = false) {
    const handle = await page.evaluateHandle((rx, soloWin) => {
        const re = new RegExp(rx, 'i');
        const scope = soloWin ? (document.querySelector('.v-window') || document) : document;
        return Array.from(scope.querySelectorAll('.v-button')).find(b => {
            if (b.offsetParent === null) return false;
            const c = b.querySelector('.v-button-caption');
            return c && re.test(c.textContent || '');
        }) || null;
    }, regexSrc, soloVentana);
    const el = handle.asElement();
    if (!el) return false;
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();
    return true;
}

/** Cuenta las filas de la tabla de detalle más poblada (señal de archivos cargados). */
async function contarFilas(page) {
    return await page.evaluate(() => {
        let max = 0;
        for (const t of document.querySelectorAll('.v-table')) {
            const n = t.querySelectorAll('.v-table-row, .v-table-row-odd').length;
            if (n > max) max = n;
        }
        return max;
    });
}

/** Sondea ~ms buscando un cartel de AFIP (notificación Vaadin / errorDesc), que es transitorio. */
async function capturarAviso(page, ms = 4000) {
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

/** ¿El cartel es de ÉXITO (no un error)? */
const esAvisoOk = (t) => /correctamente|realizada|exitos|se import/i.test(t || '');

/**
 * Sube UN .txt dentro del detalle ya abierto: IMPORTAR → uploadFile → Aceptar → espera cierre.
 * Se llama UNA VEZ POR ARCHIVO sin salir del detalle (varios archivos a la misma fila).
 * Devuelve cuántas filas AGREGÓ (delta) y cualquier aviso de AFIP capturado.
 */
async function importarArchivo(page, ruta) {
    await nav.esperarVaadinIdle(page);                         // que el archivo anterior/​cartel se asiente
    const filasAntes = await contarFilas(page);
    if (!await clickCaption(page, 'importar')) return { ok: false, motivo: 'no apareció IMPORTAR', delta: 0 };
    await new Promise(r => setTimeout(r, 1500));               // que aparezca el popup

    const input = await page.$('.v-window input[type="file"], input.gwt-FileUpload');
    if (!input) return { ok: false, motivo: 'no apareció el input file', delta: 0 };
    await input.uploadFile(ruta);                              // NO clickear "Seleccionar archivo"

    // AFIP valida al subir → cartel transitorio (éxito o "no corresponde"). Lo sondeamos.
    let aviso = await capturarAviso(page, 4000);

    await clickCaption(page, 'aceptar', true);                 // Aceptar dentro del popup
    if (!aviso) aviso = await capturarAviso(page, 2000);       // por si el cartel sale al Aceptar
    let sinConfirmar = false;
    try {
        await page.waitForFunction(() => !document.querySelector('.v-window'), { timeout: 25000 });
    } catch (_) { sinConfirmar = true; }

    const filasDespues = await contarFilas(page);
    const delta = filasDespues - filasAntes;
    // El cartel de AFIP MANDA: si dice "correctamente" es éxito (aunque mi conteo de filas,
    // que es async/poco confiable, dé 0). Solo si NO hay cartel uso el delta como respaldo.
    const esError = aviso ? !esAvisoOk(aviso) : (delta <= 0);
    return { ok: true, sinConfirmar, filasAntes, filasDespues, delta, aviso, esError };
}

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} datos  { retenciones: { [etiqueta]: rutaTxt | rutaTxt[] } }
 */
async function ejecutar(page, datos) {
    const conf = (datos && datos.retenciones) || {};
    // Normalizamos: cada fila puede tener UN archivo (string) o VARIOS (array).
    const pendientes = Object.entries(conf)
        .map(([etiqueta, v]) => [etiqueta, (Array.isArray(v) ? v : [v]).filter(r => r && String(r).trim())])
        .filter(([, rutas]) => rutas.length);

    if (!pendientes.length) {
        console.log('[DDJJ paso_18] Sin retenciones configuradas.');
        return { success: true, cargadas: [], resumen: 'Retenciones: nada para cargar' };
    }
    console.log(`[DDJJ paso_18] Cargando ${pendientes.length} retención(es)...`);

    const cargadas = [];
    for (const [etiqueta, rutas] of pendientes) {
        console.log(`[DDJJ paso_18] === "${etiqueta}" (${rutas.length} archivo/s) ===`);
        try {
            if (!await abrirMas(page, etiqueta)) {
                console.warn(`[DDJJ paso_18] No encontré el "+" de "${etiqueta}".`);
                cargadas.push({ etiqueta, ok: false, motivo: 'no se encontró el "+"' });
                continue;
            }

            // Importar cada archivo SIN salir del detalle (se acumulan en la tabla).
            let subidos = 0, fallo = null;
            const problemas = [];       // archivos que fallaron (0 filas o cartel de error de AFIP)
            for (const ruta of rutas) {
                const nombre = ruta.split(/[\\/]/).pop();
                console.log(`[DDJJ paso_18]   ← ${nombre}`);
                const r = await importarArchivo(page, ruta);
                if (!r.ok) { fallo = r.motivo; console.warn(`[DDJJ paso_18]   ⚠️ ${r.motivo}`); break; }
                subidos++;
                console.log(`[DDJJ paso_18]     filas +${r.delta} (${r.filasAntes}→${r.filasDespues})${r.aviso ? ' | AFIP: ' + r.aviso : ''}`);
                if (r.esError) problemas.push(`${nombre}: ${r.aviso || `no agregó filas (+${r.delta})`}`);
            }

            const filas = await contarFilas(page);
            const okReal = subidos > 0 && !problemas.length;
            console.log(`[DDJJ paso_18] "${etiqueta}": ${subidos}/${rutas.length} archivo/s, tabla con ${filas} fila(s).`
                + (problemas.length ? ` ❌ PROBLEMAS: ${problemas.join(' | ')}` : ' ✅'));
            cargadas.push({ etiqueta, ok: okReal, subidos, total: rutas.length, filas, motivo: fallo, problemas });

            // Salir del detalle (una vez, ya con todos los archivos cargados).
            await nav.volverDetalle(page);
        } catch (e) {
            console.error(`[DDJJ paso_18] Error cargando "${etiqueta}": ${e.message}`);
            cargadas.push({ etiqueta, ok: false, motivo: e.message });
            await nav.volverDetalle(page).catch(() => {});
        }
    }

    const resumen = ['--- paso_18 cargar retenciones ---',
        ...cargadas.map(c => {
            if (c.motivo) return `  ${c.etiqueta}: ❌ ${c.motivo}`;
            const estado = c.ok ? '✅' : '❌';
            return `  ${c.etiqueta}: ${estado} ${c.subidos}/${c.total} archivo/s · ${c.filas} fila(s)`
                + (c.problemas && c.problemas.length ? '\n      ❌ ' + c.problemas.join('\n      ❌ ') : '');
        })
    ].join('\n');
    console.log('[DDJJ paso_18]\n' + resumen);
    return { success: true, cargadas, resumen };
}

module.exports = { ejecutar };
