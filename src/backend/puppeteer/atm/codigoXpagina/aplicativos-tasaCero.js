/**
 * Módulo para navegar desde la página home de ATM hacia el servicio de Tasa Cero
 * dentro del menú "Aplicativos"
 */

// ============================================================================
// SELECTORES - Configurables según la implementación real de la página
// ============================================================================
const SELECTORES = {
    // Selector del menú "Aplicativos" en la página principal de ATM
    menuAplicativos: 'a[href="#secAplicativos"]', // TODO: Rellenar (ej: 'a[title="Aplicativos"]', '#menu-aplicativos')
    // document.querySelector('a[href="#secAplicativos"]').click();

    // Selector de la opción "Tasa Cero" dentro del menú Aplicativos
    opcionTasaCero:'li[onclick*="6050"]', // TODO: Rellenar (ej: 'a:has-text("Tasa Cero")', '.opcion-tasa-cero')
    // navigateTo('/tasacero/contribuyente/login2.jsp', true, 6050, null, false);

    // XPath alternativo para buscar por texto
    xpathMenuAplicativos: '//a[contains(text(), "Aplicativos") or contains(@title, "Aplicativos")]',
    // La opción real es un <li onclick="navigateTo(...6050...)">, no un <a>: buscamos ambos.
    // Solo elementos clickeables (@onclick/@href): la página tiene <li> de AYUDA que
    // nombran "Tasa Cero" en su texto y clickearlos no abre nada.
    // El not(...) descarta los contenedores: nos quedamos con el elemento más interno.
    xpathOpcionTasaCero: '//*[self::a or self::li][@onclick or @href][contains(normalize-space(.), "Tasa Cero") or contains(@title, "Tasa Cero")][not(.//*[self::a or self::li][@onclick or @href][contains(normalize-space(.), "Tasa Cero")])]',

    // Opciones del menú Aplicativos (sirve para distinguir "no habilitado" de "cambió la página")
    opcionesAplicativos: '#secAplicativos li[onclick]',

    // Timeouts
    tiempoEsperaNavegacion: 30000,
    tiempoEsperaSelector: 10000,
};

const SERVICIO_NO_HABILITADO = 'SERVICIO_NO_HABILITADO';

/**
 * Arma el error para cuando "Tasa Cero" no aparece en Aplicativos.
 * Si el menú abrió y lista OTRAS opciones, el cliente no tiene el servicio
 * (error con code SERVICIO_NO_HABILITADO). Si no lista nada, lo más probable
 * es que ATM haya cambiado la página: error común para revisar los selectores.
 *
 * @param {import('puppeteer').Page} pagina
 * @returns {Promise<Error>}
 */
async function errorOpcionNoEncontrada(pagina) {
    const opciones = await pagina.$$eval(SELECTORES.opcionesAplicativos,
        items => items.map(li => li.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean)
    ).catch(() => []);

    if (opciones.length > 0) {
        console.warn(`[navegarATasaCero] Aplicativos lista ${opciones.length} opción(es) pero no Tasa Cero: ${opciones.join(' | ')}`);
        const error = new Error('Tasa Cero no aparece en Aplicativos de ATM: el cliente no tiene el servicio habilitado.');
        error.code = SERVICIO_NO_HABILITADO;
        return error;
    }

    console.warn('[navegarATasaCero] El menú Aplicativos no lista ninguna opción: posible cambio en la página de ATM.');
    return new Error('No se encontró la opción "Tasa Cero" y el menú Aplicativos vino vacío. Puede que ATM haya cambiado la página.');
}

/**
 * Navega al menú "Aplicativos" y luego hace clic en "Tasa Cero"
 * IMPORTANTE: Esta acción abre una NUEVA PESTAÑA/VENTANA del navegador
 *
 * @param {import('puppeteer').Page} pagina - La página actual (después del login)
 * @param {import('puppeteer').Browser} navegador - Instancia del navegador (necesaria para detectar nueva pestaña)
 * @returns {Promise<import('puppeteer').Page>} - La nueva página de Tasa Cero que se abrió
 */
async function navegarATasaCero(pagina, navegador) {
    try {
        const tiempoInicio = Date.now();
        console.log(`⏱️ [${new Date().toISOString()}] [navegarATasaCero] Iniciando navegación al servicio Tasa Cero...`);

        // Paso 1: Hacer clic en el menú "Aplicativos"
        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] [navegarATasaCero] Buscando menú "Aplicativos"...`);

        let botonAplicativos = null;

        // Intentar primero con selector CSS si está definido
        if (SELECTORES.menuAplicativos) {
            try {
                await pagina.waitForSelector(SELECTORES.menuAplicativos, {
                    visible: true,
                    timeout: SELECTORES.tiempoEsperaSelector
                });
                botonAplicativos = await pagina.$(SELECTORES.menuAplicativos);
            } catch (error) {
                console.warn('[navegarATasaCero] No se encontró el menú con selector CSS, intentando con XPath...');
            }
        }

        // Si no se encontró con CSS, intentar con XPath
        if (!botonAplicativos) {
            // Puppeteer 22+ eliminó page.$x(): el XPath va con el prefijo "xpath/".
            const elementosXPath = await pagina.$$(`xpath/${SELECTORES.xpathMenuAplicativos}`);
            if (elementosXPath.length > 0) {
                botonAplicativos = elementosXPath[0];
            } else {
                throw new Error('No se encontró el menú "Aplicativos" en la página');
            }
        }

        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] 👆 [navegarATasaCero] Haciendo clic en "Aplicativos"...`);
        await botonAplicativos.click();
        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] [navegarATasaCero] Clic en Aplicativos completado`);

        // No dormimos a ciegas: el waitForSelector de "Tasa Cero" (abajo) ya espera a que
        // el menú se despliegue y la opción sea visible. El sleep de 2s era redundante.

        // Paso 2: Hacer clic en la opción "Tasa Cero"
        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] [navegarATasaCero] Buscando opción "Tasa Cero"...`);

        let botonTasaCero = null;

        // Intentar primero con selector CSS si está definido
        if (SELECTORES.opcionTasaCero) {
            try {
                await pagina.waitForSelector(SELECTORES.opcionTasaCero, {
                    visible: true,
                    timeout: SELECTORES.tiempoEsperaSelector
                });
                botonTasaCero = await pagina.$(SELECTORES.opcionTasaCero);
            } catch (error) {
                console.warn('[navegarATasaCero] No se encontró "Tasa Cero" con selector CSS, intentando con XPath...');
            }
        }

        // Si no se encontró con CSS, intentar con XPath
        if (!botonTasaCero) {
            const elementosXPath = await pagina.$$(`xpath/${SELECTORES.xpathOpcionTasaCero}`);
            // Solo sirve uno visible: ATM puede tener el texto en nodos ocultos y
            // clickearlos revienta con "Node is either not clickable or not an Element".
            for (const elemento of elementosXPath) {
                const visible = await elemento.isVisible().catch(() => false);
                const descripcion = await elemento.evaluate(n => `<${n.tagName.toLowerCase()}> "${n.textContent.trim().replace(/\s+/g, ' ').slice(0, 200)}"`).catch(() => '?');
                console.log(`[navegarATasaCero] XPath encontró ${descripcion} (visible: ${visible})`);
                if (visible && !botonTasaCero) botonTasaCero = elemento;
            }
            if (!botonTasaCero) {
                throw await errorOpcionNoEncontrada(pagina);
            }
        }

        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] [navegarATasaCero] Preparando para detectar nueva ventana/pestaña...`);

        // Paso 3: Preparar la detección de nueva pestaña ANTES de hacer clic
        const paginasAntesDelClick = await navegador.pages();
        const cantidadPaginasAntes = paginasAntesDelClick.length;

        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] [navegarATasaCero] Páginas abiertas antes del clic: ${cantidadPaginasAntes}`);

        // Crear una promesa que se resuelve cuando se abre una nueva pestaña
        const promesaNuevaPagina = new Promise((resolver) => {
            navegador.once('targetcreated', async (objetivo) => {
                if (objetivo.type() === 'page') {
                    const nuevaPagina = await objetivo.page();
                    resolver(nuevaPagina);
                }
            });
        });

        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] 👆 [navegarATasaCero] Haciendo clic en "Tasa Cero"...`);
        await botonTasaCero.click();
        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] [navegarATasaCero] Clic en Tasa Cero completado`);

        // Esperar a que se abra la nueva pestaña (con timeout)
        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] [navegarATasaCero] Esperando que se abra la nueva ventana/pestaña...`);
        const nuevaPaginaTasaCero = await Promise.race([
            promesaNuevaPagina,
            new Promise((_, rechazar) =>
                setTimeout(() => rechazar(new Error('Timeout esperando nueva pestaña de Tasa Cero')),
                SELECTORES.tiempoEsperaNavegacion)
            )
        ]);

        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] [navegarATasaCero] Nueva pestaña detectada. Esperando frame "listado"...`);

        // En vez de dormir 2s a ciegas, sondeamos hasta que el frame "listado" no solo
        // EXISTA sino que tenga su contenido cargado (el <select> del periodo). Esperar
        // solo a que el frame exista devolvía demasiado pronto y el Paso 0.5 del
        // formulario se comía un timeout de 5s buscando el select. Tope de 8s.
        const TOPE_FRAME = 8000;
        const inicioEsperaFrame = Date.now();
        while (Date.now() - inicioEsperaFrame <= TOPE_FRAME) {
            const frameListado = nuevaPaginaTasaCero.frames().find(f => f.name() === 'listado');
            if (frameListado) {
                const tieneContenido = await frameListado.$('select').then(h => !!h).catch(() => false);
                if (tieneContenido) break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] [navegarATasaCero] Frame "listado" con contenido tras ${Date.now() - inicioEsperaFrame}ms de espera`);

        const urlNuevaPagina = nuevaPaginaTasaCero.url();
        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] ✅ [navegarATasaCero] Navegación exitosa a Tasa Cero. URL: ${urlNuevaPagina}`);
        console.log(`⏱️ [TIEMPO TOTAL navegarATasaCero: ${Date.now() - tiempoInicio}ms]`);

        return nuevaPaginaTasaCero;

    } catch (error) {
        console.error('❌ [navegarATasaCero] Error durante la navegación:', error.message);
        // El "no habilitado" ya trae un mensaje para la operadora: no lo envolvemos.
        if (error.code === SERVICIO_NO_HABILITADO) throw error;
        throw new Error(`No se pudo navegar a Tasa Cero: ${error.message}`);
    }
}

/**
 * Actualiza los selectores dinámicamente (útil para testing o configuración externa)
 * @param {Object} nuevosSelectores - Objeto con los selectores a actualizar
 */
function actualizarSelectores(nuevosSelectores) {
    Object.assign(SELECTORES, nuevosSelectores);
    console.log('[navegarATasaCero] Selectores actualizados:', SELECTORES);
}

module.exports = {
    navegarATasaCero,
    actualizarSelectores,
    SELECTORES,
    SERVICIO_NO_HABILITADO
};
