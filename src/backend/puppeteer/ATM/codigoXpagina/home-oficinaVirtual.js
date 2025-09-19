/**
 * Busca y hace clic en el botón "Oficina Virtual" y espera la navegación.
 * @param {import('puppeteer').Page} async function irAOficinaVirtual(browser) { // ¡Ahora recibe browser, no page!
 - La instancia de la página de Puppeteer.
 */
async function irAOficinaVirtual(page) {
  try {
    // console.log('Buscando el botón de "Oficina Virtual"...');

    const browser = page.browser();

    const newPagePromise = new Promise(resolve => browser.once('targetcreated', async target => {
      if (target.type() === 'page') {
        const newPage = await target.page();
        await newPage.bringToFront();
        resolve(newPage);
      }
    }));
    // const currentUrl = window.location.href;
    // console.log('URL actual del iframe:', currentUrl);




    await page.click('a.btn.btn-ofv-3[title="Abrir Oficina Virtual"]');
    const newPage = await newPagePromise;

    // Manejar alert JS si aparece (evento dialog)
    newPage.on('dialog', async dialog => {
      console.log('Dialog detectado:', dialog.message());
      await dialog.accept();
    });

    // Esperar un poco a que cargue
    await new Promise(resolve => setTimeout(resolve, 2000));

    // También intentar cerrar modal HTML si aparece
    try {
      await newPage.waitForSelector('button, .modal button', { timeout: 3000 });
      // Intenta hacer click en el primer botón visible (Aceptar/Cancelar)
      await newPage.click('button, .modal button');
      // console.log('Botón de modal HTML clickeado');
    } catch (e) {
      // Si no aparece el modal, sigue normalmente
      // console.log('No se detectó modal HTML, continuando...');
    }

    // console.log('Nueva pestaña lista');
    return newPage;

  } catch (error) {
    console.error('Error al intentar ir a la Oficina Virtual:', error);
    throw new Error('Fallo al navegar a la Oficina Virtual.');
  }
}

module.exports = { entrarOficinaVirtual: irAOficinaVirtual };