/**
 * Paso 3 - Datos de Operación (VERSIÓN UNIFICADA - REHECHO CORRECTAMENTE)
 *
 * Unifica paso_3_DatosDeOperacion_Factura_C.js y paso_3_DatosDeOperacion_Cliente.js
 * copiando EXACTAMENTE el código que funciona.
 *
 * Diferencia:
 * - Normal: Una sola línea (usa datos.montoResultados.facturasGeneradas[iterador])
 * - Cliente: Múltiples líneas (usa datos.lineasDetalle)
 *
 * Detecta automáticamente según datos.lineasDetalle
 */

// Función auxiliar para esperar (COPIADA EXACTA)
function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function paso_3_DatosDeOperacion_Unificado(newPage, datos, iterador) {
    try {
        // Verificar que la URL sea la correcta (COPIADO EXACTO)
        const urlActual = newPage.url();
        if (!urlActual.includes('genComDatosOperacion')) {
            throw new Error(`La URL actual (${urlActual}) no es la esperada.`);
        }

        // Detectar si es modo cliente (múltiples líneas) o normal (una línea)
        const esModoCliente = datos.lineasDetalle && Array.isArray(datos.lineasDetalle) && datos.lineasDetalle.length > 0;

        if (esModoCliente) {
            // ==========================================
            // MODO CLIENTE (COPIADO EXACTO de paso_3_DatosDeOperacion_Cliente.js)
            // ==========================================
            console.log("Ejecutando paso_3 modo cliente...");
            console.log("Líneas de detalle:", datos.lineasDetalle);

            // Esperar a que los elementos estén disponibles
            await newPage.waitForSelector('#detalle_descripcion1', { timeout: 120000 });

            // Procesar cada línea de detalle
            for (let i = 0; i < datos.lineasDetalle.length; i++) {
                const linea = datos.lineasDetalle[i];
                const numeroLinea = i + 1;

                console.log(`Procesando línea ${numeroLinea}/${datos.lineasDetalle.length}...`);

                // Si no es la primera línea, agregar nueva línea
                if (i > 0) {
                    await newPage.evaluate(() => {
                        // Hacer clic en el botón "Agregar línea descripción"
                        const btnAgregarLinea = document.querySelector('input[value="Agregar línea descripción"]');
                        if (btnAgregarLinea) {
                            btnAgregarLinea.click();
                            // Ejecutar ajax para mantener sesión activa si existe
                            if (typeof ajaxMantenerSesionActiva === 'function') {
                                ajaxMantenerSesionActiva();
                            }
                        } else {
                            console.error("No se encontró el botón 'Agregar línea descripción'");
                        }
                    });

                    // Esperar a que se agregue la nueva línea
                    await newPage.waitForSelector(`#detalle_descripcion${numeroLinea}`, { timeout: 10000 });
                }

                // Llenar la línea actual
                await newPage.evaluate((linea, numeroLinea, tipoContribuyente) => {
                    try {
                        // Descripción
                        const descripcion = document.getElementById(`detalle_descripcion${numeroLinea}`);
                        if (descripcion) {
                            descripcion.value = linea.descripcion;
                            descripcion.dispatchEvent(new Event('input'));
                        } else {
                            console.error(`No se encontró #detalle_descripcion${numeroLinea}`);
                        }

                        // Unidad de medida
                        const unidadMedida = document.querySelector(`#detalle_medida${numeroLinea}`);
                        if (unidadMedida) {
                            // Si se especificó un valor, usarlo; si no, usar la última opción
                            if (linea.unidadMedida !== undefined) {
                                unidadMedida.value = linea.unidadMedida;
                            } else {
                                // Seleccionar la última opción (comportamiento por defecto)
                                unidadMedida.lastChild.selected = true;
                            }
                            unidadMedida.dispatchEvent(new Event('change'));
                        } else {
                            console.error(`No se encontró #detalle_medida${numeroLinea}`);
                        }

                        // Cantidad (si existe el campo)
                        const cantidad = document.getElementById(`detalle_cantidad${numeroLinea}`);
                        if (cantidad) {
                            cantidad.value = linea.cantidad || 1;
                            cantidad.dispatchEvent(new Event('input'));
                        }

                        // Precio unitario
                        const precioUnitario = document.getElementById(`detalle_precio${numeroLinea}`);
                        if (precioUnitario) {
                            precioUnitario.value = linea.precioUnitario;
                            precioUnitario.dispatchEvent(new Event('input'));

                            // Disparar evento keyup para que AFIP calcule el total
                            setTimeout(() => {
                                precioUnitario.dispatchEvent(new Event('keyup'));
                            }, 500);
                        } else {
                            console.error(`No se encontró #detalle_precio${numeroLinea}`);
                        }

                        // Alícuota IVA (solo para tipo B)
                        if (tipoContribuyente === 'B' && linea.alicuotaIVA !== undefined) {
                            const alicuotaIva = document.querySelector(`#detalle_tipo_iva${numeroLinea}`);
                            if (alicuotaIva) {
                                alicuotaIva.value = linea.alicuotaIVA;
                                alicuotaIva.dispatchEvent(new Event('change'));
                            }
                        }

                    } catch (error) {
                        console.error(`Error al llenar línea ${numeroLinea}:`, error);
                    }
                }, linea, numeroLinea, datos.tipoContribuyente);

                // Pequeña espera entre líneas para dar tiempo al navegador
                await esperar(300);
            }

            // Validar campos después de llenar todas las líneas
            await newPage.evaluate(() => {
                setTimeout(() => {
                    if (typeof validarCampos === 'function') {
                        validarCampos();
                    }
                }, 1000);
            });

            // Esperar un momento para que se complete la validación
            await esperar(1500);

            console.log("paso_3_DatosDeOperacion_Unificado (modo cliente) completado correctamente.");
            return { success: true, message: "Datos de operación (cliente) completados" };

        } else {
            // ==========================================
            // MODO NORMAL (COPIADO EXACTO de paso_3_DatosDeOperacion_Factura_C.js)
            // ==========================================
            console.log("Ejecutando paso_3 modo normal...");

            // Ejecutar el código dentro de la página
            await newPage.evaluate((datos, iterador) => {
                try {
                    if (window.location.href.includes('genComDatosOperacion') && datos.tipoContribuyente === 'C') {
                        const productosServicio = document.getElementById("detalle_descripcion1");
                        const detalleDescripcion = document.querySelector('#detalle_medida1');
                        const precioUnitario = document.getElementById('detalle_precio1');

                        // Llenar los campos del formulario
                        productosServicio.value = `Factura del día ` + datos.montoResultados.facturasGeneradas[iterador][0];
                        detalleDescripcion.lastChild.selected = true;
                        precioUnitario.value = datos.montoResultados.facturasGeneradas[iterador][1];

                        setTimeout(function () {
                            precioUnitario.dispatchEvent(new Event('keyup'));
                        }, 1000);

                        setTimeout(function () {
                            validarCampos();
                          }, 1500);
                    } else {
                        console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datosDeOperacion:", datos.datosDeOperacion);
                    }
                } catch (error) {
                    console.error("Error dentro de evaluate:", error);
                }
            }, datos, iterador);

            console.log("paso_3_DatosDeOperacion_Unificado (modo normal) completado correctamente.");
            return { success: true, message: "Datos de operación (Factura C) completados" };
        }

    } catch (error) {
        console.error("Error al ejecutar paso_3_DatosDeOperacion_Unificado:", error);
        throw error;
    }
}

module.exports = { paso_3_DatosDeOperacion_Unificado };
