const puppeteer = require('puppeteer');
const { elegirComprobanteEnLinea } = require('./elegirComprobanteEnLinea');

async function automatizarLogin(url, credenciales) {
    let browser;
    let page;

    try {
        browser = await puppeteer.launch({
            headless: false,
            defaultViewport: null
        });

        page = await browser.newPage();
        page.setDefaultNavigationTimeout(60000);
        await page.goto(url);

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

        if (loggedIn) {
            const resultado = await elegirComprobanteEnLinea(browser, page);
            return resultado;
        } else {
            return { success: false, message: "Credenciales incorrectas" };
        }
    } catch (error) {
        // No cerrar el navegador en caso de error
        throw error;
    }
}

module.exports = { automatizarLogin };
