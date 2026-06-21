// paso_2_verificarSelectores.js
// Paso de DIAGNÓSTICO (modo prueba). No interactúa: solo lee el DOM del portal
// fenix y reporta si los selectores que relevamos a mano matchean.
// Sirve para confirmar la tabla de selectores antes de empezar a clickear.

/**
 * @param {import('puppeteer').Page} page  página del portal fenix.
 * @returns {Promise<Object>} hallazgos estructurados + resumen humano.
 */
async function ejecutar(page) {
    console.log('[DDJJ paso_2] Verificando selectores en fenix...');

    // ¿Este cliente tiene bloque CUIT/s? Los clientes SIN CUIT asociado no lo
    // muestran: el form de Organismo/Formulario sale directo. Lo detectamos por
    // el caption "CUIT/s" (su ausencia NO es un error).
    const tieneCuitBox = await page.evaluate(() =>
        [...document.querySelectorAll('.v-captiontext')].some(c => /cuit/i.test(c.textContent))
    );

    // Solo esperamos opciones si el bloque CUIT/s existe (Vaadin las carga async,
    // el <select> aparece vacío y luego se llena). 20s porque el portal a veces
    // tarda cuando está "frío".
    if (tieneCuitBox) {
        try {
            await page.waitForFunction(() => {
                const s = document.querySelector('select.v-select-select[multiple]');
                return s && s.options.length > 0;
            }, { timeout: 20000 });
        } catch (_) {
            console.warn('[DDJJ paso_2] El select de CUIT/s no cargó opciones en 20s.');
        }
    } else {
        console.log('[DDJJ paso_2] Cliente sin CUIT asociado: form directo (sin bloque CUIT/s).');
    }

    const hallazgos = await page.evaluate(() => {
        const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();

        // Botones (en Vaadin son div.v-button, NO <button>). Los identificamos
        // por el texto del caption.
        const captionsBoton = Array.from(document.querySelectorAll('.v-button-caption')).map(txt);

        // Select nativo de CUIT/s (este SÍ es <select>, a diferencia de los combos).
        // Apuntamos al que tiene `multiple` para no agarrar los <select size="1">
        // ocultos y vacíos que Vaadin deja para los combos Organismo/Formulario.
        const selectCuits = document.querySelector('select.v-select-select[multiple]');
        const cuits = selectCuits
            ? Array.from(selectCuits.options).map(o => txt(o)).filter(Boolean)
            : [];

        // Combos Vaadin (Organismo / Formulario / Estado): no son <select>, son
        // v-filterselect (input + dropdown). Listamos cuántos hay y los captions cercanos.
        const filterselects = document.querySelectorAll('.v-filterselect').length;
        const captions = Array.from(document.querySelectorAll('.v-captiontext')).map(txt).filter(Boolean);
        const tieneCuitBox = captions.some(c => /cuit/i.test(c));

        return {
            url: location.href,
            botones: {
                tieneBuscar: captionsBoton.some(c => /buscar/i.test(c)),
                tieneNuevo: captionsBoton.some(c => /nuevo/i.test(c)),
                tieneAceptar: captionsBoton.some(c => /aceptar/i.test(c)),
                todos: captionsBoton
            },
            cuits: {
                tieneCuitBox,
                selectorOk: !!selectCuits,
                cantidad: cuits.length,
                opciones: cuits
            },
            combos: {
                cantidadFilterselects: filterselects,
                captions
            },
            periodoFiscal: {
                selectorOk: !!document.querySelector('input.eFormPeriodoFiscalField')
            },
            btnAceptar: {
                selectorOk: !!document.querySelector('.eFormAceptarButton')
            }
        };
    });

    // Resumen legible para loguear/mostrar.
    const ok = (b) => b ? '✅' : '❌';
    const lineaCuit = hallazgos.cuits.tieneCuitBox
        ? `Select CUIT/s:  ${ok(hallazgos.cuits.selectorOk && hallazgos.cuits.cantidad > 0)} (${hallazgos.cuits.cantidad} opciones)`
        : `Select CUIT/s:  — cliente sin CUIT asociado (form directo)`;

    const resumen = [
        `URL: ${hallazgos.url}`,
        `Botón Buscar:   ${ok(hallazgos.botones.tieneBuscar)}`,
        `Botón Nuevo:    ${ok(hallazgos.botones.tieneNuevo)}`,
        `Botón Aceptar:  ${ok(hallazgos.btnAceptar.selectorOk)} (.eFormAceptarButton)`,
        lineaCuit,
        `Combos (Organismo/Formulario/Estado): ${hallazgos.combos.cantidadFilterselects} v-filterselect`,
        `Período Fiscal: ${ok(hallazgos.periodoFiscal.selectorOk)} (input.eFormPeriodoFiscalField)`,
        `Captions detectados: ${hallazgos.combos.captions.join(' · ')}`,
        `CUITs: ${hallazgos.cuits.opciones.join(' | ')}`
    ].join('\n');

    console.log('[DDJJ paso_2] Hallazgos:\n' + resumen);

    return { hallazgos, resumen };
}

module.exports = { ejecutar };
