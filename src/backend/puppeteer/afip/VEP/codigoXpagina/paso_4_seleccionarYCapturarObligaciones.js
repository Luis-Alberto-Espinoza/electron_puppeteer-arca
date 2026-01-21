/**
 * PASO 4: Seleccionar "Autónomos y Monotributistas" y capturar/seleccionar obligaciones
 *
 * Este paso fusiona la selección de la sección y el procesamiento de obligaciones
 * ya que ambas acciones ocurren en la misma página.
 *
 * MODO 1 (sin periodosSeleccionados): Captura datos de todas las obligaciones
 * MODO 2 (con periodosSeleccionados): Hace click en los períodos seleccionados
 *
 * @param {Object} page - Página de Puppeteer
 * @param {Array<string>} periodosSeleccionados - Array de períodos seleccionados (ej: ["12/2025", "06/2025"])
 */
async function ejecutar(page, periodosSeleccionados = null) {
    try {
        // PARTE 1: Seleccionar sección (intentar sAM primero, luego sPROV)
        console.log("  → Intentando seleccionar 'Autónomos y Monotributistas' (sAM)...");

        let tipoTabla = null;

        // Intentar primero con sAM
        const clickedSAM = await page.evaluate(() => {
            const celda = document.getElementById('sAM');
            if (celda) {
                celda.click();
                return true;
            }
            return false;
        });

        if (!clickedSAM) {
            throw new Error('No se encontró la celda de Autónomos y Monotributistas (sAM)');
        }

        console.log("  → Click en sAM realizado. Esperando tablas...");

        // Esperar con polling hasta que aparezca la tabla (máx 10 segundos)
        const tablaEnDivAM = await page.evaluate(() => {
            return new Promise((resolve) => {
                let intentos = 0;
                const maxIntentos = 40; // 40 intentos x 250ms = 10 segundos

                const verificar = () => {
                    const divAM = document.getElementById('divAM');

                    // Verificar que el div esté VISIBLE
                    if (divAM && window.getComputedStyle(divAM).display !== 'none') {
                        // Buscar tabla solo dentro del div visible
                        const tablas = Array.from(divAM.querySelectorAll('table'));
                        for (const tabla of tablas) {
                            const texto = tabla.textContent || '';
                            if (texto.includes('MONOTRIBUTO - OBLIGACIONES') ||
                                texto.includes('AUTONOMOS') ||
                                texto.includes('Período')) {
                                resolve(true);
                                return;
                            }
                        }
                    }

                    intentos++;
                    if (intentos >= maxIntentos) {
                        resolve(false);
                    } else {
                        setTimeout(verificar, 250);
                    }
                };

                verificar();
            });
        });

        if (tablaEnDivAM) {
            console.log("  ✅ Tabla de MONOTRIBUTO encontrada en divAM");
            tipoTabla = 'MONOTRIBUTO';
        } else {
            // Si no hay tabla visible en divAM, intentar con sPROV
            console.log("  ⚠ No se encontró tabla visible en divAM. Intentando con Provincial (sPROV)...");

            const clickedSPROV = await page.evaluate(() => {
                const celda = document.getElementById('sPROV');
                if (celda) {
                    celda.click();
                    return true;
                }
                return false;
            });

            if (!clickedSPROV) {
                throw new Error('No se encontró la celda de Provincial (sPROV)');
            }

            console.log("  → Click en sPROV realizado. Esperando tablas...");

            // Esperar con polling hasta que aparezca la tabla (máx 10 segundos)
            const tablaEnDivPROV = await page.evaluate(() => {
                return new Promise((resolve) => {
                    let intentos = 0;
                    const maxIntentos = 40; // 40 intentos x 250ms = 10 segundos

                    const verificar = () => {
                        const divPROV = document.getElementById('divPROV');

                        if (divPROV && window.getComputedStyle(divPROV).display !== 'none') {
                            const tablas = Array.from(divPROV.querySelectorAll('table'));
                            for (const tabla of tablas) {
                                const texto = tabla.textContent || '';
                                if (texto.includes('MONOTRIBUTO - OBLIGACIONES') ||
                                    texto.includes('AUTONOMOS') ||
                                    texto.includes('Período')) {
                                    resolve(true);
                                    return;
                                }
                            }
                        }

                        intentos++;
                        if (intentos >= maxIntentos) {
                            resolve(false);
                        } else {
                            setTimeout(verificar, 250);
                        }
                    };

                    verificar();
                });
            });

            if (!tablaEnDivPROV) {
                // ===== NO ES UN ERROR: El cliente no tiene deuda =====
                // Si no se encuentran tablas de obligaciones, significa que el cliente
                // está al día con sus obligaciones y no tiene deuda pendiente
                console.log("  ✅ No se encontraron tablas de deuda - Cliente sin deuda pendiente");
                return {
                    success: true,
                    sinDeuda: true,
                    message: 'El cliente no tiene deuda pendiente'
                };
            }

            console.log("  ✅ Tabla de MONOTRIBUTO encontrada en divPROV");
            tipoTabla = 'PROVINCIAL';
        }

        // PARTE 2: Capturar datos o seleccionar períodos

        // MODO 1: Capturar datos (primera pasada)
        if (!periodosSeleccionados) {
            console.log(`  → Capturando datos de obligaciones (${tipoTabla})...`);
            const datosCapturados = await capturarDatosDeTabla(page, tipoTabla);

            if (!datosCapturados ||
                (!datosCapturados.obligaciones?.length && !datosCapturados.intereses?.length)) {
                // ===== NO ES UN ERROR: El cliente no tiene deuda =====
                // La tabla existe pero no contiene obligaciones ni intereses pendientes
                console.log("  ✅ Tabla sin obligaciones - Cliente sin deuda pendiente");
                return {
                    success: true,
                    sinDeuda: true,
                    message: 'El cliente no tiene deuda pendiente'
                };
            }

            const totalObligaciones = datosCapturados.obligaciones?.length || 0;
            const totalIntereses = datosCapturados.intereses?.length || 0;

            console.log(`  ✅ Paso 4 completado:`);
            console.log(`     - Obligaciones: ${totalObligaciones} períodos`);
            console.log(`     - Intereses: ${totalIntereses} períodos`);

            // Siempre requiere selección del usuario (mostrar modal con ambas tablas)
            console.log(`  → Requiere selección del usuario. Mostrando modal...`);
            return {
                success: true,
                requiereSeleccion: true,
                periodos: datosCapturados  // Ahora es { obligaciones: [...], intereses: [...] }
            };
        }

        // MODO 2: Hacer click en períodos seleccionados (segunda pasada)
        console.log(`  → Seleccionando ${periodosSeleccionados.length} período(s)...`);
        await seleccionarPeriodos(page, periodosSeleccionados, tipoTabla);

        // Habilitar el botón correspondiente
        await habilitarBoton(page, tipoTabla);

        // Esperar a que la página procese la selección y habilite el botón siguiente
        console.log("  → Esperando que la página se actualice...");
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log("  ✅ Paso 4 completado: Períodos seleccionados correctamente");

        return {
            success: true,
            message: `${periodosSeleccionados.length} período(s) seleccionado(s)`
        };

    } catch (error) {
        console.error("  ❌ Error en paso_4_seleccionarYCapturarObligaciones:", error);
        return {
            success: false,
            message: error.message
        };
    }
}

/**
 * Captura datos de todas las obligaciones de la tabla (MONOTRIBUTO o PROVINCIAL)
 * @param {Object} page - Página de Puppeteer
 * @param {string} tipoTabla - Tipo de tabla ('MONOTRIBUTO' o 'PROVINCIAL')
 * @returns {Array} Array de períodos con sus filas
 */
async function capturarDatosDeTabla(page, tipoTabla) {
    return await page.evaluate((tipo) => {
        // Helper: Extraer datos de una tabla específica
        const extraerDatosTabla = (tablaDatos, tipoConcepto) => {
            const filas = Array.from(tablaDatos.querySelectorAll('tr'));
            const filasDeDatos = filas.filter(fila => {
                const celdas = fila.querySelectorAll('td');
                return fila.querySelector('input[type="checkbox"]');
            });

            const mapaPeriodos = {};

            filasDeDatos.forEach(filaTabla => {
                const celdas = Array.from(filaTabla.querySelectorAll('td'));
                const periodo = celdas[0].textContent.trim();

                // Detectar el número de columnas para saber qué datos extraer
                const numColumnas = celdas.length;

                let impuesto, categoria, importe, concepto, subconcepto;

                if (numColumnas === 7) {
                    // Tabla de OBLIGACIONES: Período, Impuesto, Concepto, SubConcepto, Categoría, Importe, Selección
                    impuesto = celdas[1].textContent.trim();
                    concepto = celdas[2].textContent.trim();
                    subconcepto = celdas[3].textContent.trim();
                    categoria = celdas[4].textContent.trim();
                    importe = celdas[5].textContent.trim();
                } else if (numColumnas === 6) {
                    // Tabla de INTERESES: Período, Impuesto, Concepto, Subcpto, Importe, Selección
                    impuesto = celdas[1].textContent.trim();
                    concepto = celdas[2].textContent.trim();
                    subconcepto = celdas[3].textContent.trim();
                    categoria = '-';
                    importe = celdas[4].textContent.trim();
                }

                if (!mapaPeriodos[periodo]) {
                    mapaPeriodos[periodo] = {
                        periodo: periodo,
                        obligaciones: [],
                        intereses: []
                    };
                }

                // Convertir formato US a ARG
                const importeFormateado = importe
                    .replace(/,/g, 'TEMP')
                    .replace(/\./g, ',')
                    .replace(/TEMP/g, '.');

                const fila = {
                    impuesto: impuesto,
                    concepto: concepto,
                    subconcepto: subconcepto,
                    categoria: categoria,
                    importe: importeFormateado
                };

                // Agregar a la categoría correspondiente
                if (tipoConcepto === 'obligaciones') {
                    mapaPeriodos[periodo].obligaciones.push(fila);
                } else {
                    mapaPeriodos[periodo].intereses.push(fila);
                }
            });

            return mapaPeriodos;
        };

        // 1. Buscar AMBAS tablas: Obligaciones e Intereses
        const tablas = Array.from(document.querySelectorAll('table'));
        let tablaObligaciones = null;
        let tablaIntereses = null;

        // Buscar tabla de OBLIGACIONES
        for (const tabla of tablas) {
            const texto = tabla.textContent || '';
            if (texto.includes('OBLIGACIONES') && !texto.includes('INTERESES')) {
                let siguienteElemento = tabla.nextElementSibling;
                while (siguienteElemento) {
                    if (siguienteElemento.tagName === 'TABLE' &&
                        siguienteElemento.textContent.includes('Período') &&
                        siguienteElemento.textContent.includes('Importe')) {
                        tablaObligaciones = siguienteElemento;
                        break;
                    }
                    siguienteElemento = siguienteElemento.nextElementSibling;
                }
                if (tablaObligaciones) break;
            }
        }

        // Buscar tabla de INTERESES
        for (const tabla of tablas) {
            const texto = tabla.textContent || '';
            if (texto.includes('DIFERENCIAS E INTERESES') || texto.includes('INTERESES')) {
                let siguienteElemento = tabla.nextElementSibling;
                while (siguienteElemento) {
                    if (siguienteElemento.tagName === 'TABLE' &&
                        siguienteElemento.textContent.includes('Período') &&
                        siguienteElemento.textContent.includes('Importe')) {
                        tablaIntereses = siguienteElemento;
                        break;
                    }
                    siguienteElemento = siguienteElemento.nextElementSibling;
                }
                if (tablaIntereses) break;
            }
        }

        // 2. Extraer datos de ambas tablas y combinarlos
        let mapaPeriodosCombinado = {};

        if (tablaObligaciones) {
            const datosObligaciones = extraerDatosTabla(tablaObligaciones, 'obligaciones');
            mapaPeriodosCombinado = { ...datosObligaciones };
        }

        if (tablaIntereses) {
            const datosIntereses = extraerDatosTabla(tablaIntereses, 'intereses');

            // Combinar con los datos existentes
            for (const periodo in datosIntereses) {
                if (mapaPeriodosCombinado[periodo]) {
                    mapaPeriodosCombinado[periodo].intereses = datosIntereses[periodo].intereses;
                } else {
                    mapaPeriodosCombinado[periodo] = datosIntereses[periodo];
                }
            }
        }

        // ===== SI NO HAY TABLAS, DEVOLVER ARRAYS VACÍOS (Cliente sin deuda) =====
        // No es un error, simplemente no hay deuda pendiente
        if (!tablaObligaciones && !tablaIntereses) {
            return {
                obligaciones: [],
                intereses: []
            };
        }

        // 3. Convertir a arrays separados
        const periodosObligaciones = [];
        const periodosIntereses = [];

        Object.values(mapaPeriodosCombinado).forEach(item => {
            // Solo agregar si hay datos en cada categoría
            if (item.obligaciones.length > 0) {
                periodosObligaciones.push({
                    periodo: item.periodo,
                    filas: item.obligaciones
                });
            }

            if (item.intereses.length > 0) {
                periodosIntereses.push({
                    periodo: item.periodo,
                    filas: item.intereses
                });
            }
        });

        return {
            obligaciones: periodosObligaciones,
            intereses: periodosIntereses
        };
    }, tipoTabla);
}

/**
 * Hace click en los checkboxes de los períodos seleccionados
 * @param {Object} page - Página de Puppeteer
 * @param {Array<string>} periodosSeleccionados - Array de períodos (ej: ["12/2025"])
 * @param {string} tipoTabla - Tipo de tabla ('MONOTRIBUTO' o 'PROVINCIAL')
 */
async function seleccionarPeriodos(page, periodosSeleccionados, tipoTabla) {
    const resultado = await page.evaluate((periodos, tipo) => {
        // 1. Buscar la tabla según el tipo
        const tablas = Array.from(document.querySelectorAll('table'));
        let tablaDatos = null;

        // Definir el texto a buscar según el tipo
        const textoBusqueda = tipo === 'MONOTRIBUTO' ? 'MONOTRIBUTO - OBLIGACIONES' : 'OBLIGACIONES';

        for (const tabla of tablas) {
            const texto = tabla.textContent || '';
            if (texto.includes(textoBusqueda)) {
                let siguienteElemento = tabla.nextElementSibling;
                while (siguienteElemento) {
                    if (siguienteElemento.tagName === 'TABLE' &&
                        siguienteElemento.textContent.includes('Período') &&
                        siguienteElemento.textContent.includes('Importe')) {
                        tablaDatos = siguienteElemento;
                        break;
                    }
                    siguienteElemento = siguienteElemento.nextElementSibling;
                }
                if (tablaDatos) break;
            }
        }

        // Si no encontramos con el texto específico, buscar cualquier tabla con Período e Importe
        if (!tablaDatos) {
            for (const tabla of tablas) {
                const texto = tabla.textContent || '';
                if (texto.includes('Período') &&
                    texto.includes('Importe') &&
                    tabla.querySelector('input[type="checkbox"]')) {
                    tablaDatos = tabla;
                    break;
                }
            }
        }

        if (!tablaDatos) {
            throw new Error(`No se encontró la tabla de ${tipo}`);
        }

        // 2. Buscar y hacer click en las filas de los períodos seleccionados
        const filas = Array.from(tablaDatos.querySelectorAll('tr'));
        const clickeados = [];

        periodos.forEach(periodoSeleccionado => {
            // Buscar la PRIMERA fila de este período (cualquier impuesto)
            for (const fila of filas) {
                const celdas = fila.querySelectorAll('td');
                if (celdas.length === 7) {
                    const periodo = celdas[0].textContent.trim();

                    // Hacer click en la primera fila del período encontrada
                    if (periodo === periodoSeleccionado) {
                        const checkbox = fila.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            checkbox.click();
                            clickeados.push(periodoSeleccionado);
                            break; // Solo clickear UNA vez por período
                        }
                    }
                }
            }
        });

        return {
            periodosClickeados: clickeados.length,
            periodosSolicitados: periodos.length
        };
    }, periodosSeleccionados, tipoTabla);

    // Validar que se hicieron todos los clicks
    if (resultado.periodosClickeados !== resultado.periodosSolicitados) {
        throw new Error(
            `Solo se pudieron seleccionar ${resultado.periodosClickeados} de ${resultado.periodosSolicitados} períodos`
        );
    }

    // Esperar a que se procesen los clicks
    await new Promise(resolve => setTimeout(resolve, 1000));
}

/**
 * Habilita el botón de "Generar VEP" correspondiente según el tipo de tabla
 * @param {Object} page - Página de Puppeteer
 * @param {string} tipoTabla - Tipo de tabla ('MONOTRIBUTO' o 'PROVINCIAL')
 */
async function habilitarBoton(page, tipoTabla) {
    console.log(`  → Habilitando botón para tipo: ${tipoTabla}...`);

    const resultado = await page.evaluate((tipo) => {
        if (tipo === 'MONOTRIBUTO') {
            // Habilitar botón GenerarVEP (en divAM)
            const boton = document.getElementById('GenerarVEP');
            if (boton) {
                boton.setAttribute('haydeuda', '1');
                boton.style.display = 'block';
                return { boton: 'GenerarVEP', habilitado: true };
            }
            return { boton: 'GenerarVEP', habilitado: false };

        } else if (tipo === 'PROVINCIAL') {
            // Habilitar botón GenerarVEPAlone (en divPROV)
            const boton = document.getElementById('GenerarVEPAlone');
            if (boton) {
                boton.style.display = 'block';
                return { boton: 'GenerarVEPAlone', habilitado: true };
            }
            return { boton: 'GenerarVEPAlone', habilitado: false };
        }

        return { boton: 'ninguno', habilitado: false };
    }, tipoTabla);

    if (resultado.habilitado) {
        console.log(`  ✅ Botón ${resultado.boton} habilitado correctamente`);
    } else {
        console.log(`  ⚠️ No se pudo habilitar el botón ${resultado.boton}`);
    }
}

module.exports = { ejecutar };
