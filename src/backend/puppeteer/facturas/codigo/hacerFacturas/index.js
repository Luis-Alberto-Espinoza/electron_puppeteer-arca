// src/backend/puppeteer/facturas/codigo/hacerFacturas/index.js

const { menuPrincipal } = require('./menuPrincipal');
const { paso_0_seleccionarPuntoDeVenta } = require('./paso_0_PuntosDeVentas');
const { paso_1_DatosDeEmision_Productos } = require('./paso_1_DatosDeEmision_Productos');
const { paso_1_DatosDeEmision_Servicio } = require('./paso_1_DatosDeEmision_Servicio');
const { elegirComprobanteEnLinea } = require('../../../elegirComprobanteEnLinea');
const { elegirPuntoDeVenta } = require('../../../elegirPuntoDeVenta');

async function ejecutar(page, datos) {
    try {

        console.log("Iniciando proceso de facturación...");
        console.dir(datos, { depth: null });
        console.log("Iniciando proceso de facturación...");
        console.log(datos.montoResultados.resultadoFacturas);
        console.log("aca esta la magnitud", datos.montoResultados.resultadoFacturas.length)
        let cantidad = datos.montoResultados.resultadoFacturas.length;
        let i = 0;
        const newPage = await elegirComprobanteEnLinea(page);
        const pagePuntoDeVenta = await elegirPuntoDeVenta(newPage);
        do {
            const factura = datos.montoResultados.resultadoFacturas[i]; // Obtén los datos de la factura actual
            console.log("Factura actual:", factura);

            await menuPrincipal(pagePuntoDeVenta, factura); // Pasa 'factura' en lugar de 'datos'
            await paso_0_seleccionarPuntoDeVenta(pagePuntoDeVenta, factura);

            if (datos.tipoActividad === 'Producto') { // Usa datos de 'factura'
                await paso_1_DatosDeEmision_Productos(pagePuntoDeVenta, datos, factura);
                console.log("Datos de emisión (producto) completados");
            } else if (datos.tipoActividad === 'Servicio') {
                await paso_1_DatosDeEmision_Servicio(pagePuntoDeVenta, datos, factura);
                console.log("Datos de emisión (servicio) completados");
            } else {
                throw new Error("Tipo de factura no válido");
            }

            i++;
        } while (i < cantidad);

        console.log("Factura generada correctamente.");
        return { success: true };
    } catch (error) {
        console.error("Error en ejecutar:", error);
        throw error;
    }
}
module.exports = { ejecutar };