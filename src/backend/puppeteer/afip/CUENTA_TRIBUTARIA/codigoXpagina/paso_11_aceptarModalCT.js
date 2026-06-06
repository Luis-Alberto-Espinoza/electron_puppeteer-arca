// PASO 11: Aceptar el modal de confirmación del SCT.
// El modal vive en algún frame (típicamente el del SCT, pero AFIP a veces lo
// renderiza en otro). Buscamos el frame que tenga `.modal.show .modal-footer
// .btn-primary` y le hacemos click real.
//
// Tras el click:
//   1. El modal se cierra.
//   2. Aparece la vista del comprobante con el botón de descargar PDF.
//
// Patrones aplicados (ver doc §7.0):
//   7.0.2 click real,
//   7.0.3 validar que el modal cerró y la vista cambió,
//   7.0.6 buscar en TODOS los frames.

const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const { frameConSelector, esperarFrameConSelector } = require('./_helpers.js');

const TIMEOUT_CIERRE = 15000;

async function clickBotonAceptar(frame) {
    const handle = await frame.evaluateHandle(() => {
        const modal = document.querySelector('.modal.show');
        if (!modal) return null;
        return modal.querySelector('.modal-footer .btn-primary')
            || modal.querySelector('.modal-footer button.btn-primary')
            || null;
    });
    const el = handle.asElement();
    if (!el) return { ok: false };
    const info = await el.evaluate(b => ({
        texto: (b.textContent || '').trim(),
        clases: b.className,
        disabled: !!(b.disabled || b.getAttribute('disabled') !== null)
    }));
    try { await el.scrollIntoView(); } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
    await el.click();
    return { ok: true, info };
}

/**
 * Captura screenshot + dump de cualquier `.modal.show` en cualquier frame.
 * Sólo se invoca en caminos de fallo. Los archivos quedan en os.tmpdir().
 */
async function capturarDiagnostico(page, etiqueta) {
    const ts = Date.now();
    const base = path.join(os.tmpdir(), `sct_paso11_${etiqueta}_${ts}`);
    const ssPath = `${base}.png`;
    const jsonPath = `${base}.json`;

    const reporte = { etiqueta, ts, url: page.url(), modales: [] };

    try {
        await page.screenshot({ path: ssPath, fullPage: true });
        reporte.screenshot = ssPath;
    } catch (e) {
        reporte.screenshotError = e.message;
    }

    for (const f of page.frames()) {
        try {
            const datos = await f.evaluate(() => {
                const modales = Array.from(document.querySelectorAll('.modal.show'));
                return modales.map(m => ({
                    texto: (m.textContent || '').trim().slice(0, 800),
                    botones: Array.from(m.querySelectorAll('.modal-footer button, .modal-footer a.btn, .modal-footer .btn'))
                        .map(b => ({
                            texto: (b.textContent || '').trim(),
                            clases: b.className,
                            disabled: !!(b.disabled || b.getAttribute('disabled') !== null)
                        })),
                    html: m.outerHTML.slice(0, 8000)
                }));
            });
            if (datos && datos.length) {
                reporte.modales.push({ frameUrl: f.url(), datos });
            }
        } catch (_) { /* frame detached o cross-origin */ }
    }

    try {
        await fs.writeFile(jsonPath, JSON.stringify(reporte, null, 2), 'utf8');
        reporte.dumpPath = jsonPath;
    } catch (_) {}

    console.error(`  📸 [SCT] Diagnóstico paso_11 (${etiqueta}):`);
    if (reporte.screenshot) console.error(`     screenshot: ${reporte.screenshot}`);
    if (reporte.dumpPath)   console.error(`     dump:       ${reporte.dumpPath}`);
    if (reporte.modales.length) {
        for (const m of reporte.modales) {
            for (const d of m.datos) {
                const txt = d.texto.replace(/\s+/g, ' ').slice(0, 200);
                console.error(`     modal en ${m.frameUrl}: "${txt}"`);
                for (const b of d.botones) {
                    console.error(`       botón: "${b.texto}" [${b.clases}]${b.disabled ? ' DISABLED' : ''}`);
                }
            }
        }
    } else {
        console.error('     (no se detectó ningún .modal.show — pudo haberse cerrado y reabierto otra vista)');
    }
    return reporte;
}

/**
 * Marcadores de "ya estamos en la vista del comprobante" en cualquier frame.
 */
async function frameConVistaComprobante(page) {
    const predicateSrc = `() => {
        if (document.querySelector('a[title="Exportar detalle en archivo PDF"]')) return true;
        const spans = Array.from(document.querySelectorAll('span'));
        if (spans.some(s => (s.textContent || '').trim() === 'picture_as_pdf')) return true;
        const txt = (document.body && document.body.textContent) || '';
        return /Nro\\.?\\s*VEP/i.test(txt) || /Comprobante/i.test(txt);
    }`;
    const { frameConPredicado } = require('./_helpers.js');
    return await frameConPredicado(page, predicateSrc);
}

async function ejecutar(page) {
    try {

        // Esperar a que el modal con su botón esté presente en algún frame.
        const frame = await esperarFrameConSelector(
            page,
            '.modal.show .modal-footer .btn-primary',
            { timeout: 15000 }
        );

        const r = await clickBotonAceptar(frame);
        if (!r.ok) {
            await capturarDiagnostico(page, 'sin_boton');
            throw new Error('No se encontró el botón principal del modal');
        }
        const b = r.info;
        console.log(`     [SCT] Botón clickeado: "${b.texto}" [${b.clases}]${b.disabled ? ' DISABLED' : ''}`);

        // Validar el efecto: modal cerrado + vista del comprobante.
        const inicio = Date.now();
        let modalCerrado = false;
        while (Date.now() - inicio < TIMEOUT_CIERRE) {
            if (!modalCerrado) {
                const fModal = await frameConSelector(page, '.modal.show');
                modalCerrado = !fModal;
            }
            if (modalCerrado) {
                const fComprobante = await frameConVistaComprobante(page);
                if (fComprobante) {
                    console.log('  ✅ [SCT] Modal aceptado — vista del comprobante visible');
                    return { success: true };
                }
            }
            await new Promise(r => setTimeout(r, 400));
        }

        if (modalCerrado) {
            console.warn('  ⚠️ [SCT] Modal cerrado pero la vista del comprobante no fue detectada — el paso 12 reintentará.');
            return { success: true, warning: 'vista_comprobante_no_detectada' };
        }

        await capturarDiagnostico(page, 'modal_no_cerro');
        throw new Error('Timeout: el modal no se cerró tras aceptar');

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_11_aceptarModalCT:', error);
        return { success: false, message: error.message };
    }
}

module.exports = { ejecutar };
