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

                        // Elegir el punto de venta. Para NOTAS conviene emitir desde el MISMO
                        // PV que la factura original (viene en datos.puntoVenta, ej. "00008").
                        // Comparamos por número (sin ceros a la izquierda) contra el value y el
                        // texto de cada opción. Si no vino o no matchea, caemos al comportamiento
                        // histórico: primer PV real (índice 1).
                        const objetivoPv = String(datos.puntoVenta || '').replace(/\D/g, '').replace(/^0+/, '')
                        let indicePv = 1
                        let encontradoPv = false
                        if (objetivoPv) {
                            for (let i = 0; i < listaPuntosDeVentas.options.length; i++) {
                                const op = listaPuntosDeVentas.options[i]
                                const valNum = String(op.value || '').replace(/\D/g, '').replace(/^0+/, '')
                                const txtNum = (String(op.text || '').match(/\d+/) || [''])[0].replace(/^0+/, '')
                                if (valNum === objetivoPv || txtNum === objetivoPv) {
                                    indicePv = i
                                    encontradoPv = true
                                    break
                                }
                            }
                            if (!encontradoPv) {
                                console.warn('[paso_0] No encontré el PV ' + datos.puntoVenta + ' en la lista; uso el primero. Opciones:',
                                    Array.from(listaPuntosDeVentas.options).map(function (o) { return o.value + '|' + o.text }))
                            }
                        }
                        listaPuntosDeVentas.selectedIndex = indicePv
                        listaPuntosDeVentas.onchange(indicePv)
                        let tipoDeComprobante = document.querySelector("#universocomprobante")

                        // Valor elegido por el usuario en el frontend (value del <option>
                        // de AFIP). Si no vino (datos viejos), caemos al hardcodeo histórico:
                        // B -> Factura B (19); C -> default de AFIP (Factura C).
                        let valorComprobante = datos.tipoComprobante
                        if (!valorComprobante && datos.tipoContribuyente === "B") {
                            valorComprobante = "19"
                        }

                        setTimeout(function () {
                            if (valorComprobante) {
                                tipoDeComprobante.value = valorComprobante
                            }
                            tipoDeComprobante.onchange()
                        }, 500);

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