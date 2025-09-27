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

    // Ejecutamos la lógica de clics en el menú dentro del iframe
    await frame.evaluate(() => {
      console.log('Ejecutando clics en el menú dentro del iframe...');
      //capturar la url actual
      const currentUrl = window.location.href;
      console.log('URL actual del iframe:', currentUrl);

      //

      if (!document.querySelector('a[role="menuitem"]')) {
        setTimeout(() => {
          page.goto(currentUrl);
          console.log('Redirigiendo a la URL actual del iframe...');
        }, 1000);
      }

      // antes de interactuar con los elementos
      const wait = (ms) => new Promise(res => setTimeout(res, ms));
      wait(1500);

      const menuItems = document.querySelectorAll('a[role="menuitem"]');

      if (menuItems.length < 4) {
        throw new Error("No se encontraron suficientes elementos en el menú.");
      }

      // Clic en el 4to elemento del menú (índice 3)
      menuItems[3].click();

      // El script original asume que el submenú aparece inmediatamente.
      const submenus = document.getElementsByClassName("z-menupopup-content");
      if (submenus.length > 0 && submenus[0].childNodes.length > 0) {
        // Hacemos clic en el primer item del submenú
        submenus[0].childNodes[0].click();
        console.log("Clic en el submenú de Constancia Fiscal realizado.");
      } else {
        throw new Error("El submenú de constancia fiscal no apareció como se esperaba.");
      }
    });

    // Después de los clics, es buena idea esperar a que algo cambie en la página.
    // Aquí podríamos esperar a un selector específico que aparezca en la nueva vista.
    // Por ahora, una pequeña pausa para asegurar que la acción se complete.
    await new Promise(res => setTimeout(res, 2000));

    console.log('Navegación a Constancia de Inscripción completada.');

  } catch (error) {
    console.error('Error al navegar a la constancia fiscal:', error);
    throw new Error('Fallo el proceso de navegación a la constancia fiscal.');
  }
}

module.exports = { navegarAConstanciaFiscal };