/**
 * PASO 7: Seleccionar el primer VEP de la lista
 */
async function ejecutar(page) {
    try {
        console.log("  → Esperando que cargue la lista de VEPs...");

        // Habilitar captura de logs del navegador
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[DEBUG]')) {
                console.log(`  ${text}`);
            }
        });

        // Estrategia 1: Esperar a que aparezca el ag-grid (tabla de VEPs)
        try {
            await page.waitForSelector('.ag-root-wrapper', { timeout: 30000 });
            console.log("  → ag-grid detectado");
        } catch (error) {
            console.log("  ⚠️ ag-grid no detectado, intentando buscar inputs directamente...");
        }

        // Estrategia 2: Esperar a que aparezca al menos un input de selección
        try {
            await page.waitForSelector('input[type="radio"], input[type="checkbox"]', { timeout: 5000 });
            console.log("  → Inputs de selección detectados");
        } catch (error) {
            console.log("  ⚠️ No se detectaron inputs en 5 segundos");
        }

        // Dar un tiempo adicional para que la tabla termine de renderizar
        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log("  → Buscando primer VEP disponible...");

        // Buscar dinámicamente el primer checkbox/radio en la tabla de VEPs
        const vepSeleccionado = await page.evaluate(() => {
            // Debug: contar todos los inputs en la página
            const todosLosInputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
            console.log(`[DEBUG] Total de inputs encontrados en página: ${todosLosInputs.length}`);

            // Mostrar información de los primeros 5 inputs para debugging
            console.log('[DEBUG] Primeros 5 inputs:');
            Array.from(todosLosInputs).slice(0, 5).forEach((input, idx) => {
                const rect = input.getBoundingClientRect();
                const visible = rect.width > 0 && rect.height > 0;
                const parent = input.parentElement?.className || 'sin-clase';
                console.log(`[DEBUG]   ${idx + 1}. id="${input.id || 'sin-id'}", type=${input.type}, visible=${visible}, parent="${parent}"`);
            });

            // Estrategia 1: Buscar dentro del ag-grid
            const agGrid = document.querySelector('.ag-root-wrapper');
            if (agGrid) {
                console.log('[DEBUG] ag-grid encontrado');
                const primerInput = agGrid.querySelector('input[type="radio"], input[type="checkbox"]');
                if (primerInput) {
                    console.log(`[DEBUG] Input encontrado en ag-grid: ${primerInput.id || 'sin-id'}, type: ${primerInput.type}`);
                    if (!primerInput.checked) {
                        primerInput.click();
                        console.log('[DEBUG] Click realizado en input del ag-grid');
                    }
                    return {
                        encontrado: true,
                        id: primerInput.id || 'sin-id',
                        tipo: primerInput.type,
                        checked: true,
                        estrategia: 'ag-grid'
                    };
                } else {
                    console.log('[DEBUG] No se encontraron inputs dentro del ag-grid');
                }
            } else {
                console.log('[DEBUG] ag-grid NO encontrado');
            }

            // Estrategia 2: Buscar inputs con IDs que contengan 'ag-' (ag-grid inputs)
            console.log('[DEBUG] Probando estrategia 2: buscar por ID con "ag-"');
            for (const input of todosLosInputs) {
                const id = input.id || '';
                if (id.includes('ag-')) {
                    console.log(`[DEBUG] Input con ag- encontrado: ${id}, type: ${input.type}`);
                    if (!input.checked) {
                        input.click();
                        console.log('[DEBUG] Click realizado');
                    }
                    return {
                        encontrado: true,
                        id: input.id,
                        tipo: input.type,
                        checked: true,
                        estrategia: 'id-ag'
                    };
                }
            }

            // Estrategia 3a: Tomar el PRIMER input visible de cualquier tipo
            console.log('[DEBUG] Probando estrategia 3a: primer input visible');
            for (const input of todosLosInputs) {
                const rect = input.getBoundingClientRect();
                const esVisible = rect.width > 0 && rect.height > 0;

                if (esVisible) {
                    console.log(`[DEBUG] Input visible encontrado: ${input.id || 'sin-id'}, type: ${input.type}`);
                    if (!input.checked) {
                        input.click();
                        console.log('[DEBUG] Click realizado');
                    }
                    return {
                        encontrado: true,
                        id: input.id || 'sin-id',
                        tipo: input.type,
                        checked: true,
                        estrategia: 'primer-visible'
                    };
                }
            }

            // Estrategia 3b: Si no hay visibles, tomar el PRIMER input CUALQUIERA (último recurso)
            console.log('[DEBUG] Probando estrategia 3b: primer input (aunque no sea visible)');
            if (todosLosInputs.length > 0) {
                const primerInput = todosLosInputs[0];
                console.log(`[DEBUG] Tomando primer input sin importar visibilidad: ${primerInput.id || 'sin-id'}, type: ${primerInput.type}`);
                if (!primerInput.checked) {
                    primerInput.click();
                    console.log('[DEBUG] Click realizado');
                }
                return {
                    encontrado: true,
                    id: primerInput.id || 'sin-id',
                    tipo: primerInput.type,
                    checked: true,
                    estrategia: 'primer-cualquiera'
                };
            }

            console.log('[DEBUG] No se encontró ningún input válido');
            return {
                encontrado: false,
                debug: {
                    totalInputs: todosLosInputs.length,
                    tieneAgGrid: !!agGrid
                }
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

        console.log("  ✅ Paso 7 completado: Primer VEP seleccionado");

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
