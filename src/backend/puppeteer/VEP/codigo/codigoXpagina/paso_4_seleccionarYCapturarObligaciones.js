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
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Verificar si la tabla de MONOTRIBUTO está VISIBLE en divAM
        const tablaEnDivAM = await page.evaluate(() => {
            const divAM = document.getElementById('divAM');

            // Verificar que el div esté VISIBLE
            if (divAM && window.getComputedStyle(divAM).display !== 'none') {
                // Buscar tabla solo dentro del div visible
                const tablas = Array.from(divAM.querySelectorAll('table'));
                for (const tabla of tablas) {
                    const texto = tabla.textContent || '';
                    if (texto.includes('MONOTRIBUTO - OBLIGACIONES')) {
                        return true;
                    }
                }
            }
            return false;
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
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Verificar que la tabla esté visible en divPROV
            const tablaEnDivPROV = await page.evaluate(() => {
                const divPROV = document.getElementById('divPROV');

                if (divPROV && window.getComputedStyle(divPROV).display !== 'none') {
                    const tablas = Array.from(divPROV.querySelectorAll('table'));
                    for (const tabla of tablas) {
                        const texto = tabla.textContent || '';
                        if (texto.includes('MONOTRIBUTO - OBLIGACIONES')) {
                            return true;
                        }
                    }
                }
                return false;
            });

            if (!tablaEnDivPROV) {
                throw new Error('No se encontró tabla visible ni en divAM ni en divPROV');
            }

            console.log("  ✅ Tabla de MONOTRIBUTO encontrada en divPROV");
            tipoTabla = 'PROVINCIAL';
        }

        // PARTE 2: Capturar datos o seleccionar períodos

        // MODO 1: Capturar datos (primera pasada)
        if (!periodosSeleccionados) {
            console.log(`  → Capturando datos de obligaciones (${tipoTabla})...`);
            const datosCapturados = await capturarDatosDeTabla(page, tipoTabla);

            if (!datosCapturados || datosCapturados.length === 0) {
                throw new Error('No se encontraron obligaciones en la tabla');
            }

            console.log(`  ✅ Paso 4 completado: ${datosCapturados.length} períodos capturados`);

            // OPTIMIZACIÓN: Si hay UN SOLO período, seleccionarlo automáticamente
            if (datosCapturados.length === 1) {
                console.log("  → Detectado 1 solo período. Seleccionando automáticamente...");
                const periodoUnico = datosCapturados[0].periodo;
                await seleccionarPeriodos(page, [periodoUnico], tipoTabla);

                // Habilitar el botón correspondiente
                await habilitarBoton(page, tipoTabla);

                // Esperar a que la página procese la selección y habilite el botón siguiente
                console.log("  → Esperando que la página se actualice...");
                await new Promise(resolve => setTimeout(resolve, 2000));

                return {
                    success: true,
                    message: `Período ${periodoUnico} seleccionado automáticamente`,
                    autoprocesado: true
                };
            }

            // Si hay múltiples períodos, requiere selección del usuario
            return {
                success: true,
                requiereSeleccion: true,
                periodos: datosCapturados
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
        // 1. Buscar la tabla según el tipo
        const tablas = Array.from(document.querySelectorAll('table'));
        let tablaDatos = null;

        // Definir el texto a buscar según el tipo
        const textoBusqueda = tipo === 'MONOTRIBUTO' ? 'MONOTRIBUTO - OBLIGACIONES' : 'OBLIGACIONES';

        for (const tabla of tablas) {
            const texto = tabla.textContent || '';
            if (texto.includes(textoBusqueda)) {
                // Buscar la tabla de datos (siguiente tabla después del encabezado)
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

        // 2. Extraer todas las filas de datos (excluir encabezado)
        const filas = Array.from(tablaDatos.querySelectorAll('tr'));
        const filasDeDatos = filas.filter(fila => {
            const celdas = fila.querySelectorAll('td');
            // Filtrar filas que tienen exactamente 7 columnas y un checkbox
            return celdas.length === 7 && fila.querySelector('input[type="checkbox"]');
        });

        // 3. Agrupar filas por período
        const mapaPeriodos = {};

        filasDeDatos.forEach(fila => {
            const celdas = Array.from(fila.querySelectorAll('td'));

            const periodo = celdas[0].textContent.trim();
            const impuesto = celdas[1].textContent.trim();
            const categoria = celdas[4].textContent.trim();
            const importe = celdas[5].textContent.trim();

            if (!mapaPeriodos[periodo]) {
                mapaPeriodos[periodo] = {
                    periodo: periodo,
                    filas: []
                };
            }

            mapaPeriodos[periodo].filas.push({
                impuesto: impuesto,
                categoria: categoria,
                importe: importe
            });
        });

        // 4. Convertir a array
        return Object.values(mapaPeriodos);
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
