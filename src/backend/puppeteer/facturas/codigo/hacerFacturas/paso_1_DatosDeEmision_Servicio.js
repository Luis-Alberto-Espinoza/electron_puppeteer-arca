// path del archivo original: src/backend/puppeteer/facturas/codigo/hacerFacturas/paso_1_DatosDeEmision_Servicio.js
const fecha = require('./utils.js');
async function paso_1_DatosDeEmision_Servicio(newPage, datos, factura) {
    try {
        await newPage.evaluate((datos, fecha) => {
            try {
                if (window.location.href.includes('genComDatosEmisor') && datos.tipoActividad === 'Servicio') {

                    let referencia = document.querySelector("#refComEmisor");
                    let inputFechas = document.querySelector("#fc");
                    let itemElegido = 3;

                    let fechaEmision = datos.arrayDatos && datos.arrayDatos.length > 0 ? datos.arrayDatos[datos.arrayDatos.length - 1][0] : '';

                    //inputFechas.value = fechaEmision; // Asigna la fecha de emisión
                    inputFechas.value = fecha; // Asigna la fecha de emisión

                    let conceptoAincluir = document.querySelector("#idconcepto");
                    conceptoAincluir.value = itemElegido;
                    conceptoAincluir.onchange()

                    const desde = document.querySelector("#fsd");
                    const hasta = document.querySelector("#fsh");
                    const vto = document.querySelector("#vencimientopago");

                    const fechaDesde = datos.arrayDatos && datos.arrayDatos.length > datos.iterador ? datos.arrayDatos[datos.iterador][0] : '';

                    /*
                    desde.value = fechaDesde;
                    hasta.value = fechaDesde;
                    vto.value = fechaEmision;
                    */

                    desde.value = fecha;
                    hasta.value = fecha;
                    vto.value = fecha;
                    referencia.value = ""; 

                    let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");

                    btnContinuar.click();

                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datos.tipoActividad:", datos.tipoActividad);
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, datos, fecha);

        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }); 

        console.log("Script _1_Servicio_ ejecutado correctamente.");
        return { success: true, message: "Datos de emisión (servicio) completados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_1_DatosDeEmision_Servicio };