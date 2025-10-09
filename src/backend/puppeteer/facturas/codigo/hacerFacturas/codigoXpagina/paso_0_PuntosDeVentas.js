async function paso_0_seleccionarPuntoDeVenta(newPage, datos) {
    try {
        await newPage.goto(newPage.url(), { waitUntil: 'networkidle2' });

        await newPage.evaluate((datos) => {


            function esperarElementoEnDOM(selector, maxIntentos = 10, intervalo = 100) {
                return new Promise((resolve, reject) => {
                    let intentos = 0;

                    function verificarElemento() {
                        let elemento = document.querySelector(selector);
                        if (elemento) {
                            resolve(elemento);
                        } else {
                            intentos++;
                            if (intentos >= maxIntentos) {
                                reject(new Error(`Elemento ${selector} no encontrado después de ${maxIntentos} intentos`));
                            } else {
                                setTimeout(verificarElemento, intervalo);
                            }
                        }
                    }
                    verificarElemento();
                });
            }


            if (window.location.href.includes('buscarPtosVtas')) {

                esperarElementoEnDOM("#puntodeventa")
                    .then((elemento) => {
                        const listaPuntosDeVentas = elemento
                        listaPuntosDeVentas.selectedIndex = 1
                        listaPuntosDeVentas.onchange(1)
                        let tipoDeComprobante = document.querySelector("#universocomprobante")
                        if (datos.tipoContribuyente === "B") {
                            setTimeout(function () {
                                tipoDeComprobante.value = 19
                            }, 500);
                        }
                        tipoDeComprobante.onchange()

                        let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)")
                        setTimeout(function () {
                            btnContinuar.click()
                        }, 500);
                    })
                    .catch((error) => {
                        console.error(error);
                    });
            }
        }, datos);

        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }); // Aumenta el tiempo de espera a 120000 ms

        console.log("Script _0_ ejecutado correctamente.");
        return { success: true, message: "Punto de venta y tipo de comprobante seleccionados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_0_seleccionarPuntoDeVenta };