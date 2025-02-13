// path del archivo original: src/backend/puppeteer/facturas/codigo/hacerFacturas/paso_2_DatosDeEmision_Productos.js

async function paso_2_DatosDeEmision_Productos(newPage, datos) {
    try {
        // No es necesario volver a cargar la página aquí, ya que ya deberías estar en la página correcta
        // await newPage.goto(newPage.url(), { waitUntil: 'networkidle2' });

        await newPage.evaluate((datos) => {
            // Envuelve el código dentro de un bloque try...catch para manejar errores dentro de evaluate
            try {
                if (window.location.href.includes('genComDatosEmisor') && datos.tipoActividad === 'Producto') {
                    // No necesitas la función esperarElementoEnDOM aquí, ya que Puppeteer tiene herramientas para eso

                    let inputFechas = document.querySelector("#fc");
                    if (inputFechas) {
                        // inputFechas.value = datos.arrayResultante[datos.arrayResultante.length - 1][0]; // Accede a los datos correctamente 
                        inputFechas.value = '13/02/2025'  // fecha provisora de prueba
                    } else {
                        console.error("No se encontró el input de fechas #fc");
                    }

                    let conceptoAincluir = document.querySelector("#idconcepto");
                    if (conceptoAincluir && conceptoAincluir.children && conceptoAincluir.children.length > 1) {
                        conceptoAincluir.children[1].selected = true;
                    } else {
                        console.error("No se encontró el select de concepto #idconcepto o no tiene suficientes opciones");
                    }

                    let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");
                    if (btnContinuar) {
                        btnContinuar.click();
                    } else {
                        console.error("No se encontró el botón 'Continuar'");
                    }
                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datosDeEmision:", datos.datosDeEmision);
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, datos);

        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }); // Aumenta el tiempo de espera a 120000 ms

        console.log("Script _2 Producto_ ejecutado correctamente.");
        return { success: true, message: "Datos de emisión (producto) completados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_2_DatosDeEmision_Productos };