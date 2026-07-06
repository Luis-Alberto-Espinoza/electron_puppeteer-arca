/**
 * Componente reutilizable para buscar en el buscador de AFIP
 * @param {import('puppeteer').Page} page - La página donde está el buscador
 * @param {string} textoBusqueda - El texto a buscar en el buscador
 * @param {object} options - Opciones adicionales
 * @param {number} options.timeoutNuevaPestana - Timeout para esperar nueva pestaña (default: 5000ms)
 * @param {boolean} options.esperarNuevaPestana - Si debe esperar nueva pestaña (default: true)
 * @param {string|null} options.textoEsperadoEnResultado - Si se pasa, se valida que el primer
 *        resultado de la lista incluya ese texto (case-insensitive). Si no coincide, o si el click
 *        no produce navegación, el retry hace F5 (recarga la página) antes de reintentar.
 *        Esto cubre el caso típico: el portal a veces se "cuelga" y el primer resultado no es el
 *        correcto, o el click se ignora silenciosamente. El F5 limpia ese estado.
 *        Si no se pasa (default), se mantiene el comportamiento clásico (sin validación, retry
 *        suave que solo limpia el input). Esto es para no romper otros callers.
 * @returns {Promise<import('puppeteer').Page>} La nueva página o la página actual
 */
async function buscarEnAfip(page, textoBusqueda, options = {}) {
    const {
        timeoutNuevaPestana = 5000,
        esperarNuevaPestana = true,
        textoEsperadoEnResultado = null
    } = options;

    const MAX_INTENTOS = 2;
    let ultimoError = null;

    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        try {
            return await intentarBusqueda(page, textoBusqueda, {
                timeoutNuevaPestana,
                esperarNuevaPestana,
                textoEsperadoEnResultado,
                intento
            });
        } catch (e) {
            ultimoError = e;
            console.warn(`  ⚠️ Buscador intento ${intento}/${MAX_INTENTOS} falló: ${e.message}`);
            if (intento < MAX_INTENTOS) {
                if (textoEsperadoEnResultado) {
                    // Recovery duro: F5. Solo se activa si el caller pidió validación.
                    console.log('  → [Buscador] Recargando página (F5) antes de reintentar...');
                    try {
                        await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
                        await new Promise(r => setTimeout(r, 1000));
                    } catch (eReload) {
                        console.warn(`  ⚠️ F5 falló: ${eReload.message}. Reintento usará la página tal como está.`);
                    }
                } else {
                    // Recovery suave: comportamiento clásico. Otros callers no se ven afectados.
                    await limpiarInputBuscador(page);
                    await new Promise(r => setTimeout(r, 800));
                }
            }
        }
    }

    throw ultimoError || new Error(`No se pudo completar la búsqueda de "${textoBusqueda}"`);
}

async function limpiarInputBuscador(page) {
    try {
        await page.evaluate(() => {
            const input = document.getElementById('buscadorInput');
            if (!input) return;
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            ).set;
            setter.call(input, '');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    } catch (_) { /* no es crítico */ }
}

/**
 * Un intento completo de búsqueda: tipear → esperar resultados → click real → validar
 * que algo cambió (nueva pestaña o URL distinta). Si nada cambió, tira para que el
 * caller pueda reintentar.
 */
async function intentarBusqueda(page, textoBusqueda, opts) {
    const { timeoutNuevaPestana, esperarNuevaPestana, textoEsperadoEnResultado, intento } = opts;
    const SELECTOR_PRIMER_RESULTADO = '#resBusqueda li:first-child a.dropdown-item';

    console.log(`  → Buscando "${textoBusqueda}" en el buscador de AFIP... (intento ${intento})`);

    // Traer la pestaña del buscador (Home de AFIP) al frente antes de tipear. Si un paso
    // previo abrió otra pestaña (CCMA, ABM, etc.), esta queda en segundo plano y Chrome la
    // throttlea → el buscador React deja de responder y la búsqueda falla. bringToFront la
    // "despierta" (es el equivalente a volver a la pestaña manualmente).
    try { await page.bringToFront(); } catch (_) { /* pestaña cerrada u otro: no es crítico */ }

    await page.waitForSelector('#buscadorInput', { timeout: 30000 });

    // Capturamos la URL antes del click para detectar si la navegación realmente ocurrió.
    // El check viejo (document.readyState === 'complete') es siempre true → falso positivo.
    const urlAntes = page.url();

    // 1) Tipear. El input es React-like, por eso usamos el setter nativo + 'input'.
    const tipeoExitoso = await page.evaluate((texto) => {
        const input = document.getElementById('buscadorInput');
        if (!input) return false;
        input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        input.focus();
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        setter.call(input, texto);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }, textoBusqueda);

    if (!tipeoExitoso) {
        throw new Error('No se pudo escribir en #buscadorInput (input no encontrado)');
    }

    // 2) Esperar a que la lista tenga al menos un resultado (sin sleep fijo).
    try {
        await page.waitForSelector(SELECTOR_PRIMER_RESULTADO, { visible: true, timeout: 15000 });
    } catch (_) {
        throw new Error(`No aparecieron resultados para "${textoBusqueda}" tras esperar 15s`);
    }

    // 2.5) Si el caller pidió validación, comprobar que el primer <li> tenga el texto esperado.
    // El portal AFIP a veces queda "frío" y la lista muestra resultados que no son los reales
    // (cacheados, parciales, etc). En ese caso lanzamos para que el retry haga F5.
    if (textoEsperadoEnResultado) {
        const textoPrimerResultado = await page.evaluate(() => {
            const li = document.querySelector('#resBusqueda li:first-child');
            if (!li) return null;
            const aria = li.getAttribute('aria-label') || '';
            const txt = (li.textContent || '').replace(/\s+/g, ' ').trim();
            return (aria + ' || ' + txt).trim();
        });
        if (!textoPrimerResultado) {
            throw new Error('No se pudo leer el primer resultado del buscador para validar');
        }
        const coincide = textoPrimerResultado.toLowerCase().includes(textoEsperadoEnResultado.toLowerCase());
        if (!coincide) {
            throw new Error(
                `Primer resultado no coincide con "${textoEsperadoEnResultado}". ` +
                `Encontrado: "${textoPrimerResultado.substring(0, 120)}"`
            );
        }
        console.log(`  → [Buscador] Primer resultado validado (incluye "${textoEsperadoEnResultado}").`);
    }

    // 3) Listener de nueva pestaña ANTES del click. Lo registramos siempre y lo
    // limpiamos al final para no acumular handlers entre reintentos.
    const browser = page.browser();
    let handleTarget = null;
    let nuevaPestanaPromise = null;
    if (esperarNuevaPestana) {
        nuevaPestanaPromise = new Promise((resolve) => {
            handleTarget = async (target) => {
                if (target.type() !== 'page') return;
                const newPage = await target.page();
                if (newPage) {
                    browser.off('targetcreated', handleTarget);
                    resolve(newPage);
                }
            };
            browser.on('targetcreated', handleTarget);
        });
    }

    // Helper para garantizar que el listener no quede colgado pase lo que pase.
    const limpiarListener = () => {
        if (handleTarget) {
            try { browser.off('targetcreated', handleTarget); } catch (_) {}
            handleTarget = null;
        }
    };

    try {
        // 4) Click REAL con mouse de Puppeteer (isTrusted: true).
        // El portal AFIP a veces ignora clicks sintéticos (el.click() desde evaluate),
        // y eso era lo que producía el fallo 1/25 — la búsqueda parecía completa pero
        // el portal no recibía el click y la URL no cambiaba.
        const handle = await page.$(SELECTOR_PRIMER_RESULTADO);
        if (!handle) {
            throw new Error('El primer resultado desapareció antes del click (DOM cambió)');
        }
        try { await handle.scrollIntoView(); } catch (_) { /* no es crítico */ }
        await handle.click();

        console.log('  → Click realizado en el primer resultado (mouse real).');

        if (!esperarNuevaPestana) {
            console.log('  ✅ Búsqueda completada (sin nueva pestaña).');
            return page;
        }

        // 5) Verificar que algo cambió: nueva pestaña O URL distinta.
        let newPage = null;
        try {
            newPage = await Promise.race([
                nuevaPestanaPromise,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('timeout-nueva-pestana')), timeoutNuevaPestana)
                )
            ]);
            console.log('  ✅ Nueva pestaña capturada correctamente');
        } catch (_) {
            limpiarListener();
            console.log('  → No hubo nueva pestaña. Verificando cambio de URL en la misma pestaña...');

            // Esperar hasta 8s a que la URL realmente cambie. Si no cambia, el click
            // no produjo efecto → tirar para que el retry externo lo intente de nuevo.
            try {
                await page.waitForFunction(
                    (urlPrevia) => window.location.href !== urlPrevia,
                    { timeout: 8000 },
                    urlAntes
                );
                console.log(`  ✅ Navegó en la misma pestaña. URL nueva: ${page.url()}`);
                newPage = page;
            } catch (_) {
                throw new Error(
                    `Click en "${textoBusqueda}" no produjo navegación (URL sigue en ${urlAntes})`
                );
            }
        }

        // 6) Esperar a que la nueva página termine de cargar lo básico.
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

    } finally {
        limpiarListener();
    }
}

module.exports = { buscarEnAfip };
