/**
 * Navega a la sección de Retenciones/Percepciones dentro de la Oficina Virtual,
 * interactuando con el menú dentro de un iframe.
 * @param {import('puppeteer').Page} page - La instancia de la página de Puppeteer.
 * @param {number} submenuIndex - Índice del tipo:
 *   0 = Retenciones/Percepciones I.B. hasta 03/2022
 *   1 = Retenciones SIRTAC I.B.
 *   2 = Retenciones Comerciales SIRCAR I.B.
 *   3 = Percepciones Comerciales SIRCAR I.B.
 *   4 = Retenciones SIRCREB I.B.
 *   5 = Retenciones SIRCUPA I.B.
 */
async function navegarARetenciones(page, submenuIndex = 1) {
  try {
    // Esperar que el iframe principal esté cargado
    const frameHandle = await page.waitForSelector('iframe[src="nucleo/inicio.zul"]');
    const frame = await frameHandle.contentFrame();

    if (!frame) {
      throw new Error('No se pudo encontrar el contentFrame del iframe.');
    }

    console.log('Navegando al menú de Retenciones...');

    // Ejecutamos la lógica de clics en el menú dentro del iframe
    await frame.evaluate((submenuIndexParam) => {
      console.log('Ejecutando clics en el menú dentro del iframe...');

      // Capturar la url actual
      const currentUrl = window.location.href;
      console.log('URL actual del iframe:', currentUrl);

      // Verificar que existen elementos del menú
      if (!document.querySelector('a[role="menuitem"]')) {
        setTimeout(() => {
          page.goto(currentUrl);
          console.log('Redirigiendo a la URL actual del iframe...');
        }, 1000);
      }

      // Esperar antes de interactuar con los elementos
      const wait = (ms) => new Promise(res => setTimeout(res, ms));
      wait(1500);

      const menuItems = document.querySelectorAll('a[role="menuitem"]');

      if (menuItems.length === 0) {
        throw new Error("No se encontraron elementos en el menú.");
      }

      // TODO: Ajustar el índice del menItem según corresponda
      // Por ahora usamos el índice 2 como ejemplo (igual que constancia fiscal)
      // Deberás verificar cuál es el índice correcto para Retenciones
      const menuIndex = 2; // AJUSTAR SEGÚN NECESIDAD

      if (menuItems.length <= menuIndex) {
        throw new Error(`No se encontró el elemento del menú en el índice ${menuIndex}.`);
      }

      // Clic en el elemento del menú correspondiente
      menuItems[menuIndex].click();
      console.log(`Clic en menuItem[${menuIndex}] realizado.`);

      // Esperar a que aparezca el submenú
      const submenus = document.getElementsByClassName("z-menupopup-content");

      if (submenus.length > 0 && submenus[0].childNodes.length > 0) {
        if (submenus[0].childNodes.length <= submenuIndexParam) {
          throw new Error(`No se encontró el submenu en el índice ${submenuIndexParam}.`);
        }

        // Hacemos clic en el item del submenú
        submenus[0].childNodes[submenuIndexParam].click();
        console.log(`Clic en el submenú de Retenciones (índice ${submenuIndexParam}) realizado.`);
      } else {
        throw new Error("El submenú de retenciones no apareció como se esperaba.");
      }
    }, submenuIndex);

    // Esperar a que la navegación se complete
    await new Promise(res => setTimeout(res, 2000));

    console.log('Navegación a Retenciones completada.');

  } catch (error) {
    console.error('Error al navegar a retenciones:', error);
    throw new Error('Fallo el proceso de navegación a retenciones.');
  }
}

module.exports = { navegarARetenciones };
