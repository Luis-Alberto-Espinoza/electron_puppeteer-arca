const fecha = require('./utils.js');
const path = require('path');
const { fork } = require('child_process');

async function paso_1_DatosDeEmision_Servicio(newPage, datos, factura, modoTest = false) {
    try {
        await newPage.evaluate((datos, factura, modoTest) => {
            try {
                if (window.location.href.includes('genComDatosEmisor') && datos.tipoActividad === 'Servicio') {

                    let referencia = document.querySelector("#refComEmisor");
                    let inputFechas = document.querySelector("#fc");
                    let itemElegido = 3;

                    inputFechas.value = datos.fechaComprobante;

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
                    vto.value = datos.fechaComprobante;

                    referencia.value = "";
                    let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");

                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datos.tipoActividad:", datos.tipoActividad);
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, datos, factura, modoTest);

        if (modoTest) {
            const baseruta = path.join(__dirname, 'screenshots');
            const screenshotPath = path.join(baseruta, 'paso1_servicio.png');
            await newPage.screenshot({ path: screenshotPath });

            // Abrir la imagen en un proceso separado
            const visorProcess = fork(path.join(__dirname, 'visorImagen.js'));
            visorProcess.send({ screenshotPath });
        }

        // Esperar la navegación después de hacer clic en el botón
        await Promise.all([
            newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }), // Espera la navegación
            newPage.evaluate(() => {
                let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");
                btnContinuar.click(); // Haz clic en el botón
            })
        ]);

        console.log("Script _1_Servicio_ ejecutado correctamente.");
        return { success: true, message: "Datos de emisión (servicio) completados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_1_DatosDeEmision_Servicio };