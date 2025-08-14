const { launchBrowser } = require('./browserLauncher');
const puppeteer = require('puppeteer-core');

let browser = null; // Variable para almacenar la instancia del navegador

async function nuevaPagina(url, encabezados) {
  try {
    if (!browser || !browser.isConnected()) {
      browser = await launchBrowser();
    }

    const page = await browser.newPage();
    if (encabezados) {
      await page.setExtraHTTPHeaders(encabezados);
    }
    await page.goto(url, { waitUntil: 'networkidle2' });
    return page;
  } catch (error) {
    console.error('Error al abrir una nueva página:', error);
    throw error;
  }
}

async function cerrarNavegador() {
  try {
    if (browser && browser.isConnected()) {
      await browser.close();
      browser = null; // Resetea la variable del navegador
    }
  } catch (error) {
    console.error('Error al cerrar el navegador:', error);
    throw error;
  }
}

module.exports = { nuevaPagina, cerrarNavegador };