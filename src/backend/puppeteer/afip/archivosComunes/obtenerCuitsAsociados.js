/**
 * Extrae los CUITs asociados de la página de selección de CUIT
 * @param {import('puppeteer').Page} page - La página de CCMA
 * @returns {Promise<string[]|null>} Array de CUITs o null si no es la página correcta
 */
async function obtenerCuitsAsociados(page) {
    try {
        console.log('    [CUIT] -> Verificando URL de la página...');

        // Obtener la URL actual
        const currentUrl = page.url();
        console.log('    [CUIT] -> URL actual:', currentUrl);

        // Verificar si es la página de selección de CUIT
        if (!currentUrl.includes('seleccionaCuit.asp')) {
            console.log('    [CUIT] -> No es la página de selección de CUIT. Saltando extracción.');
            return null;
        }

        console.log('    [CUIT] -> Página de selección de CUIT detectada. Extrayendo CUITs...');

        // Esperar a que el select esté disponible
        await page.waitForSelector('select[name="selectCuit"]', { timeout: 5000 });

        // Extraer los CUITs del select
        const cuits = await page.evaluate(() => {
            const select = document.querySelector('select[name="selectCuit"]');
            if (!select) return [];

            const options = Array.from(select.querySelectorAll('option'));
            return options
                .map(option => option.value)
                .filter(value => value && value.trim() !== '');
        });

        console.log(`    [CUIT] -> Se encontraron ${cuits.length} CUITs asociados:`, cuits);
        return cuits;

    } catch (error) {
        console.error('    [CUIT] -> Error al obtener CUITs asociados:', error.message);
        // No lanzar error, simplemente retornar null
        return null;
    }
}

module.exports = { obtenerCuitsAsociados };
