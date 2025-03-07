const puppeteer = require('puppeteer');

async function hacerLogin(url, credenciales) {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Esperar a que la página de login esté completamente cargada
        await page.waitForSelector('#F1\\:username', { visible: true });
        console.log("Campo de CUIT encontrado.");

        // Ingresar el CUIT
        await page.type('#F1\\:username', credenciales.usuario);
        console.log("CUIT ingresado.");

        // Hacer clic en el botón "Siguiente" y esperar a que aparezca la nueva página
        await Promise.all([
            page.click('#F1\\:btnSiguiente'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);
        console.log("Navegación a la página de clave completada.");

        // Esperar a que la página de clave esté completamente cargada
        await page.waitForSelector('#F1\\:password', { visible: true });
        console.log("Campo de clave encontrado.");

        // Ingresar la clave
        await page.type('#F1\\:password', credenciales.contrasena);
        console.log("Clave ingresada.");

        // Hacer clic en el botón de login y esperar a que la navegación termine
        await Promise.all([
            page.click('#F1\\:btnIngresar'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);
        console.log("Botón de login clicado y navegación completada.");

        // Verificar si el login fue exitoso
        // const loginExitoso = await page.evaluate(() => {
        //     return document.querySelector('#some-element-after-login') !== null;
        // });

        // if (!loginExitoso) {
        //     throw new Error('Login fallido');
        // }

        return page;
    } catch (error) {
        console.error("Error en hacerLogin:", error);
        // No cerrar el navegador automáticamente para depuración
        // await browser.close();
        throw error;
    }
}

module.exports = { hacerLogin };