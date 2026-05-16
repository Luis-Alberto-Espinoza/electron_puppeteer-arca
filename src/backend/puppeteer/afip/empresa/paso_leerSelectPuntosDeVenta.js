/**
 * Paso: leer el <select id="puntodeventa"> de la pantalla de Consulta
 * de Comprobantes de AFIP y devolver las opciones crudas.
 *
 * NO hace click en "Buscar" ni modifica el form — sólo lee.
 *
 * Si el <select> no aparece dentro del timeout corto, asumimos que la
 * empresa NO tiene facturación habilitada (caso normal en AFIP: cuando una
 * empresa no factura, esa pantalla no expone el combo). Devolvemos lista
 * vacía en lugar de tirar excepción — el manager lo trata como "sin pdv"
 * y la UI muestra el mensaje correcto.
 *
 * @param {import('puppeteer').Page} page - página del form de Consulta
 * @returns {Promise<Array<{value: string, text: string}>>}
 */
async function leerSelectPuntosDeVenta(page) {
    const TIMEOUT_MS = 10000;
    console.log(`  → Esperando <select id="puntodeventa"> (timeout ${TIMEOUT_MS}ms)...`);
    try {
        await page.waitForSelector('#puntodeventa', { timeout: TIMEOUT_MS });
    } catch (_) {
        console.log('  → No apareció el combo en el tiempo esperado → asumimos sin facturación habilitada.');
        return [];
    }

    // Pequeña espera por si el select se popula con un script async
    await new Promise(r => setTimeout(r, 500));

    const opciones = await page.evaluate(() => {
        const sel = document.querySelector('#puntodeventa');
        if (!sel) return [];
        return Array.from(sel.options)
            .map(o => ({ value: String(o.value || ''), text: String(o.text || '') }))
            .filter(o => o.value.trim() !== '' && !/seleccione/i.test(o.text));
    });

    console.log(`  → ${opciones.length} opción(es) leídas del select.`);
    return opciones;
}

module.exports = { leerSelectPuntosDeVenta };
