/**
 * PASO 7: Seleccionar el primer VEP de la lista
 */
async function ejecutar(page) {
    try {
        console.log("  → Esperando que cargue la lista de VEPs...");

        // Estrategia 1: Esperar a que aparezca el ag-grid (tabla de VEPs)
        try {
            await page.waitForSelector('.ag-root-wrapper', { timeout: 30000 });
        } catch (error) {
            console.log("  ⚠️ ag-grid no detectado, intentando buscar inputs directamente...");
        }

        // Estrategia 2: Esperar a que aparezca al menos un input de selección
        try {
            await page.waitForSelector('input[type="radio"], input[type="checkbox"]', { timeout: 5000 });
        } catch (error) {
            console.log("  ⚠️ No se detectaron inputs en 5 segundos");
        }

        // Dar un tiempo adicional para que la tabla termine de renderizar
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Buscar dinámicamente el primer checkbox/radio en la tabla de VEPs
        const vepSeleccionado = await page.evaluate(() => {
            const todosLosInputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');

            // Estrategia 1: Buscar dentro del ag-grid
            const agGrid = document.querySelector('.ag-root-wrapper');
            if (agGrid) {
                const primerInput = agGrid.querySelector('input[type="radio"], input[type="checkbox"]');
                if (primerInput) {
                    if (!primerInput.checked) primerInput.click();
                    return {
                        encontrado: true,
                        id: primerInput.id || 'sin-id',
                        tipo: primerInput.type,
                        estrategia: 'ag-grid'
                    };
                }
            }

            // Estrategia 2: Buscar inputs con IDs que contengan 'ag-' (ag-grid inputs)
            for (const input of todosLosInputs) {
                if ((input.id || '').includes('ag-')) {
                    if (!input.checked) input.click();
                    return { encontrado: true, id: input.id, tipo: input.type, estrategia: 'id-ag' };
                }
            }

            // Estrategia 3a: Tomar el PRIMER input visible de cualquier tipo
            for (const input of todosLosInputs) {
                const rect = input.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    if (!input.checked) input.click();
                    return { encontrado: true, id: input.id || 'sin-id', tipo: input.type, estrategia: 'primer-visible' };
                }
            }

            // Estrategia 3b: Si no hay visibles, tomar el PRIMER input (último recurso)
            if (todosLosInputs.length > 0) {
                const primerInput = todosLosInputs[0];
                if (!primerInput.checked) primerInput.click();
                return { encontrado: true, id: primerInput.id || 'sin-id', tipo: primerInput.type, estrategia: 'primer-cualquiera' };
            }

            return {
                encontrado: false,
                debug: { totalInputs: todosLosInputs.length, tieneAgGrid: !!agGrid }
            };
        });

        if (!vepSeleccionado.encontrado) {
            const debugInfo = vepSeleccionado.debug || {};
            throw new Error(
                `No se encontró ningún VEP para seleccionar. ` +
                `Debug: ${debugInfo.totalInputs || 0} inputs totales, ` +
                `ag-grid: ${debugInfo.tieneAgGrid ? 'SÍ' : 'NO'}`
            );
        }

        console.log(`  ✅ VEP seleccionado: ${vepSeleccionado.id} (${vepSeleccionado.tipo}) - Estrategia: ${vepSeleccionado.estrategia}`);

        // Esperar un momento
        await new Promise(resolve => setTimeout(resolve, 500));

        return {
            success: true,
            message: "Primer VEP seleccionado correctamente",
            vepInfo: vepSeleccionado
        };

    } catch (error) {
        console.error("  ❌ Error en paso_7_seleccionarPrimerVEP:", error);
        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = { ejecutar };
