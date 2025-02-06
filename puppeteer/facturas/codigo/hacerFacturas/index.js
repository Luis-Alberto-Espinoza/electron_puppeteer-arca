// puppeteer/scripts/facturas/hacerFacturas/index.js
const { paso_0_generaComprobante } = require('./paso_0_generaComprobante');
const { paso_1_seleccionarPuntoDeVenta } = require('./paso_1_PuntosDeVentas');
const { elegirComprobanteEnLinea } = require('../../../elegirComprobanteEnLinea');

async function ejecutar(page, datos, iterador) {
    try {
        const resultadoComprobanteEnLinea = await elegirComprobanteEnLinea(page);
        if (resultadoComprobanteEnLinea.success) {
            const resultadoComprobante = await paso_0_generaComprobante(page, datos);
            if (resultadoComprobante.success) {
                const resultadoPuntoDeVenta = await paso_1_seleccionarPuntoDeVenta(page, datos);
                return resultadoPuntoDeVenta;
            } else {
                throw new Error("Error al generar el comprobante.");
            }
        } else {
            throw new Error("Error al seleccionar Comprobante en Línea.");
        }
    } catch (error) {
        console.error("Error en ejecutar:", error);
        throw error;
    }
}

module.exports = { ejecutar };