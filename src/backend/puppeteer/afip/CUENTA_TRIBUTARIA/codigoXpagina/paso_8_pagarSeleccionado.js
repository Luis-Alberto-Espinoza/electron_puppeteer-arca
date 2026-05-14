// PASO 8: Click en "Pagar seleccionado".
// Navega dentro del iframe a la vista donde aparece el botón "GENERAR VEP".
//
// Patrones aplicados (ver doc §7.0):
//   7.0.2 click real (mouse de Puppeteer, isTrusted),
//   7.0.3 validar el efecto: que aparezca el botón "GENERAR VEP",
//   7.0.6 todo vive en el iframe del SCT,
//   7.0.7 scope a .tab-pane.active al elegir el botón.

const { getSctFrame, esperarIframeSctListo } = require('./_helpers.js');

const TIMEOUT_NAVEGACION = 20000;

/**
 * Texto que identifica al botón. Lo dejamos parcial para tolerar variaciones
 * ("Pagar seleccionado", "Pagar Seleccionados", etc.).
 */
function matcheaTextoBoton(txt) {
    const t = (txt || '').trim().toLowerCase();
    return t.includes('pagar') && t.includes('selecc');
}

/**
 * Devuelve un handle al botón visible "Pagar seleccionado" en la tab activa.
 */
async function buscarBotonPagar(frame) {
    const fnFind = `(function() {
        const root = document.querySelector('.tab-pane.active') || document;
        const botones = Array.from(root.querySelectorAll('button.btn-primary'));
        return botones.find(b => {
            const txt = (b.textContent || '').trim().toLowerCase();
            if (!(txt.includes('pagar') && txt.includes('selecc'))) return false;
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        }) || null;
    })()`;
    const handle = await frame.evaluateHandle(fnFind);
    return handle.asElement();
}

/**
 * Verifica si la vista posterior (con "GENERAR VEP") ya está visible.
 */
async function vistaGenerarVepVisible(frame) {
    try {
        return await frame.evaluate(() => {
            const botones = Array.from(document.querySelectorAll('button'));
            return botones.some(b => {
                const t = (b.textContent || '').trim().toLowerCase();
                if (!t.includes('generar') || !t.includes('vep')) return false;
                const r = b.getBoundingClientRect();
                return r.width > 0 && r.height > 0;
            });
        });
    } catch (_) {
        return false;
    }
}

async function ejecutar(page) {
    try {
        console.log('  → [SCT] Click en "Pagar seleccionado"...');

        let frame = await getSctFrame(page);

        // 1) Localizar el botón en la tab activa.
        const botonEl = await buscarBotonPagar(frame);
        if (!botonEl) {
            throw new Error('No se encontró el botón "Pagar seleccionado" visible');
        }

        // 2) Click real (isTrusted=true).
        try { await botonEl.scrollIntoView(); } catch (_) {}
        await new Promise(r => setTimeout(r, 200));
        await botonEl.click();

        // 3) Validar el efecto: que aparezca el botón "GENERAR VEP".
        // El iframe puede o no reemplazarse; manejamos ambos casos.
        const inicio = Date.now();
        while (Date.now() - inicio < TIMEOUT_NAVEGACION) {
            // Si el frame actual ya muestra "GENERAR VEP", listo.
            if (await vistaGenerarVepVisible(frame)) {
                console.log('  ✅ [SCT] Vista de "GENERAR VEP" cargada');
                return { success: true };
            }
            // Si se desprendió el iframe, refrescar el frame y reintentar.
            try {
                if (frame.isDetached && frame.isDetached()) {
                    frame = await esperarIframeSctListo(page, { timeout: 10000, selectorListo: 'button' });
                }
            } catch (_) {
                // Ignorar, reintentamos en la próxima iteración.
            }
            await new Promise(r => setTimeout(r, 500));
        }

        throw new Error('Timeout esperando la vista de "GENERAR VEP" tras "Pagar seleccionado"');

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_8_pagarSeleccionado:', error);
        return { success: false, message: error.message };
    }
}

module.exports = { ejecutar };
