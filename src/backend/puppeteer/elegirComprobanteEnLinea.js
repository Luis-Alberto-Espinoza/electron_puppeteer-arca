async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

async function elegirComprobanteEnLinea(page) {
    try {
        console.log('  → Buscando Comprobantes en línea mediante buscador...');

        // Esperar a que la página esté lista
        await page.waitForSelector('#buscadorInput', { timeout: 20000 });

        const browser = page.browser();

        // Configurar listener para nueva pestaña ANTES del click
        const nuevaPestanaPromise = new Promise((resolve) => {
            const handleTarget = async (target) => {
                // Verificar que sea un target de tipo 'page'
                if (target.type() !== 'page') {
                    console.log('  [DEBUG] Target ignorado, tipo:', target.type());
                    return;
                }

                const newPage = await target.page();

                if (newPage) {
                    console.log('  [DEBUG] Página válida obtenida del target');
                    browser.off('targetcreated', handleTarget); // Remover listener
                    resolve(newPage);
                } else {
                    console.log('  [DEBUG] target.page() retornó null, esperando siguiente target');
                }
            };

            browser.on('targetcreated', handleTarget);
        });

        // Usar el buscador para acceder a Comprobantes en línea
        const servicioClicked = await page.evaluate(() => {
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

                // Esperar mínimo para que React procese el focus
                setTimeout(() => {
                    try {
                        // Para React, necesitas usar el setter nativo
                        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                            window.HTMLInputElement.prototype, 'value'
                        ).set;

                        // Buscar "comprobantes en linea"
                        nativeInputValueSetter.call(input, 'comprobantes en linea');
                        input.dispatchEvent(new Event('input', { bubbles: true }));

                        // Esperar a que aparezcan los resultados (polling más inteligente)
                        const checkResults = (attempts = 0) => {
                            const primerElemento = document.querySelector('#resBusqueda li:first-child a.dropdown-item');

                            if (primerElemento) {
                                primerElemento.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                                primerElemento.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                                primerElemento.click();
                                resolve(true);
                            } else if (attempts < 10) {
                                // Reintentar cada 50ms hasta 10 veces (máx 500ms)
                                setTimeout(() => checkResults(attempts + 1), 50);
                            } else {
                                resolve(false);
                            }
                        };

                        // Comenzar a verificar después de un breve delay
                        setTimeout(() => checkResults(), 100);
                    } catch (error) {
                        resolve(false);
                    }
                }, 50);
            });
        });

        if (!servicioClicked) {
            throw new Error('No se pudo acceder a Comprobantes en línea mediante el buscador');
        }

        console.log('  → Click realizado. Esperando nueva pestaña...');

        // Esperar a que se abra la nueva pestaña (timeout de 10 segundos)
        let newPage;
        try {
            newPage = await Promise.race([
                nuevaPestanaPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout esperando nueva pestaña')), 5000)
                )
            ]);
            console.log('  ✅ Nueva pestaña capturada correctamente');
            console.log('  [DEBUG] newPage tipo:', typeof newPage);
            console.log('  [DEBUG] newPage es null:', newPage === null);
            console.log('  [DEBUG] newPage es undefined:', newPage === undefined);
        } catch (timeoutError) {
            console.log('  ⚠️ No se detectó nueva pestaña. Verificando si navegó en la misma página...');

            // Verificar si navegó en la misma página
            try {
                // Esperar a que la URL cambie o que aparezca un elemento característico de comprobantes
                await page.waitForFunction(
                    () => window.location.href.includes('comprobantes') ||
                          document.querySelector('.btn_empresa') !== null ||
                          document.querySelector('select[name*="puntoDeVenta"]') !== null,
                    { timeout: 5000 }
                );
                console.log('  ✅ Navegó en la misma pestaña. Usando página actual.');
                newPage = page; // Usar la página actual
            } catch (e) {
                console.error('  ❌ No se pudo detectar navegación. Error:', e.message);
                throw new Error('No se pudo acceder a Comprobantes en línea (no se abrió nueva pestaña ni navegó)');
            }
        }

        console.log('  [DEBUG] Después de try-catch, newPage:', typeof newPage);

        // Esperar a que la nueva página cargue
        if (newPage) {
            console.log('  [DEBUG] newPage existe, esperando a que cargue...');
            try {
                await newPage.waitForSelector('body', { timeout: 5000 });
                console.log('  [DEBUG] body encontrado');
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                console.log('  ⚠️ Error esperando carga de página:', e.message);
            }
        } else {
            console.log('  [DEBUG] ⚠️ newPage es null/undefined antes de esperar carga');
        }

        console.log('  [DEBUG] Antes de validación final, newPage:', typeof newPage, newPage ? 'existe' : 'NO EXISTE');
        console.log('  ✅ Comprobantes en línea abierto correctamente');

        // Validación final
        if (!newPage) {
            console.error('  [DEBUG] ❌ VALIDACIÓN FINAL FALLÓ: newPage es', newPage);
            throw new Error('Error crítico: newPage es null después de todo el proceso');
        }

        console.log('  [DEBUG] ✅ Validación final exitosa, retornando newPage');
        return newPage; // Devuelve la nueva página

    } catch (error) {
        console.error("Error en elegirComprobanteEnLinea:", error);
        throw error;
    }
}

module.exports = { elegirComprobanteEnLinea };
