/**
 * PASO 1B: Seleccionar CUIT (si está en la página de selección)
 * Solo se ejecuta si la página actual es seleccionaCuit.asp
 */
async function ejecutar(page, cuitASeleccionar) {
    try {
        console.log(`  → Verificando si requiere selección de CUIT...`);

        // Verificar URL actual
        const currentUrl = page.url();
        console.log(`  → URL actual: ${currentUrl}`);

        // Si NO está en la página de selección, retornar éxito sin hacer nada
        if (!currentUrl.includes('seleccionaCuit.asp')) {
            console.log(`  ✅ No requiere selección de CUIT. Continuando...`);
            return {
                success: true,
                message: "No requiere selección de CUIT"
            };
        }

        console.log(`  → Página de selección de CUIT detectada. Seleccionando CUIT: ${cuitASeleccionar}...`);

        // Esperar a que el select esté disponible
        await page.waitForSelector('select[name="selectCuit"]', { timeout: 5000 });

        // Seleccionar el CUIT
        await page.evaluate((cuit) => {
            const select = document.querySelector('select[name="selectCuit"]');
            if (select) {
                select.value = cuit;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, cuitASeleccionar);

        console.log(`  → CUIT ${cuitASeleccionar} seleccionado en el <select>`);

        // Esperar un momento para que se procesen los eventos
        await new Promise(resolve => setTimeout(resolve, 500));

        // Buscar el botón "Continuar" - probando varios selectores
        console.log(`  → Buscando botón Continuar...`);

        // Buscar y hacer click en el botón "Elegir CUIT"
        const resultado = await page.evaluate(() => {
            // Buscar el botón específico de AFIP
            const selectores = [
                'input[name="btnEnvia"]',                    // El botón específico de AFIP
                'input[type="button"][value="Elegir CUIT"]',
                'input[type="button"][onclick*="seleccionaCuit"]',
                'input[type="submit"][value="Continuar"]',
                'input[type="submit"]',
                'button[type="submit"]'
            ];

            for (const selector of selectores) {
                const btn = document.querySelector(selector);
                if (btn) {
                    btn.click();
                    return { metodo: 'button.click()', selector: selector };
                }
            }

            return { metodo: null, selector: null };
        });

        if (resultado.metodo === 'button.click()' && resultado.selector) {
            console.log(`  → Botón clickeado con selector: ${resultado.selector}`);
        } else {
            // No se encontró nada - capturar HTML para debugging
            const htmlDebug = await page.evaluate(() => {
                const body = document.body;
                return body ? body.innerHTML : 'No se pudo capturar HTML';
            });

            console.error(`  ❌ HTML de la página para debugging:`);
            console.error(htmlDebug.substring(0, 2000)); // Primeros 2000 caracteres

            throw new Error(`No se encontró el botón Continuar ni form para submit. Revisa el HTML en los logs.`);
        }

        console.log(`  → CUIT seleccionado. Esperando navegación...`);

        // Esperar a que la página navegue
        await page.waitForNavigation({ timeout: 10000, waitUntil: 'networkidle2' });

        console.log(`  ✅ Paso 1B completado: CUIT ${cuitASeleccionar} seleccionado correctamente`);

        return {
            success: true,
            message: `CUIT ${cuitASeleccionar} seleccionado correctamente`
        };

    } catch (error) {
        console.error(`  ❌ Error en paso_1b_seleccionarCuit:`, error);
        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = { ejecutar };
