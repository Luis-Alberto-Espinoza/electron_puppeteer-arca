// PASO 3: Ir a la pestaña "Deudas" dentro del SCT.
// El contenido del SCT vive dentro de `.v-iframe iframe`, así que usamos
// `getSctFrame(page)` y operamos sobre el Frame, no sobre la page.
// El tab es un <a class="nav-link"> cuyo texto incluye "Deudas".
//
// Retry específico para "detached Frame": tras paso_2 (cambio de CUIT),
// AFIP a veces renueva el iframe varias veces. Aunque esperamos a que esté
// listo, el frame puede invalidarse entre ese await y el primer uso.
// Reintentamos hasta 3 veces antes de declarar fallo definitivo.

const { esperarIframeSctListo, FN_FIND_TAB_DEUDAS } = require('./_helpers.js');

const MAX_INTENTOS = 3;

function esErrorDeFrameDesprendido(err) {
    const msg = (err && err.message) || '';
    return /detached Frame/i.test(msg)
        || /Execution context was destroyed/i.test(msg)
        || /Target closed/i.test(msg);
}

async function intentarPaso3(page, options) {
    const { timeout = 30000 } = options;

    // esperarIframeSctListo reintenta si el iframe se desprende mientras esperamos
    // (caso típico tras cambiar el CUIT interno: AFIP reemplaza el iframe).
    const frame = await esperarIframeSctListo(page, { timeout });

    // Esperar a que aparezca el tab "Deudas" específicamente dentro del iframe.
    await frame.waitForFunction(
        `(${FN_FIND_TAB_DEUDAS})()`,
        { timeout }
    );

    // Pequeña espera para que Vue termine de atar handlers al tab antes de clickear.
    await new Promise(r => setTimeout(r, 500));

    const resultado = await frame.evaluate(`(function() {
        const findTab = ${FN_FIND_TAB_DEUDAS};
        const target = findTab();
        if (!target) {
            const muestra = Array.from(document.querySelectorAll('a.nav-link, .nav-link'))
                .map(el => (el.textContent || '').trim().replace(/\\s+/g, ' '))
                .filter(t => t.length > 0 && t.length < 60)
                .slice(0, 40);
            return { ok: false, error: 'No se encontró el tab Deudas dentro del iframe', muestra };
        }
        const estabaActivo =
            target.classList.contains('active')
            || target.getAttribute('aria-selected') === 'true';

        target.scrollIntoView({ behavior: 'auto', block: 'center' });
        target.click();

        return {
            ok: true,
            estabaActivo,
            texto: (target.textContent || '').trim().replace(/\\s+/g, ' '),
            tag: target.tagName,
            cls: target.className || ''
        };
    })()`);

    if (!resultado.ok) {
        console.warn('  ⚠️ [SCT] Tabs visibles en iframe:', resultado.muestra);
        throw new Error(resultado.error);
    }

    // Esperar render del contenido del tab (todo dentro del mismo iframe).
    try {
        await frame.waitForFunction(() => {
            return document.querySelector('table.table.b-table')
                || document.querySelector('select.form-control.form-control-sm')
                || document.querySelector('.tab-pane.active');
        }, { timeout: 10000 });
    } catch (_) {
        console.warn('  ⚠️ [SCT] No se detectó render del tab Deudas; continuando.');
    }

    await new Promise(r => setTimeout(r, 600));

    console.log('  ✅ [SCT] Pestaña Deudas activa');
    return { success: true, texto: resultado.texto, estabaActivo: resultado.estabaActivo };
}

async function ejecutar(page, options = {}) {

    let ultimoError = null;
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        try {
            return await intentarPaso3(page, options);
        } catch (error) {
            ultimoError = error;
            if (esErrorDeFrameDesprendido(error) && intento < MAX_INTENTOS) {
                console.warn(`  ⚠️ [SCT] Frame desprendido en paso 3 (intento ${intento}/${MAX_INTENTOS}); reintentando…`);
                // Pausa breve para dejar que el iframe nuevo se asiente.
                await new Promise(r => setTimeout(r, 1500));
                continue;
            }
            // Otro tipo de error o agotamos intentos.
            console.error('  ❌ [SCT] Error en paso_3_irAPestanaDeudas:', error.message);
            return { success: false, message: error.message };
        }
    }

    console.error('  ❌ [SCT] Error en paso_3_irAPestanaDeudas (sin más reintentos):', ultimoError && ultimoError.message);
    return { success: false, message: ultimoError ? ultimoError.message : 'Falló paso 3 sin causa identificada' };
}

module.exports = { ejecutar };
