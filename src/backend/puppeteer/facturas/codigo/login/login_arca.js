const { launchBrowser } = require('../../../browserLauncher');

async function hacerLogin(url, credenciales) {
  let browser;
  let page;
  try {
    browser = await launchBrowser();
    const pages = await browser.pages();
    if (pages.length > 1) {
      await pages[0].close();
    }
    page = pages.length > 0 ? pages[pages.length - 1] : await browser.newPage();
    await page.setViewport(null);

    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#F1\\:username', { visible: true });
    console.log('Campo de CUIT encontrado.');
    await page.type('#F1\\:username', credenciales.usuario);
    console.log('CUIT ingresado.');
    await Promise.all([
      page.click('#F1\\:btnSiguiente'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    console.log('Navegación a la página de clave completada.');
    await page.waitForSelector('#F1\\:password', { visible: true });
    console.log('Campo de clave encontrado.');
    await page.type('#F1\\:password', credenciales.contrasena);
    console.log('Clave ingresada.');
    await Promise.all([
      page.click('#F1\\:btnIngresar'),
      page.waitForNavigation({ waitUntil: 'networkidle2' })
    ]);
    console.log('Botón de login clicado y navegación completada.');

    page.on('close', () => {
      console.log('✅ Página de Puppeteer cerrada correctamente');
    });
    browser.on('disconnected', () => {
      console.log('✅ Browser de Puppeteer desconectado correctamente');
    });

    return page;
  } catch (error) {
    console.error('Error en hacerLogin:', error);
    try {
      if (page && !page.isClosed()) await page.close();
      if (browser && browser.isConnected()) await browser.close();
    } catch (cleanupError) {
      console.error('Error al limpiar recursos:', cleanupError);
    }
    throw error;
  }
}

module.exports = { hacerLogin };