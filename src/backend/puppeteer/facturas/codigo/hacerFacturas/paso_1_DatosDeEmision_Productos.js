const fecha = require('./utils.js');
// path del archivo original: src/backend/puppeteer/facturas/codigo/hacerFacturas/paso_2_DatosDeEmision_Productos.js
// const { formatDate, DD_MM_YYYY, YYYY_MM_DD_HH_MM_SS } = require ('../../../../../utils/dateTime'); // Cambiar la ruta por la correcta, por ejemplo: require('../../utils/dateTime');
// /src/utils/dateTime.js');

// Obtener la fecha actual

async function paso_1_DatosDeEmision_Productos(newPage, datos, factura, test) {
    console.log("test", test)

    try {
        await newPage.evaluate((datos, test) => {
            try {
                if (window.location.href.includes('genComDatosEmisor') && datos.tipoActividad === 'Producto') {

                    let inputFechas = document.querySelector("#fc");
                    let ultimoArray = datos.montoResultados.facturasGeneradas[datos.montoResultados.facturasGeneradas.length - 1];
                    let ultimaFecha = ultimoArray[0];
                    inputFechas.value = "09/04/2025";
                    // inputFechas.value = ultimaFecha;

                    let conceptoAincluir = document.querySelector("#idconcepto");
                    conceptoAincluir.children[1].selected = true;

                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datosDeEmision:", datos.datosDeEmision);
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, datos, test);

        if (test) {
            console.log("Ejecutando en modo test, que tiene test.", test);
            await newPage.screenshot({ path: `fecha_de_Emision_26.png` });
        }

        // Toma una captura de pantalla antes de hacer clic en el botón
        // const screenshotPath = `screenshots/${ultimaFecha}_paso1_producto.png`;
        // await newPage.screenshot({ path: screenshotPath });
        // console.log(`Captura de pantalla guardada en: ${screenshotPath}`);

        // Esperar la navegación después de hacer clic en el botón
        await Promise.all([
            newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }), // Espera la navegación
            newPage.evaluate(() => {
                let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");
                btnContinuar.click(); // Haz clic en el botón
            })
        ]);

        console.log("Script _1_Producto_ ejecutado correctamente.");
        return { success: true, message: "Datos de emisión (producto) completados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_1_DatosDeEmision_Productos };