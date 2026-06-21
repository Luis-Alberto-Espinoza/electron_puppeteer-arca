// paso_5_seleccionarCuitAsociado.js
// En la vista "Nuevo", elige la empresa/CUIT en el <select> nativo de Vaadin.
// Los clientes SIN asociados no tienen este select → se saltea (no es error).
//
// El <select> es nativo (v-select-select); sus opciones son "CUIT - RAZON SOCIAL".
// Localmente no siempre tenemos el número de CUIT del asociado (empresas[].cuit
// suele ser null), pero sí la razón social. Por eso matcheamos por:
//   - dígitos del CUIT (si el objetivo trae un CUIT), o
//   - texto de la razón social (case/acentos-insensible).

/**
 * @param {import('puppeteer').Page} page
 * @param {string} empresaObjetivo  CUIT (dígitos) o razón social a seleccionar.
 * @returns {Promise<{seleccionado:boolean, skipped?:boolean, texto?:string}>}
 */
async function ejecutar(page, empresaObjetivo) {
    const objetivo = String(empresaObjetivo || '').trim();
    if (!objetivo) {
        console.log('[DDJJ paso_5] Sin empresa objetivo → skip.');
        return { seleccionado: false, skipped: true };
    }
    const objetivoDigits = objetivo.replace(/\D/g, '');

    const resultado = await page.evaluate((obj, objDigits) => {
        const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
        const objN = norm(obj);

        // Solo los selects que de verdad listan CUITs (alguna opción con >=8 dígitos).
        // Los clientes de una sola empresa NO muestran la caja de CUIT → no hay select
        // de estos → es "form directo" y se saltea (no es error).
        const selectsCuit = Array.from(document.querySelectorAll('select.v-select-select'))
            .filter(sel => Array.from(sel.options)
                .some(o => (o.textContent || '').replace(/\D/g, '').length >= 8));

        if (selectsCuit.length === 0) return { seleccionado: false, skipped: true };

        for (const sel of selectsCuit) {
            const opt = Array.from(sel.options).find(o => {
                const t = o.textContent || '';
                const porDigitos = objDigits.length >= 8 && t.replace(/\D/g, '').includes(objDigits);
                const porTexto = objN.length > 0 && norm(t).includes(objN);
                return porDigitos || porTexto;
            });
            if (opt) {
                sel.value = opt.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                return { seleccionado: true, texto: (opt.textContent || '').trim() };
            }
        }
        // Hay caja de CUIT pero el objetivo no está en la lista → error real.
        return { seleccionado: false, skipped: false };
    }, objetivo, objetivoDigits);

    if (resultado.seleccionado) {
        console.log(`[DDJJ paso_5] Empresa seleccionada → "${resultado.texto}"`);
    } else if (resultado.skipped) {
        console.log('[DDJJ paso_5] No hay select de empresa (cliente sin asociados) → skip.');
    } else {
        throw new Error(`No se encontró "${objetivo}" en el select de empresa/CUIT del portal`);
    }

    return resultado;
}

module.exports = { ejecutar };
