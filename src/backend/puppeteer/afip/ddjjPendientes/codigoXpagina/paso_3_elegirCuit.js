// Paso 3 — Elegir el contribuyente en el desplegable "Contribuyente" (@vueform/multiselect).
//
// Las opciones están SIEMPRE en el DOM, aunque la lista esté cerrada (.is-hidden):
//   <li class="multiselect-option" id="…-multiselect-option-30717301257"
//       aria-label="30717301257 - BIO TRANSPORTE S. A. S." aria-selected="false">
// Se elige por el CUIT del final del id (exacto, no depende de la razón social).
// La lista = el login + sus representados: si el CUIT no está, este login no lo representa.

const SELECTOR_OPCIONES = 'li.multiselect-option';
const TIMEOUT_SELECCION = 10000;

const selectorOpcion = (cuit) => `li.multiselect-option[id$="-multiselect-option-${cuit}"]`;

async function estaSeleccionado(page, cuit) {
    return page.$eval(selectorOpcion(cuit), li => li.getAttribute('aria-selected') === 'true').catch(() => false);
}

/**
 * @param {import('puppeteer').Page} page  Pestaña de Seti en "DDJJ pendientes".
 * @param {string} cuit
 * @throws Error con code 'NO_REPRESENTADO' si el CUIT no figura en el desplegable.
 */
async function elegirCuit(page, cuit) {
    const opcion = await page.$(selectorOpcion(cuit));
    if (!opcion) {
        const disponibles = await page.$$eval(SELECTOR_OPCIONES, lis => lis.map(li => li.getAttribute('aria-label')));
        console.warn(`        [DdjjPendientes] Opciones del desplegable: ${disponibles.join(' | ')}`);
        const e = new Error(`El CUIT ${cuit} no figura en "DDJJ pendientes" de este login (no lo representa en ARCA).`);
        e.code = 'NO_REPRESENTADO';
        throw e;
    }

    if (await estaSeleccionado(page, cuit)) return;

    // Abrir la lista con click real en el combo y elegir la opción.
    const wrapper = await opcion.evaluateHandle(li => li.closest('.multiselect').querySelector('.multiselect-wrapper'));
    try {
        await wrapper.asElement().click();
        await page.waitForFunction(
            (sel) => { const li = document.querySelector(sel); return li && li.offsetParent !== null; },
            { timeout: 5000 }, selectorOpcion(cuit)
        );
        await page.click(selectorOpcion(cuit));
    } catch (e) {
        // La lista no se abrió a la vista: el click por DOM igual dispara la selección.
        console.warn(`        [DdjjPendientes] Selección por mouse falló (${e.message}); pruebo por DOM.`);
        await page.$eval(selectorOpcion(cuit), li => li.click());
    }

    await page.waitForFunction(
        (sel) => { const li = document.querySelector(sel); return li && li.getAttribute('aria-selected') === 'true'; },
        { timeout: TIMEOUT_SELECCION }, selectorOpcion(cuit)
    ).catch(() => { throw new Error(`Seti no dejó elegido el CUIT ${cuit} en el desplegable.`); });
}

module.exports = { elegirCuit };
