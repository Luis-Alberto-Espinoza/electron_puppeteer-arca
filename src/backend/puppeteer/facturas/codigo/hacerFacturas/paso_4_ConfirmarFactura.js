const { fechaHoy } = require('./utils.js');

async function paso_4_ConfirmarFactura(newPage, test) {
    try {
        // Esperar a que los elementos estén disponibles
        await newPage.waitForSelector('#contenido', { timeout: 120000 });

        // Ejecutar el código dentro de la página
        await newPage.evaluate((test) => {
            try {
                if (window.location.href.includes('genComResumenDatos')) {
                    window.scrollTo(0, document.body.scrollHeight);
                    let btnMenuPrinvipalVolver = document.querySelectorAll('input');
                    if (!test) {
                        //ajaxFunction();
                    }

                    setTimeout(function () {
                        if (!test) {
                            btnMenuPrinvipalVolver[3].click();
                        }
                    }, 2500);
                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "genComResumenDatos:");
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, test);

        // Esperar la navegación después de hacer clic en el botón
        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

        console.log("paso_4_ConfirmarFactura");
        return { success: true, message: "Confirmacion de la operación completados" };
    } catch (error) {
        console.error("Error al ejecutar el paso 4:", error);
        throw error;
    }
}

module.exports = { paso_4_ConfirmarFactura };