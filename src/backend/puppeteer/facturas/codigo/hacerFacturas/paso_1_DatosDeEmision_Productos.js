// path del archivo original: src/backend/puppeteer/facturas/codigo/hacerFacturas/paso_2_DatosDeEmision_Productos.js

async function paso_1_DatosDeEmision_Productos(newPage, datos, factura) {
    try {
        await newPage.evaluate((datos) => {
            try {
                if (window.location.href.includes('genComDatosEmisor') && datos.tipoActividad === 'Producto') {

                    let inputFechas = document.querySelector("#fc");
                        inputFechas.value = '13/02/2025'  // fecha provisora de prueba

                    let conceptoAincluir = document.querySelector("#idconcepto");
                        conceptoAincluir.children[1].selected = true;

                    let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");
                        btnContinuar.click();
                        console.error("No se encontró el botón 'Continuar'");
                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datosDeEmision:", datos.datosDeEmision);
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, datos);

        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }); // Aumenta el tiempo de espera a 120000 ms

        console.log("Script _1_Producto_ ejecutado correctamente.");
        return { success: true, message: "Datos de emisión (producto) completados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_1_DatosDeEmision_Productos };