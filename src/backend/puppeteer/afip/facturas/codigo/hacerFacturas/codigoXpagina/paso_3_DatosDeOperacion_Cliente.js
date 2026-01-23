/**
 * Paso 3 - Datos de Operación (VERSIÓN CLIENTE)
 * Soporta múltiples líneas de detalle con:
 * - Descripción personalizada (desde frontend)
 * - Unidad de medida seleccionable
 * - Cantidad
 * - Precio unitario
 * - Alícuota IVA (solo para tipo B)
 */

// Función auxiliar para esperar
function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function paso_3_DatosDeOperacion_Cliente(newPage, datos) {
    try {
        console.log("Ejecutando paso_3_DatosDeOperacion_Cliente...");
        console.log("Líneas de detalle:", datos.lineasDetalle);

        // Verificar que la URL sea la correcta
        const urlActual = newPage.url();
        if (!urlActual.includes('genComDatosOperacion')) {
            throw new Error(`La URL actual (${urlActual}) no es la esperada.`);
        }

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

                    // Unidad de medida (buscar por texto para mayor robustez)
                    const unidadMedida = document.querySelector(`#detalle_medida${numeroLinea}`);
                    if (unidadMedida) {
                        if (linea.unidadMedida !== undefined) {
                            // Buscar la opción por texto
                            const opciones = unidadMedida.querySelectorAll('option');
                            let encontrada = false;
                            for (const opcion of opciones) {
                                if (opcion.textContent.trim().toLowerCase() === linea.unidadMedida.toLowerCase()) {
                                    opcion.selected = true;
                                    encontrada = true;
                                    break;
                                }
                            }
                            if (!encontrada) {
                                console.warn(`No se encontró la unidad de medida: ${linea.unidadMedida}, usando última opción`);
                                unidadMedida.lastChild.selected = true;
                            }
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

        console.log("paso_3_DatosDeOperacion_Cliente completado correctamente.");
        return { success: true, message: "Datos de operación (cliente) completados" };
    } catch (error) {
        console.error("Error al ejecutar paso_3_DatosDeOperacion_Cliente:", error);
        throw error;
    }
}

module.exports = { paso_3_DatosDeOperacion_Cliente };
