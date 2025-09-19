/**
 * Navega a la sección de Plan de Pagos dentro de la Oficina Virtual,
 * interactuando con el menú dentro de un iframe.
 * @param {import('puppeteer').Page} page - La instancia de la página de Puppeteer.
 */
async function navegarAPlanDePago(page) {
  try {
    // Esperar que el iframe principal esté cargado
    const frameHandle = await page.waitForSelector('iframe[src="nucleo/inicio.zul"]');
    const frame = await frameHandle.contentFrame();

    if (!frame) {
      throw new Error('No se pudo encontrar el contentFrame del iframe.');
    }

    console.log('Navegando al menú de Plan de Pagos...');

    // Ejecutamos la lógica de clics en el menú dentro del iframe
    await frame.evaluate(() => {



      const menuItems = document.querySelectorAll('a[role="menuitem"]');

      if (menuItems.length < 6) {
        throw new Error("No se encontraron suficientes elementos en el menú para Plan de Pagos.");
      }

      // Clic en el 6to elemento del menú (índice 5)
      menuItems[5].click();

      // Se asume que el submenú aparece inmediatamente
      const submenus = document.getElementsByClassName("z-menupopup-content");
      if (submenus.length > 0 && submenus[0].childNodes.length > 0) {
        // Hacemos clic en el primer item del submenú
        submenus[0].childNodes[0].click();
        console.log("Clic en el submenú de Plan de Pagos realizado.");
      } else {
        throw new Error("El submenú de Plan de Pagos no apareció como se esperaba.");
      }


      
    });

    // Pausa para que la acción se complete.
    await new Promise(res => setTimeout(res, 2000));

    console.log('Navegación a Plan de Pagos completada.');

  } catch (error) {
    console.error('Error al navegar al Plan de Pagos:', error);
    throw new Error('Fallo el proceso de navegación al Plan de Pagos.');
  }
}

module.exports = { entrarPlanDePago : navegarAPlanDePago };