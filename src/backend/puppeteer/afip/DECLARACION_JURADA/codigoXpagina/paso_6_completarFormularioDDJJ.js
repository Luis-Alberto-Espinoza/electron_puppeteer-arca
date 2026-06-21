// paso_6_completarFormularioDDJJ.js
// Completa la cabecera del alta en la vista "Nuevo":
//   Organismo (combo) → Formulario (combo, depende de Organismo) → Período Fiscal.
// NO clickea Aceptar (eso es el paso siguiente). Deja el form listo para revisar.

const combos = require('./_combosVaadin.js');

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} datos { organismo, formulario, periodo }
 */
async function ejecutar(page, datos) {
    const { organismo, formulario, periodo } = datos || {};
    if (!organismo) throw new Error('Falta el Organismo');
    if (!formulario) throw new Error('Falta el Formulario');
    if (!/^\d{6}$/.test(String(periodo || ''))) {
        throw new Error(`Período inválido "${periodo}" (formato esperado AAAAMM, ej: 202605)`);
    }

    // 1. Organismo.
    await combos.seleccionar(page, 'Organismo', organismo);
    const valorOrganismo = await combos.leerValor(page, 'Organismo');
    console.log(`[DDJJ paso_6] Organismo → "${valorOrganismo}"`);

    // 2. Formulario (se pobló al elegir Organismo).
    await combos.seleccionar(page, 'Formulario', formulario);
    const valorFormulario = await combos.leerValor(page, 'Formulario');
    console.log(`[DDJJ paso_6] Formulario → "${valorFormulario}"`);

    // 3. Período Fiscal: input que aparece tras elegir Formulario. Teclado real.
    await page.waitForSelector('input.eFormPeriodoFiscalField', { visible: true, timeout: 15000 });
    const inputPeriodo = await page.$('input.eFormPeriodoFiscalField');
    if (!inputPeriodo) throw new Error('No apareció el input de Período Fiscal');
    await inputPeriodo.click({ clickCount: 3 });          // seleccionar lo que haya
    await inputPeriodo.press('Backspace');                 // limpiar
    await inputPeriodo.type(String(periodo), { delay: 60 });

    const valorPeriodo = await page.$eval('input.eFormPeriodoFiscalField', el => el.value);
    console.log(`[DDJJ paso_6] Período → "${valorPeriodo}"`);

    return {
        valorOrganismo,
        valorFormulario,
        valorPeriodo,
        organismoOk: combos.norm(valorOrganismo).includes(combos.norm(organismo)) || !!valorOrganismo,
        formularioOk: !!valorFormulario,
        periodoOk: valorPeriodo === String(periodo)
    };
}

module.exports = { ejecutar };
