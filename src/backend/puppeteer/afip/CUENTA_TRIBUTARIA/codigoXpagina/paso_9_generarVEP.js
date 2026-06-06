// PASO 9: Click en "GENERAR VEP" para llegar a la vista de medios de pago.
//
// IMPORTANTE: tras "Pagar seleccionado" (paso 8), AFIP a veces ya muestra
// la vista de medios de pago directamente (sin un botón "GENERAR VEP"
// intermedio), o lo muestra junto con los medios de pago en la misma
// pantalla. Por eso este paso es DEFENSIVO:
//   1. Si los medios de pago ya están visibles en algún frame → no clickear, listo.
//   2. Si no, buscar el botón "GENERAR VEP" en el frame que lo tenga y clickear.
//   3. Pollear en TODOS los frames hasta detectar los medios de pago.
//
// Patrones aplicados (ver doc §7.0):
//   7.0.2 click real,
//   7.0.3 validar el efecto,
//   7.0.6 iframe del SCT — pero buscando en todos los frames porque AFIP
//   puede usar otro frame para esta vista.

const { frameConSelector, frameConPredicado } = require('./_helpers.js');

const TIMEOUT_RENDER_MEDIOS = 25000;

// IDs conocidos de medios de pago en SCT (idéntico al VEP).
const IDS_MEDIOS_PAGO = ['0', '1001', '1002', '1003', '1005'];

// La UI nueva de ARCA renderiza cada medio como
//   <button class="edpeffectbutton"><img id="0" src=".../edp0.gif"></button>
// La UI vieja usaba <input type="image" id="0">. Matcheamos ambas para
// sobrevivir a cualquiera de las dos que sirva AFIP.
const SELECTOR_MEDIO_PAGO =
    IDS_MEDIOS_PAGO
        .map(id => `button.edpeffectbutton img[id="${id}"], input[type="image"][id="${id}"]`)
        .join(', ');

/**
 * Devuelve el frame que tenga al menos un medio de pago. null si ninguno tiene.
 */
async function frameConMediosDePago(page) {
    return await frameConSelector(page, SELECTOR_MEDIO_PAGO);
}

/**
 * Devuelve el frame que tenga un botón "GENERAR VEP" visible y habilitado.
 */
async function frameConBotonGenerarVEP(page) {
    const predicateSrc = `() => {
        const botones = Array.from(document.querySelectorAll('button'));
        return botones.some(b => {
            const t = (b.textContent || '').trim().toLowerCase();
            if (!t.includes('generar') || !t.includes('vep')) return false;
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && !b.disabled;
        });
    }`;
    return await frameConPredicado(page, predicateSrc);
}

/**
 * Click real sobre el botón "GENERAR VEP" dentro del frame indicado.
 */
async function clickGenerarVEP(frame) {
    const handle = await frame.evaluateHandle(() => {
        const botones = Array.from(document.querySelectorAll('button'));
        return botones.find(b => {
            const t = (b.textContent || '').trim().toLowerCase();
            if (!t.includes('generar') || !t.includes('vep')) return false;
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && !b.disabled;
        }) || null;
    });
    const el = handle.asElement();
    if (!el) return false;
    try { await el.scrollIntoView(); } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
    await el.click();
    return true;
}

async function ejecutar(page) {
    try {

        // 1. Si ya hay medios de pago visibles, no hace falta clickear nada.
        const frameConMediosYa = await frameConMediosDePago(page);
        if (frameConMediosYa) {
            console.log('  ✅ [SCT] Medios de pago ya visibles — sin click "GENERAR VEP" necesario');
            return { success: true, skipped: true };
        }

        // 2. Buscar el botón "GENERAR VEP" en cualquier frame.
        const frameBoton = await frameConBotonGenerarVEP(page);
        if (!frameBoton) {
            throw new Error('No se encontró el botón "GENERAR VEP" en ningún frame');
        }

        const ok = await clickGenerarVEP(frameBoton);
        if (!ok) {
            throw new Error('No se pudo clickear el botón "GENERAR VEP"');
        }

        // 3. Pollear hasta que aparezcan los medios de pago en algún frame.
        const inicio = Date.now();
        while (Date.now() - inicio < TIMEOUT_RENDER_MEDIOS) {
            const f = await frameConMediosDePago(page);
            if (f) {
                console.log('  ✅ [SCT] Medios de pago visibles');
                return { success: true };
            }
            await new Promise(r => setTimeout(r, 500));
        }

        throw new Error('Timeout esperando los medios de pago tras "GENERAR VEP"');

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_9_generarVEP:', error);
        return { success: false, message: error.message };
    }
}

module.exports = { ejecutar };
