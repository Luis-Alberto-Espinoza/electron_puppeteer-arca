/**
 * PASO 1: Acceder a "Cuenta Corriente de Contribuyentes"
 * Abre una nueva pestaña
 */
async function ejecutar(page) {
    try {
        console.log("  → Buscando el panel de Cuenta Corriente...");

        // Esperar a que la página esté lista
        await page.waitForSelector('.panel-body', { timeout: 20000 });

        const browser = page.browser();

        // Configurar listener para nueva pestaña ANTES del click
        const nuevaPestanaPromise = new Promise((resolve) => {
            browser.once('targetcreated', async (target) => {
                const newPage = await target.page();
                resolve(newPage);
            });
        });

        // Usar el buscador para acceder a Cuenta Corriente
        const panelClicked = await page.evaluate(() => {
            return new Promise((resolve) => {
                const input = document.getElementById('buscadorInput');

                if (!input) {
                    resolve(false);
                    return;
                }

                // Simular secuencia completa de interacción
                input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                input.focus();

                setTimeout(() => {
                    try {
                        // Para React, necesitas usar el setter nativo
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLInputElement.prototype, 'value'
                        ).set;

                        nativeInputValueSetter.call(input, 'ccma');
                        input.dispatchEvent(new Event('input', { bubbles: true }));

                        // Esperar un poco para que aparezcan los resultados
                        setTimeout(() => {
                            try {
                                // Acceder al primer elemento de la lista mostrada
                                const primerElemento = document.querySelector('#resBusqueda li:first-child a.dropdown-item');

                                if (primerElemento) {
                                    primerElemento.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                                    primerElemento.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                                    primerElemento.click();
                                    resolve(true);
                                } else {
                                    resolve(false);
                                }
                            } catch (error) {
                                resolve(false);
                            }
                        }, 500);
                    } catch (error) {
                        resolve(false);
                    }
                }, 100);
            });
        });

        if (!panelClicked) {
            throw new Error('No se pudo acceder a Cuenta Corriente mediante el buscador');
        }

        console.log("  → Click realizado. Esperando nueva pestaña...");

        // Esperar a que se abra la nueva pestaña (timeout de 10 segundos)
        const newPage = await Promise.race([
            nuevaPestanaPromise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout esperando nueva pestaña')), 10000)
            )
        ]);

        // Esperar a que la nueva página cargue (esperar un selector específico es más rápido)
        try {
            await newPage.waitForSelector('body', { timeout: 5000 });
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (e) {
            console.log("  ⚠️ Error esperando carga de página, continuando...");
        }

        console.log("  ✅ Paso 1 completado: Nueva pestaña abierta");

        return {
            success: true,
            message: "Cuenta Corriente abierta correctamente",
            newPage: newPage
        };

    } catch (error) {
        console.error("  ❌ Error en paso_1_cuentaCorriente:", error);
        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = { ejecutar };
