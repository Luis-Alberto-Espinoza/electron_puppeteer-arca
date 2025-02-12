const puppeteerManager = require('../../../puppeteer-manager');

async function hacerLogin(url, credenciales) {
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

        if (!loggedIn) {
            throw new Error("Credenciales incorrectas");
        }

        return page;
    } catch (error) {
        console.error("Error en hacerLogin:", error);
        throw error;
    }
}

module.exports = {
    hacerLogin
};