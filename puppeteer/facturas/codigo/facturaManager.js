// automatizaciones/facturas/facturaManager.js

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

        if (loggedIn) {
            const resultado = await hacerFacturas.ejecutar(page, datosProcesados);
            return resultado;
        } else {
            return { success: false, message: "Credenciales incorrectas" };
        }
    } catch (error) {
        console.error("Error en iniciarProceso:", error);
        throw error;
    } finally {
        await puppeteerManager.cerrarNavegador();
    }
}

module.exports = {
    iniciarProceso,
    // *** AHORA RECIBE datosProcesados COMO ARGUMENTO ***
    hacerFacturas: async (page, datosProcesados) => {
        try {
            console.log("########### datosProcesados ", datosProcesados);

            let iterador = 0;
            async function pasos(page, datos, iterador) {
                console.log("########### datos ", datos);

                try {
                    await hacerFacturas.ejecutar(page, datos, iterador);
                    if (datos.arrayDatos && datos.arrayDatos.length > iterador + 1) {
                        iterador++;
                        await pasos(page, datos, iterador);
                    }
                } catch (error) {
                    console.error("Error en una automatización:", error);
                    throw error;
                }
            }
            await pasos(page, datosProcesados, iterador);
            return { success: true, message: "Facturas generadas correctamente." };
        } catch (error) {
            console.error("Error en la automatización de facturas:", error);
            return { success: false, error: error.message };
        }
    },
    // ... otras funciones ...
};