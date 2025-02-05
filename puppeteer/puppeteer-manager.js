// puppeteer-manager.js
const puppeteer = require('puppeteer-core');

let browser = null; // Variable para almacenar la instancia del navegador

async function nuevaPagina(url, encabezados) {
    try {
        if (!browser) { // Solo lanza el navegador si no existe uno
            browser = await puppeteer.launch({
                executablePath: '/snap/bin/chromium',
                headless: false, // Cambiar a true en producción
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security'
                ]
            });
        }
        const page = await browser.newPage();
        if (encabezados) {
            await page.setExtraHTTPHeaders(encabezados);
        }
        await page.goto(url, {waitUntil: 'networkidle2'}); //Espera a que la pagina carge
        return page;
    } catch (error) {
        console.error("Error al iniciar Puppeteer o navegar:", error);
        throw error; // Re-lanza el error para que se maneje en main.js
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