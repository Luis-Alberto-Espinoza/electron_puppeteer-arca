async function paso_0_seleccionarPuntoDeVenta(newPage, datos) {
    try {
        await newPage.goto(newPage.url(), { waitUntil: 'networkidle2' });

        await newPage.evaluate((datos) => {
            if (window.location.href.includes('buscarPtosVtas')) {
                const listaPuntosDeVentas = document.querySelector("#puntodeventa");
                if (listaPuntosDeVentas) {
                    listaPuntosDeVentas.selectedIndex = 1;

                    // Disparar el evento 'change' (más robusto)
                    const changeEventPtoVenta = new Event('change');
                    listaPuntosDeVentas.dispatchEvent(changeEventPtoVenta);
                    const tipoComprobante = document.getElementById("universocomprobante");
                    setTimeout(() => {

                    }, 700);
                    for (let i = 0; i < tipoComprobante.options.length; i++) {
                        if (tipoComprobante.options[i].text === "Factura B") {
                            tipoComprobante.selectedIndex = i;

                            // Disparar el evento 'change' (recomendado)
                            const changeEvent = new Event('change');
                            tipoComprobante.dispatchEvent(changeEvent);
                            break; // Importante: Detener el bucle una vez encontrada la opción
                        }
                    }

                    const btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");
                    if (btnContinuar) {
                        setTimeout(() => {
                            btnContinuar.click();
                        }, 500);
                    } else {
                        console.error("No se encontró el botón 'Continuar'");
                    }
                } else {
                    console.error("No se encontró el tipo de comprobante");
                }
            } else {
                console.error("No se encontró la lista de puntos de venta");
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