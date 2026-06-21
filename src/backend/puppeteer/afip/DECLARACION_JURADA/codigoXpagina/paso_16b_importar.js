// paso_16b_importar.js
// Paso EXPLORATORIO: dentro del detalle de una deducción (ej. "Retenciones Sufridas",
// abierto por paso_16), clickea "IMPORTAR" para descubrir CÓMO se sube el .txt.
//
// Distingue 4 mecanismos posibles:
//   - 'filechooser-nativo' : IMPORTAR dispara el diálogo de archivos del SO. Lo cazamos
//     con el evento `filechooser` de Puppeteer y lo CANCELAMOS (no subimos nada en
//     exploración). En producción se resuelve con `fileChooser.accept([ruta])`.
//   - 'input-file-en-dom'  : aparece un <input type=file> → `elementHandle.uploadFile(ruta)`.
//   - 'vaadin-upload'      : aparece un `.v-upload` (componente Upload de Vaadin).
//   - 'popup-vwindow'      : abre una ventana `.v-window` (con su propio upload adentro).
//
// OJO: el listener de `filechooser` se setea ANTES del click; si no, un diálogo nativo
// COLGARÍA el flujo esperando intervención humana.

/**
 * @param {import('puppeteer').Page} page
 */
async function ejecutar(page) {
    console.log('[DDJJ paso_16b] Click "IMPORTAR" para ver el mecanismo del .txt...');

    // Listener del diálogo nativo: si dispara, lo cancelamos para no colgar el flujo.
    let fileChooser = null;
    const onFC = async (fc) => {
        fileChooser = { multiple: typeof fc.isMultiple === 'function' ? fc.isMultiple() : null };
        try { await fc.cancel(); } catch (_) {}
    };
    page.once('filechooser', onFC);

    const handle = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('.v-button')).find(b => {
            if (b.offsetParent === null) return false;
            const c = b.querySelector('.v-button-caption');
            return c && /importar/i.test(c.textContent || '');
        }) || null;
    });
    const el = handle.asElement();
    if (!el) {
        page.off('filechooser', onFC);
        const msg = '[DDJJ paso_16b] No se encontró el botón "IMPORTAR".';
        console.warn(msg);
        return { success: false, motivo: 'sin botón IMPORTAR', resumen: msg };
    }
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();

    // Darle tiempo a que dispare el filechooser o aparezca un popup/upload.
    await new Promise(r => setTimeout(r, 2500));
    page.off('filechooser', onFC);

    // Volcar el estado resultante.
    const data = await page.evaluate(() => {
        const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'))
            .map(i => ({ clase: i.className, name: i.name || null, accept: i.accept || null, visible: i.offsetParent !== null }));
        const uploads = Array.from(document.querySelectorAll('.v-upload')).length;
        const ventanas = Array.from(document.querySelectorAll('.v-window'))
            .filter(w => w.offsetParent !== null)
            .map(w => ({
                titulo: txt(w.querySelector('.v-window-header, .v-window-caption')),
                botones: Array.from(w.querySelectorAll('.v-button-caption')).map(txt).filter(Boolean),
                inputs: Array.from(w.querySelectorAll('input')).map(i => ({ tipo: i.type || 'text', clase: i.className })),
                fileInputs: w.querySelectorAll('input[type="file"]').length,
                uploads: w.querySelectorAll('.v-upload').length
            }));
        return { url: location.href, fileInputs, uploads, ventanas };
    });

    const mecanismo = fileChooser ? 'filechooser-nativo'
        : data.fileInputs.length ? 'input-file-en-dom'
            : data.uploads ? 'vaadin-upload'
                : data.ventanas.length ? 'popup-vwindow'
                    : 'desconocido';

    const resumen = [
        `--- paso_16b IMPORTAR ---`,
        `Mecanismo detectado: ${mecanismo}`,
        `filechooser nativo: ${fileChooser ? `SÍ (multiple=${fileChooser.multiple})` : 'no'}`,
        `input[type=file] en DOM: ${data.fileInputs.length}`,
        ...data.fileInputs.map((f, n) => `  file[${n}] clase="${f.clase}" accept="${f.accept}" visible=${f.visible}`),
        `Vaadin uploads (.v-upload): ${data.uploads}`,
        `Popups (.v-window): ${data.ventanas.length}`,
        ...data.ventanas.map((w, n) => `  ventana[${n}] "${w.titulo}" | botones: ${w.botones.join(' · ')} | file=${w.fileInputs} upload=${w.uploads} | inputs: ${w.inputs.map(i => i.tipo).join(',')}`)
    ].join('\n');

    console.log('[DDJJ paso_16b]\n' + resumen);
    return { success: true, mecanismo, fileChooser, ...data, resumen };
}

module.exports = { ejecutar };
