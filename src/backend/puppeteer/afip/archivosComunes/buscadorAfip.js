/**
 * Componente reutilizable para buscar en el buscador de AFIP
 * @param {import('puppeteer').Page} page - La página donde está el buscador
 * @param {string} textoBusqueda - El texto a buscar en el buscador
 * @param {object} options - Opciones adicionales
 * @param {number} options.timeoutNuevaPestana - Timeout para esperar nueva pestaña (default: 5000ms)
 * @param {boolean} options.esperarNuevaPestana - Si debe esperar nueva pestaña (default: true)
 * @returns {Promise<import('puppeteer').Page>} La nueva página o la página actual
 */
async function buscarEnAfip(page, textoBusqueda, options = {}) {
    try {
        const {
            timeoutNuevaPestana = 5000,
            esperarNuevaPestana = true
        } = options;

        console.log(`  → Buscando "${textoBusqueda}" en el buscador de AFIP...`);

        // Esperar a que el buscador esté disponible
        await page.waitForSelector('#buscadorInput', { timeout: 20000 });

        const browser = page.browser();
        let nuevaPestanaPromise = null;

        // Configurar listener para nueva pestaña ANTES del click (si se espera)
        if (esperarNuevaPestana) {
            nuevaPestanaPromise = new Promise((resolve) => {
                const handleTarget = async (target) => {
                    // Verificar que sea un target de tipo 'page'
                    if (target.type() !== 'page') {
                        return;
                    }

                    const newPage = await target.page();

                    if (newPage) {
                        browser.off('targetcreated', handleTarget);
                        resolve(newPage);
                    }
                };

                browser.on('targetcreated', handleTarget);
            });
        }

        // Ejecutar la búsqueda y click en el primer resultado
        const busquedaExitosa = await page.evaluate((texto) => {
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

                        nativeInputValueSetter.call(input, texto);
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
        }, textoBusqueda);

        if (!busquedaExitosa) {
            throw new Error(`No se pudo realizar la búsqueda de "${textoBusqueda}"`);
        }

        console.log('  → Click realizado en el primer resultado.');

        // Si no se espera nueva pestaña, retornar la página actual
        if (!esperarNuevaPestana) {
            console.log('  ✅ Búsqueda completada (sin nueva pestaña).');
            return page;
        }

        // Esperar a que se abra la nueva pestaña
        let newPage;
        try {
            console.log('  → Esperando nueva pestaña...');
            newPage = await Promise.race([
                nuevaPestanaPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout esperando nueva pestaña')), timeoutNuevaPestana)
                )
            ]);
            console.log('  ✅ Nueva pestaña capturada correctamente');
        } catch (timeoutError) {
            console.log('  ⚠️ No se detectó nueva pestaña. Verificando si navegó en la misma página...');

            // Verificar si navegó en la misma página
            try {
                await page.waitForFunction(
                    () => document.readyState === 'complete',
                    { timeout: 3000 }
                );
                console.log('  ✅ Navegó en la misma pestaña. Usando página actual.');
                newPage = page;
            } catch (e) {
                console.error('  ❌ No se pudo detectar navegación.');
                throw new Error(`No se pudo acceder a "${textoBusqueda}" (no se abrió nueva pestaña ni navegó)`);
            }
        }

        // Esperar a que la nueva página cargue
        if (newPage && newPage !== page) {
            try {
                await newPage.waitForSelector('body', { timeout: 5000 });
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                console.log('  ⚠️ Error esperando carga de página:', e.message);
            }
        }

        console.log(`  ✅ Búsqueda de "${textoBusqueda}" completada exitosamente`);
        return newPage;

    } catch (error) {
        console.error(`Error en buscarEnAfip("${textoBusqueda}"):`, error);
        throw error;
    }
}

module.exports = { buscarEnAfip };
