// src/backend/puppeteer/facturas/codigo/hacerFacturas/index.js

const { menuPrincipal } = require('./menuPrincipal');
const { paso_0_seleccionarPuntoDeVenta } = require('./paso_0_PuntosDeVentas');
const { paso_1_DatosDeEmision_Productos } = require('./paso_1_DatosDeEmision_Productos');
const { paso_1_DatosDeEmision_Servicio } = require('./paso_1_DatosDeEmision_Servicio');
const { paso_2_DatosDelReceptor } = require('./paso_2_DatosDelReceptor');
const { paso_3_DatosDeOperacion_Factura_B } = require('./paso_3_DatosDeOperacion_Factura_B');
const { paso_3_DatosDeOperacion_Factura_C } = require('./paso_3_DatosDeOperacion_Factura_C');
const { paso_4_ConfirmarFactura } = require('./paso_4_ConfirmarFactura');


const { elegirComprobanteEnLinea } = require('../../../elegirComprobanteEnLinea');
const { elegirPuntoDeVenta } = require('../../../elegirPuntoDeVenta');

async function ejecutar(page, datos) {
    try {
    

        let cantidad = datos.montoResultados.facturasGeneradas.length;
        let i = 3;
        const newPage = await elegirComprobanteEnLinea(page);
        const pagePuntoDeVenta = await elegirPuntoDeVenta(newPage);
       // do {
            const factura = datos.montoResultados.facturasGeneradas[i]; // Obtén los datos de la factura actual

            await menuPrincipal(pagePuntoDeVenta, factura); // Pasa 'factura' en lugar de 'datos'
            await paso_0_seleccionarPuntoDeVenta(pagePuntoDeVenta, factura);

          
            if (datos.tipoActividad === 'Producto') {
                await paso_1_DatosDeEmision_Productos(pagePuntoDeVenta, datos, factura);
            } else if (datos.tipoActividad === 'Servicio') {
                await paso_1_DatosDeEmision_Servicio(pagePuntoDeVenta, datos, factura);
            }
    
            await paso_2_DatosDelReceptor(pagePuntoDeVenta, datos);

            if(datos.tipoContribuyente === 'B'){
                await paso_3_DatosDeOperacion_Factura_B(pagePuntoDeVenta, datos, i);
            }  else if(datos.tipoContribuyente === 'C'){
                await paso_3_DatosDeOperacion_Factura_C(pagePuntoDeVenta, datos, i);
            }
            await paso_4_ConfirmarFactura(pagePuntoDeVenta);

    
            console.log("Flujo completado correctamente.");
            return { success: true, message: "Flujo completado" };
    } catch (error) {
        console.error("Error en ejecutar:", error);
        throw error;
    }
}
module.exports = { ejecutar };