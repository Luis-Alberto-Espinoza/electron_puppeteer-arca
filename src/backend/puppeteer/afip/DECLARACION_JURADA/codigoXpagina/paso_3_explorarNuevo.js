// paso_3_explorarNuevo.js
// Paso de EXPLORACIÓN + primera SELECCIÓN real (modo prueba):
//   1. Click "Nuevo" (confirmado que funciona vía Puppeteer).
//   2. Abrir combo Organismo, volcar opciones, y SELECCIONAR "A.T.M. ... MENDOZA".
//   3. Abrir combo Formulario y volcar sus opciones (depende de Organismo) para
//      capturar el texto exacto de "F.5111 ...".
//
// Usa los helpers de _combosVaadin.js.

const combos = require('./_combosVaadin.js');

const ORGANISMO_TARGET = 'mendoza';   // match por "incluye" → "A.T.M. PROVINCIA DE MENDOZA"

/**
 * @param {import('puppeteer').Page} page
 */
async function ejecutar(page) {
    console.log('[DDJJ paso_3] Click "Nuevo" + seleccionar Organismo + explorar Formulario...');

    // 1. Click REAL en "Nuevo".
    const nuevoHandle = await page.evaluateHandle(() => {
        return Array.from(document.querySelectorAll('.v-button')).find(b => {
            const cap = b.querySelector('.v-button-caption');
            return cap && /nuevo/i.test(cap.textContent);
        }) || null;
    });
    const nuevoEl = nuevoHandle.asElement();
    if (!nuevoEl) throw new Error('No se encontró el botón "Nuevo"');
    try { await nuevoEl.scrollIntoView(); } catch (_) {}
    await nuevoEl.click();
    await page.waitForFunction(() => {
        return !!document.querySelector('.v-required-field-indicator')
            || !!document.querySelector('.v-filterselect-required');
    }, { timeout: 20000 });
    console.log('[DDJJ paso_3] Vista "Nuevo" detectada.');

    // 2. Organismo: abrir → volcar → seleccionar Mendoza.
    await combos.abrirCombo(page, 'Organismo');
    const opcionesOrganismo = await combos.leerOpciones(page);
    await combos.clickOpcion(page, ORGANISMO_TARGET);
    const valorOrganismo = await combos.leerValor(page, 'Organismo');
    const organismoOk = combos.norm(valorOrganismo).includes(ORGANISMO_TARGET);
    console.log(`[DDJJ paso_3] Organismo seleccionado → "${valorOrganismo}" (${organismoOk ? 'OK' : 'NO matchea'})`);

    // 3. Formulario: abrir → volcar (se pobló al elegir Organismo).
    let opcionesFormulario = [];
    let errorFormulario = null;
    try {
        await combos.abrirCombo(page, 'Formulario');
        opcionesFormulario = await combos.leerOpciones(page);
    } catch (e) {
        errorFormulario = e.message;
        console.warn('[DDJJ paso_3] No se pudo abrir/leer Formulario:', e.message);
    }

    const resumen = [
        `--- Exploración "Nuevo" ---`,
        `Click "Nuevo": ✅`,
        `Organismo (${opcionesOrganismo.length} opciones): ${opcionesOrganismo.join(' | ')}`,
        `Organismo seleccionado: ${organismoOk ? '✅' : '❌'} "${valorOrganismo || ''}"`,
        errorFormulario
            ? `Formulario: ❌ ${errorFormulario}`
            : `Formulario (${opcionesFormulario.length} opciones): ${opcionesFormulario.join(' | ')}`
    ].join('\n');

    console.log('[DDJJ paso_3]\n' + resumen);

    return {
        clickNuevoOk: true,
        opcionesOrganismo,
        valorOrganismo,
        organismoOk,
        opcionesFormulario,
        errorFormulario,
        resumen
    };
}

module.exports = { ejecutar };
