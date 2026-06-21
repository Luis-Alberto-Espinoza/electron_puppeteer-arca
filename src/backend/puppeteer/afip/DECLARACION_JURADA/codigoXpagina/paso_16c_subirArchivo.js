// paso_16c_subirArchivo.js
// En el popup "Retenciones" (abierto por paso_16b "IMPORTAR"), sube el .txt al
// <input type=file> y confirma. El form es `v-upload v-upload-immediate` → al setear
// el archivo se sube solo; después "Aceptar" cierra el popup y se llena la tabla.
//
// La RUTA del .txt sale de datosManuales.retenciones[etiqueta] (Plan B: la eligió el
// usuario en el frontend). Si está vacía → NO sube nada (solo inspecciona el popup).
//
// CLAVE Puppeteer: NO se clickea "Seleccionar archivo" (abriría el diálogo nativo que
// cuelga el flujo). Se usa elementHandle.uploadFile(ruta) directo sobre el input file.

const nav = require('./_navegacion.js');
const { inspeccionar } = require('./_inspeccionar.js');

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} datosManuales
 * @param {string} etiqueta  tipo de retención (ej. "Retenciones Sufridas")
 */
async function ejecutar(page, datosManuales, etiqueta) {
    console.log(`[DDJJ paso_16c] Subir .txt de "${etiqueta}"...`);

    // Inspector sobre el popup (página nueva → volcado completo, idea del equipo).
    await inspeccionar(page, `popup Retenciones (${etiqueta})`);

    const ruta = ((datosManuales && datosManuales.retenciones) || {})[etiqueta] || '';
    if (!ruta) {
        const msg = `[DDJJ paso_16c] Sin .txt configurado para "${etiqueta}" ` +
            `(datosManuales.retenciones["${etiqueta}"] vacío). No se sube nada.`;
        console.log(msg);
        return { success: true, subido: false, resumen: `paso_16c: sin .txt para "${etiqueta}" (no se subió)` };
    }

    // 1. Subir el archivo al <input type=file> del popup.
    const input = await page.$('.v-window input[type="file"], input.gwt-FileUpload');
    if (!input) {
        const msg = '[DDJJ paso_16c] No encontré el <input type=file> en el popup.';
        console.warn(msg);
        return { success: false, motivo: 'sin input file', resumen: msg };
    }
    await input.uploadFile(ruta);
    console.log(`[DDJJ paso_16c] Archivo seteado en el input: ${ruta}`);

    // 2. El form es immediate → sube solo. Damos tiempo al round-trip y luego "Aceptar".
    await new Promise(r => setTimeout(r, 2500));
    const aceptar = await page.evaluateHandle(() => {
        const win = document.querySelector('.v-window');
        const scope = win || document;
        return Array.from(scope.querySelectorAll('.v-button')).find(b => {
            if (b.offsetParent === null) return false;
            const c = b.querySelector('.v-button-caption');
            return c && /aceptar/i.test(c.textContent || '');
        }) || null;
    });
    const elAceptar = aceptar.asElement();
    if (elAceptar) { try { await elAceptar.click(); } catch (_) {} console.log('[DDJJ paso_16c] "Aceptar" clickeado.'); }

    // 3. Esperar a que aparezca la tabla de retenciones (header "Importe Retención").
    let filas = [];
    try {
        await page.waitForFunction(() => {
            return Array.from(document.querySelectorAll('.v-table-caption-container'))
                .some(c => /importe\s+retenci/i.test(c.textContent || ''));
        }, { timeout: 15000 });
        filas = await page.evaluate(() => {
            const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
            const t = Array.from(document.querySelectorAll('.v-table'))
                .find(tb => Array.from(tb.querySelectorAll('.v-table-caption-container')).some(c => /importe\s+retenci/i.test(c.textContent || '')));
            if (!t) return [];
            return Array.from(t.querySelectorAll('.v-table-row, .v-table-row-odd'))
                .map(tr => Array.from(tr.querySelectorAll('.v-table-cell-content')).map(txt));
        });
        console.log(`[DDJJ paso_16c] Tabla de retenciones cargada: ${filas.length} fila(s).`);
    } catch (_) {
        console.warn('[DDJJ paso_16c] No detecté la tabla de retenciones tras subir (revisar a mano).');
    }

    // 4. Volver a Liquidación (para iterar con la siguiente retención).
    await nav.volverDetalle(page);

    const resumen = [
        `--- paso_16c subir .txt (${etiqueta}) ---`,
        `Archivo: ${ruta}`,
        `Filas en tabla: ${filas.length}`,
        ...filas.slice(0, 10).map((f, n) => `  fila ${n}: ${f.join(' | ')}`)
    ].join('\n');
    console.log('[DDJJ paso_16c]\n' + resumen);

    return { success: true, subido: true, etiqueta, ruta, filas, resumen };
}

module.exports = { ejecutar };
