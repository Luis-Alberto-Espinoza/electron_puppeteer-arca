// Espera máxima a que AFIP recargue la lista de tipos de comprobante tras elegir el PV.
const TIMEOUT_TIPO_COMPROBANTE = 15000;

async function paso_0_seleccionarPuntoDeVenta(newPage, datos) {
    try {
        await newPage.goto(newPage.url(), { waitUntil: 'networkidle2' });

        if (newPage.url().includes('buscarPtosVtas')) {
            await newPage.waitForSelector('#puntodeventa', { timeout: 30000 });

            // Elegir el punto de venta. Para NOTAS conviene emitir desde el MISMO
            // PV que la factura original (viene en datos.puntoVenta, ej. "00008").
            // Comparamos por número (sin ceros a la izquierda) contra el value y el
            // texto de cada opción. Si no vino o no matchea, caemos al comportamiento
            // histórico: primer PV real (índice 1).
            const pv = await newPage.evaluate((puntoVenta) => {
                const listaPuntosDeVentas = document.querySelector('#puntodeventa');
                const objetivoPv = String(puntoVenta || '').replace(/\D/g, '').replace(/^0+/, '');
                let indicePv = 1;
                let encontradoPv = false;
                if (objetivoPv) {
                    for (let i = 0; i < listaPuntosDeVentas.options.length; i++) {
                        const op = listaPuntosDeVentas.options[i];
                        const valNum = String(op.value || '').replace(/\D/g, '').replace(/^0+/, '');
                        const txtNum = (String(op.text || '').match(/\d+/) || [''])[0].replace(/^0+/, '');
                        if (valNum === objetivoPv || txtNum === objetivoPv) {
                            indicePv = i;
                            encontradoPv = true;
                            break;
                        }
                    }
                }
                listaPuntosDeVentas.selectedIndex = indicePv;
                listaPuntosDeVentas.onchange(indicePv);
                return {
                    objetivoPv,
                    encontradoPv,
                    opciones: Array.from(listaPuntosDeVentas.options).map(o => o.value + '|' + o.text.trim())
                };
            }, datos.puntoVenta);

            if (pv.objetivoPv && !pv.encontradoPv) {
                console.warn(`[paso_0] No encontré el PV ${datos.puntoVenta} en la lista; uso el primero. Opciones:`, pv.opciones);
            }

            // Al cambiar el PV, AFIP recarga por detrás la lista #universocomprobante.
            // Antes se esperaban 500 ms fijos: si AFIP tardaba más, el tipo no quedaba
            // elegido y Continuar no avanzaba (timeout de 2 min). Ahora esperamos la
            // señal: red quieta + la opción buscada presente en la lista.
            await newPage.waitForNetworkIdle({ idleTime: 500, timeout: TIMEOUT_TIPO_COMPROBANTE }).catch(() => {});

            // Valor elegido por el usuario en el frontend (value del <option>
            // de AFIP). Si no vino (datos viejos), caemos al hardcodeo histórico:
            // B -> Factura B (19); C -> default de AFIP (Factura C).
            let valorComprobante = datos.tipoComprobante;
            if (!valorComprobante && datos.tipoContribuyente === 'B') {
                valorComprobante = '19';
            }
            valorComprobante = valorComprobante ? String(valorComprobante) : null;

            try {
                await newPage.waitForFunction((valor) => {
                    const select = document.querySelector('#universocomprobante');
                    if (!select) return false;
                    return valor
                        ? Array.from(select.options).some(o => o.value === valor)
                        : select.options.length > 0;
                }, { timeout: TIMEOUT_TIPO_COMPROBANTE }, valorComprobante);
            } catch (_) {
                const disponibles = await newPage.evaluate(() => {
                    const select = document.querySelector('#universocomprobante');
                    return select ? Array.from(select.options).map(o => `${o.value}=${o.text.trim()}`).join(', ') : '(sin lista)';
                });
                throw new Error(
                    `AFIP no ofrece el tipo de comprobante ${valorComprobante || '(default)'} en el punto de venta elegido. ` +
                    `Opciones disponibles: ${disponibles || '(ninguna)'}`
                );
            }

            const quedo = await newPage.evaluate((valor) => {
                const tipoDeComprobante = document.querySelector('#universocomprobante');
                if (valor) tipoDeComprobante.value = valor;
                tipoDeComprobante.onchange();
                return tipoDeComprobante.value;
            }, valorComprobante);

            if (valorComprobante && quedo !== valorComprobante) {
                throw new Error(`No quedó seleccionado el tipo de comprobante ${valorComprobante} (quedó "${quedo}").`);
            }

            // Continuar: esperamos la navegación en paralelo al click para no perderla.
            await Promise.all([
                newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }),
                newPage.evaluate(() => {
                    const btnContinuar = document.querySelector('#contenido > form > input[type=button]:nth-child(4)');
                    setTimeout(() => btnContinuar.click(), 0);
                })
            ]);
        } else {
            await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });
        }

        console.log("Script _0_ ejecutado correctamente.");
        return { success: true, message: "Punto de venta y tipo de comprobante seleccionados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_0_seleccionarPuntoDeVenta };
