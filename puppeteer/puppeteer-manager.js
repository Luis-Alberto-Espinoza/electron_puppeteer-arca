// puppeteer/puppeteer-manager.js
const puppeteer = require('puppeteer');

let browser = null; // Variable para almacenar la instancia del navegador

async function nuevaPagina(url, encabezados) {
    try {
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null
        });

        const page = await browser.newPage();
        if (encabezados) {
            await page.setExtraHTTPHeaders(encabezados);
        }
        await page.goto(url, { waitUntil: 'networkidle2' });
        return page;
    } catch (error) {
        console.error("Error al abrir una nueva página:", error);
        throw error;
    }
}

async function cerrarNavegador() {
    try {
        if (browser) {
            await browser.close();
            browser = null; // Resetea la variable del navegador
        }
    } catch (error) {
        console.error("Error al cerrar el navegador:", error);
        throw error;
    }
}

module.exports = { nuevaPagina, cerrarNavegador };