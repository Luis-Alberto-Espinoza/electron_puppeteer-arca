/**
 * Navega a la sección de Constancia de Inscripción dentro de la Oficina Virtual,
 * interactuando con el menú dentro de un iframe.
 * @param {import('puppeteer').Page} page - La instancia de la página de Puppeteer.
 */
async function navegarAConstanciaFiscal(page) {
  try {
    // Esperar que el iframe principal esté cargado
    const frameHandle = await page.waitForSelector('iframe[src="nucleo/inicio.zul"]');
    const frame = await frameHandle.contentFrame();

    if (!frame) {
      throw new Error('No se pudo encontrar el contentFrame del iframe.');
    }

    console.log('Navegando al menú de Constancia de Inscripción...');

    // Esperar a que los elementos del menú estén disponibles
    await frame.waitForSelector('a[role="menuitem"]', { timeout: 10000 });

    // Paso 1: Hacer click en el elemento del menú principal
    const menuClickResult = await frame.evaluate(() => {
      const menuItems = document.querySelectorAll('a[role="menuitem"]');
      console.log(`Encontrados ${menuItems.length} elementos de menú`);

      if (menuItems.length < 3) {
        return { success: false, error: `Solo se encontraron ${menuItems.length} elementos en el menú.` };
      }

      // Clic en el 3er elemento del menú (índice 2)
      menuItems[2].click();
      return { success: true };
    });

    if (!menuClickResult.success) {
      throw new Error(menuClickResult.error);
    }

    // Paso 2: Esperar a que aparezca el submenú
    console.log('Esperando que aparezca el submenú...');
    await frame.waitForSelector('.z-menupopup-content', { visible: true, timeout: 5000 });

    // Pequeña pausa para que el submenú termine de renderizarse
    await new Promise(res => setTimeout(res, 500));

    // Paso 3: Hacer click en el submenú
    const submenuClickResult = await frame.evaluate(() => {
      const submenus = document.getElementsByClassName("z-menupopup-content");
      console.log(`Encontrados ${submenus.length} submenús`);

      // Buscar el submenú que esté visible y tenga hijos
      for (let i = 0; i < submenus.length; i++) {
        const submenu = submenus[i];
        if (submenu && submenu.childNodes && submenu.childNodes.length > 0) {
          // Verificar si está visible
          const style = window.getComputedStyle(submenu);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            console.log(`Haciendo click en submenú índice ${i} con ${submenu.childNodes.length} hijos`);
            submenu.childNodes[0].click();
            return { success: true, index: i };
          }
        }
      }

      return {
        success: false,
        error: `No se encontró submenú visible. Total submenús: ${submenus.length}`
      };
    });

    if (!submenuClickResult.success) {
      throw new Error(submenuClickResult.error);
    }

    console.log(`Clic en submenú realizado (índice ${submenuClickResult.index})`);

    // Esperar a que la navegación se complete
    await new Promise(res => setTimeout(res, 2000));

    console.log('Navegación a Constancia de Inscripción completada.');

  } catch (error) {
    console.error('Error al navegar a la constancia fiscal:', error);
    throw new Error('Fallo el proceso de navegación a la constancia fiscal.');
  }
}

module.exports = { navegarAConstanciaFiscal };