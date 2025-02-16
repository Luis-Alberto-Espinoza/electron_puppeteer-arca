const { fechaHoy } = require('./utils.js');


async function paso_3_DatosDeOperacion_Factura_B(newPage, datos, iterador) {
    try {


        // Verificar que la URL sea la correcta
        const urlActual = newPage.url();
        if (!urlActual.includes('genComDatosOperacion')) {
            throw new Error(`La URL actual (${urlActual}) no es la esperada.`);
        }

        // Esperar a que los elementos estén disponibles
        await newPage.waitForSelector('#detalle_medida1', { timeout: 120000 });

        // Ejecutar el código dentro de la página
        await newPage.evaluate((datos, iterador) => {
            try {


                if (window.location.href.includes('genComDatosOperacion') && datos.tipoContribuyente === 'C') {
                    const productosServicio = document.getElementById("detalle_descripcion1");
                    const detalleDescripcion = document.querySelector('#detalle_medida1');
                    const precioUnitario =  document.getElementById('detalle_precio1');
                    const alicuotaIva = document.querySelector("#detalle_tipo_iva1");
                    // Llenar los campos del formulario
                    productosServicio.value = `Factura del día ` + datos.montoResultados.facturasGeneradas[iterador][0];
                    detalleDescripcion.lastChild.selected = true;
                    precioUnitario.value = datos.montoResultados.facturasGeneradas[iterador][1];
                    alicuotaIva.value = 5;

                    // // Disparar eventos para validar los campos
                    precioUnitario.dispatchEvent(new Event('keyup'));
                    // precioUnitario.dispatchEvent(new Event('change'));
                    /*
                    */
                    // Validar campos (si es necesario)
                    if (typeof validarCampos === 'function') {
                        validarCampos();
                    }
                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datosDeOperacion:", datos.datosDeOperacion);
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, datos, iterador);

        console.log("Paso 3 completado correctamente.");
        return { success: true, message: "Datos de operación (Factura B) completados" };
    } catch (error) {
        console.error("Error al ejecutar el paso 3:", error);
        throw error;
    }
}

module.exports = { paso_3_DatosDeOperacion_Factura_B };