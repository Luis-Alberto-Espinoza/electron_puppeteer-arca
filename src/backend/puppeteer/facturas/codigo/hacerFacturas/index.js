// src/backend/puppeteer/facturas/codigo/hacerFacturas/index.js

const { paso_0_generaComprobante } = require('./paso_0_generaComprobante');
const { paso_1_seleccionarPuntoDeVenta } = require('./paso_1_PuntosDeVentas');
const { elegirComprobanteEnLinea } = require('../../../elegirComprobanteEnLinea');
const { elegirPuntoDeVenta } = require('../../../elegirPuntoDeVenta');

async function ejecutar(page, datos) {
    try {
        const newPage = await elegirComprobanteEnLinea(page);

        const pagePuntoDeVenta = await elegirPuntoDeVenta(newPage); // Obtiene la página después de seleccionar la empresa

        const resultadoComprobante = await paso_0_generaComprobante(pagePuntoDeVenta, datos); // Llama a paso_0_generaComprobante desde index.js
        if (resultadoComprobante.success) {
            const resultadoPuntoDeVenta = await paso_1_seleccionarPuntoDeVenta(pagePuntoDeVenta, datos); // Llama a paso_1_seleccionarPuntoDeVenta desde index.js
            return resultadoPuntoDeVenta;
        } else {
            throw new Error("Error al generar el comprobante.");
        }
    } catch (error) {
        console.error("Error en ejecutar:", error);
        throw error;
    }
}

module.exports = { ejecutar };