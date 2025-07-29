// path del archivo original: src/backend/puppeteer/facturas/codigo/hacerFacturas/paso_1_DatosDeEmision_Servicio.js
const fecha = require('./utils.js');
async function paso_1_DatosDeEmision_Servicio(newPage, datos, factura, modoTest = false) {
    try {
        await newPage.evaluate((datos, factura, modoTest) => {
            try {
                if (window.location.href.includes('genComDatosEmisor') && datos.tipoActividad === 'Servicio') {

                    let referencia = document.querySelector("#refComEmisor");
                    let inputFechas = document.querySelector("#fc");
                    let itemElegido = 3;

                    // let fechaEmision = datos.arrayDatos && datos.arrayDatos.length > 0 ? datos.arrayDatos[datos.arrayDatos.length - 1][0] : '';
                    let longitudArray = datos.montoResultados.facturasGeneradas.length; // Asigna la fecha de emisión
                    let ultimaFecha = datos.montoResultados.facturasGeneradas[longitudArray - 1][0];
                    // inputFechas.value = ultimaFecha;
                    inputFechas.value = '29/07/2025';
                    console.log("$$$$$$$$$##### ====>>>>>>",datos.montoResultados.facturasGeneradas)
                    console.log("\n\n$$$$$$$$$##### ====>>>>>>",factura)

                    let conceptoAincluir = document.querySelector("#idconcepto");
                    conceptoAincluir.value = itemElegido;
                    
                    setTimeout(() => {
                        conceptoAincluir.onchange();
                        
                        setTimeout(() => {
                        }, 50); // 50ms de espera
                        
                    }, 100); // 100ms de espera
                    const desde = document.querySelector("#fsd");
                    const hasta = document.querySelector("#fsh");
                    const vto = document.querySelector("#vencimientopago");

                    desde.value = factura[0];
                    hasta.value = factura[0];
                    vto.value = '29/07/2025';
                    // vto.value = ultimaFecha;

                    referencia.value = "";
                    let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");

                    setTimeout(function () {

                        console.log("Esto esta en el punto uno que tiene modoTest ", modoTest);
                        // Toma una captura de pantalla antes de hacer clic en el botón
                        // const screenshotPath = `screenshots/${ultimaFecha}_paso1_servicio.png`;

                        // newPage.screenshot({ path: screenshotPath });
                        // console.log(`Captura de pantalla guardada en: ${screenshotPath}`);
                        // Haz clic en el botón
                         btnContinuar.click();
                      }, 300);

                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datos.tipoActividad:", datos.tipoActividad);
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, datos, factura, modoTest);

        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

        console.log("Script _1_Servicio_ ejecutado correctamente.");
        return { success: true, message: "Datos de emisión (servicio) completados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_1_DatosDeEmision_Servicio };