/**
 * Navega a la sección de Retenciones/Percepciones dentro de la Oficina Virtual,
 * interactuando con el menú dentro de un iframe.
 * @param {import('puppeteer').Page} page - La instancia de la página de Puppeteer.
 * @param {number} submenuIndex - Índice del tipo de retención en el submenú:
 *   Estructura del menú:
 *   Índice 0: "Inscripciones" (NO procesar)
 *   Índice 1: "Reimprimir Certificado/Constancia" (NO procesar)
 *   Índice 2: "Retenciones/Percepciones I.B. hasta 03/2022" (NO procesar)
 *   Índice 3: "Retenciones SIRTAC I.B." ← EMPEZAR AQUÍ
 *   Índice 4: "Retenciones Comerciales SIRCAR I.B."
 *   Índice 5: "Percepciones Comerciales SIRCAR I.B."
 *   Índice 6: "Retenciones SIRCREB I.B."
 *   Índice 7: "Retenciones SIRCUPA I.B."
 */
async function navegarARetenciones(page, submenuIndex = 3) {
    const MAX_INTENTOS = 3;

    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
        try {
            // Esperar que el iframe principal esté cargado
            const frameHandle = await page.waitForSelector('iframe[src="nucleo/inicio.zul"]', { timeout: 10000 });
            const frame = await frameHandle.contentFrame();

            if (!frame) {
                throw new Error('No se pudo encontrar el contentFrame del iframe.');
            }

            console.log('Navegando al menú de Retenciones...');

            // Paso 1: Esperar a que el menú esté disponible
            await frame.waitForSelector('a[role="menuitem"]', { timeout: 10000 });

            // Paso 2: Hacer click en el menú principal (índice 2 = "Ingresos Brutos" o similar)
            const menuIndex = 2; // Índice del menú principal que contiene retenciones

            const clickMenuResult = await frame.evaluate((menuIdx) => {
                const menuItems = document.querySelectorAll('a[role="menuitem"]');
                if (menuItems.length <= menuIdx) {
                    return { success: false, error: `Solo hay ${menuItems.length} elementos en el menú, se esperaba al menos ${menuIdx + 1}` };
                }
                menuItems[menuIdx].click();
                return { success: true, totalMenuItems: menuItems.length };
            }, menuIndex);

            if (!clickMenuResult.success) {
                throw new Error(clickMenuResult.error);
            }

            // Paso 3: Esperar a que aparezca el submenú
            await frame.waitForSelector('.z-menupopup-content', { timeout: 5000 });

            // Dar tiempo al submenú para que se llene con los elementos
            await new Promise(resolve => setTimeout(resolve, 500));

            // Paso 4: Verificar y hacer click en el submenú
            const clickSubmenuResult = await frame.evaluate((submenuIdx) => {
                const submenus = document.getElementsByClassName('z-menupopup-content');

                if (submenus.length === 0) {
                    return { success: false, error: 'No se encontró ningún submenú' };
                }

                const submenu = submenus[0];
                const items = submenu.querySelectorAll('.z-menuitem');

                if (items.length === 0) {
                    // Intentar con childNodes como fallback
                    const childNodes = Array.from(submenu.childNodes).filter(n => n.nodeType === 1);
                    if (childNodes.length <= submenuIdx) {
                        return {
                            success: false,
                            error: `Submenú tiene ${childNodes.length} elementos (childNodes), se necesita índice ${submenuIdx}`,
                            elementos: childNodes.map(n => n.textContent?.trim().substring(0, 30))
                        };
                    }
                    childNodes[submenuIdx].click();
                    return { success: true, metodo: 'childNodes', totalItems: childNodes.length };
                }

                if (items.length <= submenuIdx) {
                    return {
                        success: false,
                        error: `Submenú tiene ${items.length} elementos, se necesita índice ${submenuIdx}`,
                        elementos: Array.from(items).map(i => i.textContent?.trim().substring(0, 30))
                    };
                }

                items[submenuIdx].click();
                return { success: true, metodo: 'z-menuitem', totalItems: items.length };
            }, submenuIndex);

            if (!clickSubmenuResult.success) {
                console.error('Error en submenú:', clickSubmenuResult);
                throw new Error(clickSubmenuResult.error);
            }

            // Paso 5: Esperar a que la navegación se complete
            await new Promise(resolve => setTimeout(resolve, 2000));

            console.log('Navegación a Retenciones completada.');
            return; // Éxito, salir de la función

        } catch (error) {
            console.error(`Error al navegar a retenciones (intento ${intento}/${MAX_INTENTOS}):`, error.message);

            if (intento < MAX_INTENTOS) {
                console.log(`Reintentando en 2 segundos...`);
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Intentar refrescar el frame antes de reintentar
                try {
                    await page.evaluate(() => {
                        const iframe = document.querySelector('iframe[src="nucleo/inicio.zul"]');
                        if (iframe) {
                            iframe.src = iframe.src; // Forzar recarga del iframe
                        }
                    });
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } catch (e) {
                    // Ignorar errores de recarga
                }
            } else {
                throw new Error('Fallo el proceso de navegación a retenciones después de múltiples intentos.');
            }
        }
    }
}

module.exports = { navegarARetenciones };
