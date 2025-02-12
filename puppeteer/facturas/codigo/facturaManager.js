// puppeteer/facturas/codigo/facturaManager.js

const puppeteerManager = require('../../puppeteer-manager');
const hacerFacturas = require('./hacerFacturas');

async function iniciarProceso(url, credenciales, datosProcesados) {
    let page;

    try {
        page = await puppeteerManager.nuevaPagina(url);
        page.setDefaultNavigationTimeout(60000);

        // Login process
        await page.waitForSelector('#F1\\:username');
        await page.type('#F1\\:username', credenciales.usuario);
        await page.waitForSelector('#F1\\:btnSiguiente');
        await page.click('#F1\\:btnSiguiente');
        await page.waitForSelector('#F1\\:password');
        await page.type('#F1\\:password', credenciales.contrasena);
        await page.waitForSelector('#F1\\:btnIngresar');
        await page.click('#F1\\:btnIngresar');

        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        const loggedIn = await page.evaluate(() => {
            return document.querySelector('#serviciosMasUtilizados > div > div > div > div:nth-child(5) > div > a') !== null;
        });


    } catch (error) {
        console.error("Error en iniciarProceso:", error);
        throw error;
    } finally {
        await puppeteerManager.cerrarNavegador();
    }
}

async function hacerFacturas(page, datosProcesados) {
    try {
        await hacerFacturas.ejecutar(page, datos);
        return { success: true, message: "Facturas generadas correctamente." };

    } catch (error) {
        console.error("Error en la automatización de facturas:", error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    iniciarProceso,
    hacerFacturas
};