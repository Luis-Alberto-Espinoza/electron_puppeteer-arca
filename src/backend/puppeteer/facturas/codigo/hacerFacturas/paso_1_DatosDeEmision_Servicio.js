// path del archivo original: src/backend/puppeteer/facturas/codigo/hacerFacturas/paso_1_DatosDeEmision_Servicio.js
const fecha = require('./utils.js');
async function paso_1_DatosDeEmision_Servicio(newPage, datos, factura) {
    try {
        await newPage.evaluate((datos, factura) => {
            try {
                if (window.location.href.includes('genComDatosEmisor') && datos.tipoActividad === 'Servicio') {

                    let referencia = document.querySelector("#refComEmisor");
                    let inputFechas = document.querySelector("#fc");
                    let itemElegido = 3;

                    // let fechaEmision = datos.arrayDatos && datos.arrayDatos.length > 0 ? datos.arrayDatos[datos.arrayDatos.length - 1][0] : '';
                    let longitudArray = datos.montoResultados.facturasGeneradas.length; // Asigna la fecha de emisión
                    let ultimaFecha = datos.montoResultados.facturasGeneradas[0][longitudArray - 1];
                    inputFechas.value = ultimaFecha;

                    let conceptoAincluir = document.querySelector("#idconcepto");
                    conceptoAincluir.value = itemElegido;
                    conceptoAincluir.onchange()

                    const desde = document.querySelector("#fsd");
                    const hasta = document.querySelector("#fsh");
                    const vto = document.querySelector("#vencimientopago");

                    desde.value = factura[0];
                    hasta.value = factura[0];
                    vto.value = ultimaFecha;

                    referencia.value = "";
                    let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");

                    setTimeout(function () {
                        btnContinuar.click();
                      }, 300);

                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datos.tipoActividad:", datos.tipoActividad);
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, datos, factura);

        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

        console.log("Script _1_Servicio_ ejecutado correctamente.");
        return { success: true, message: "Datos de emisión (servicio) completados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_1_DatosDeEmision_Servicio };