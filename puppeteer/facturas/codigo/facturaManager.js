// puppeteer/facturas/codigo/facturaManager.js

const puppeteerManager = require('../../puppeteer-manager');
const hacerFacturas = require('./hacerFacturas');

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
    hacerFacturas
};