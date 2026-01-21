const XLSX = require('xlsx');
const path = require('path');
const { getDownloadPath, getFilename } = require('../../../../utils/fileManager.js');
const fs = require('fs');
const { buscarEnAfip } = require('../../archivosComunes/buscadorAfip.js');
const paso_1b_seleccionarCuit = require('../../VEP/codigoXpagina/paso_1b_seleccionarCuit.js');

/**
 * Ejecuta el flujo completo de consulta de deuda en AFIP
 * @param {Page} page - Página de Puppeteer autenticada
 * @param {Object} usuario - Datos del usuario
 * @param {string} periodoDesde - Período desde (MM/AAAA)
 * @param {string} periodoHasta - Período hasta (MM/AAAA)
 * @param {string} fechaCalculo - Fecha de cálculo (DD/MM/AAAA)
 * @param {string} basePath - Ruta base para guardar el archivo Excel
 * @returns {Object} Resultado del proceso
 */
async function ejecutarFlujoConsultaDeuda(page, usuario, periodoDesde, periodoHasta, fechaCalculo, basePath) {
    console.log("🔵 [Flujo Consulta Deuda] Iniciando flujo...");
    console.log(`   Usuario: ${usuario.nombre} (${usuario.cuit})`);
    console.log(`   Período: ${periodoDesde} → ${periodoHasta}`);
    console.log(`   Fecha de cálculo: ${fechaCalculo}`);

    try {
        let paginaActual = page;

        // 1. Navegar a CCMA (Cuenta Corriente Monotributo) usando el buscador
        console.log("🔵 [Flujo] Paso 1: Navegando a CCMA...");
        const newPage = await navegarACCMA(paginaActual);
        paginaActual = newPage; // Cambiar a la nueva pestaña

        // 1B. Seleccionar CUIT si es necesario (reutilizando código de VEP)
        console.log("🔵 [Flujo] Paso 1B: Verificando selección de CUIT...");
        const resultadoCuit = await paso_1b_seleccionarCuit.ejecutar(paginaActual, usuario.cuit);
        if (!resultadoCuit.success) {
            throw new Error(`Error al seleccionar CUIT: ${resultadoCuit.message}`);
        }

        // 2. Rellenar formulario con períodos y fecha
        console.log("🔵 [Flujo] Paso 2: Rellenando formulario...");
        await rellenarFormulario(paginaActual, periodoDesde, periodoHasta, fechaCalculo);

        // 3. Hacer clic en "Calculo de Deuda"
        console.log("🔵 [Flujo] Paso 3: Ejecutando cálculo de deuda...");
        await ejecutarCalculoDeuda(paginaActual);

        // 4. Esperar a que cargue la tabla de resultados
        console.log("🔵 [Flujo] Paso 4: Esperando tabla de resultados...");
        await esperarTablaResultados(paginaActual);

        // 4B. Configurar 48 registros por página (reduce cantidad de paginación)
        console.log("🔵 [Flujo] Paso 4B: Configurando registros por página...");
        await configurarRegistrosPorPagina(paginaActual, 48);

        // 4C. Extraer datos personales del contribuyente
        console.log("🔵 [Flujo] Paso 4C: Extrayendo datos personales...");
        const datosPersonales = await extraerDatosPersonales(paginaActual);

        // 4D. Extraer datos de resumen (tabla de totales)
        console.log("🔵 [Flujo] Paso 4D: Extrayendo datos de resumen...");
        const datosResumen = await extraerDatosResumen(paginaActual);

        // 4E. Extraer filtros avanzados
        console.log("🔵 [Flujo] Paso 4E: Extrayendo filtros avanzados...");
        const filtrosAvanzados = await extraerFiltrosAvanzados(paginaActual);

        // 5. Extraer datos de todas las páginas
        console.log("🔵 [Flujo] Paso 5: Extrayendo datos de la tabla...");
        const datosTabla = await extraerDatosTabla(paginaActual);

        // 6. Generar archivo Excel con dos hojas
        console.log("🔵 [Flujo] Paso 6: Generando archivo Excel con dos hojas...");
        const rutaExcel = await generarArchivoExcel(datosTabla, datosPersonales, datosResumen, filtrosAvanzados, usuario, basePath, periodoDesde, periodoHasta, fechaCalculo);

        console.log(`✅ [Flujo] Consulta de deuda completada exitosamente`);
        console.log(`   Archivo generado: ${rutaExcel}`);

        return {
            success: true,
            archivoExcel: path.basename(rutaExcel),
            rutaCompleta: rutaExcel,
            totalFilas: datosTabla.filas.length,
            periodoDesde,
            periodoHasta,
            fechaCalculo
        };

    } catch (error) {
        console.error("❌ [Flujo Consulta Deuda] Error:", error);
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    }
}

/**
 * Navega a la página de CCMA (Cuenta Corriente Monotributo) usando el buscador de AFIP
 * @returns {Page} Nueva página con CCMA abierto
 */
async function navegarACCMA(page) {
    console.log("   Buscando CCMA en el panel de AFIP...");

    try {
        // Usar el buscador de AFIP para navegar a CCMA
        const newPage = await buscarEnAfip(page, 'ccma', {
            timeoutNuevaPestana: 15000,
            esperarNuevaPestana: true
        });

        console.log("   ✅ CCMA abierto en nueva pestaña");

        // Esperar a que la página cargue completamente usando una Promise con setTimeout
        await new Promise(resolve => setTimeout(resolve, 2000));

        return newPage;

    } catch (error) {
        console.error("   ❌ Error navegando a CCMA:", error);
        throw new Error(`No se pudo abrir CCMA: ${error.message}`);
    }
}

/**
 * Rellena el formulario de consulta de deuda
 */
async function rellenarFormulario(page, periodoDesde, periodoHasta, fechaCalculo) {
    console.log("   Rellenando campos del formulario...");

    try {
        // Esperar a que los inputs del formulario estén presentes
        await page.waitForSelector('input[name="perdesde2"]', { timeout: 15000 });
        await page.waitForSelector('input[name="perhasta2"]', { timeout: 5000 });
        await page.waitForSelector('input[name="feccalculo"]', { timeout: 5000 });

        // Limpiar y rellenar "Período Desde"
        await page.evaluate((valor) => {
            const input = document.querySelector('input[name="perdesde2"]');
            if (input) {
                input.value = valor;
            }
        }, periodoDesde);

        // Pequeña espera entre campos
        await new Promise(resolve => setTimeout(resolve, 500));

        // Limpiar y rellenar "Período Hasta"
        await page.evaluate((valor) => {
            const input = document.querySelector('input[name="perhasta2"]');
            if (input) {
                input.value = valor;
            }
        }, periodoHasta);

        await new Promise(resolve => setTimeout(resolve, 500));

        // Limpiar y rellenar "Fecha de Cálculo"
        await page.evaluate((valor) => {
            const input = document.querySelector('input[name="feccalculo"]');
            if (input) {
                input.value = valor;
            }
        }, fechaCalculo);

        console.log(`   ✅ Formulario rellenado: ${periodoDesde} → ${periodoHasta} | Fecha: ${fechaCalculo}`);

    } catch (error) {
        console.error("   ❌ Error rellenando formulario:", error);
        throw new Error(`No se pudo rellenar el formulario: ${error.message}`);
    }
}

/**
 * Ejecuta el cálculo de deuda (click en botón)
 */
async function ejecutarCalculoDeuda(page) {
    console.log("   Haciendo clic en 'CALCULO DE DEUDA'...");

    // Buscar el botón por su valor "CALCULO DE DEUDA"
    const botonSelector = 'input[name="CalDeud"][value="CALCULO DE DEUDA"]';

    // Hacer clic en el botón
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
        page.click(botonSelector)
    ]);

    console.log("   ✅ Cálculo ejecutado, página recargada");
}

/**
 * Espera a que la tabla de resultados esté presente
 */
async function esperarTablaResultados(page) {
    console.log("   Esperando tabla de resultados...");

    // Selector de la tabla (buscar por la clase CeldaBorde)
    const tablaSelector = 'table tbody tr.CeldaBorde_ConsDeuFec, table tbody tr td.CeldaBorde_ConsDeuFec';

    await page.waitForSelector(tablaSelector, { timeout: 30000 });

    console.log("   ✅ Tabla de resultados encontrada");
}

/**
 * Configura la cantidad de registros por página
 * @param {Page} page - Página de Puppeteer
 * @param {number} cantidad - Cantidad de registros (12, 24, 36, 48)
 */
async function configurarRegistrosPorPagina(page, cantidad = 48) {
    console.log(`   Configurando ${cantidad} registros por página...`);

    try {
        // Buscar el select de cantidad de registros (el elemento real se llama "rango")
        const selectSelector = 'select[name="rango"]';

        // Verificar si existe el selector
        const selectorExiste = await page.$(selectSelector);

        if (!selectorExiste) {
            console.log("   ⚠️ No se encontró el selector de registros por página, continuando...");
            return;
        }

        // Obtener el valor actual para evitar cambios innecesarios
        const valorActual = await page.$eval(selectSelector, el => el.value);

        if (valorActual === String(cantidad)) {
            console.log(`   ✅ Ya está configurado a ${cantidad} registros por página`);
            return;
        }

        console.log(`   Cambiando de ${valorActual} a ${cantidad} registros...`);

        // Cambiar el select (NO esperar navegación porque es AJAX)
        await page.select(selectSelector, String(cantidad));

        // Esperar a que la tabla se actualice (el contenido cambia dinámicamente)
        // Esperar 3 segundos para que AJAX complete la actualización
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log(`   ✅ Configurado a ${cantidad} registros por página`);

    } catch (error) {
        console.warn(`   ⚠️ No se pudo configurar registros por página: ${error.message}`);
        console.warn("   Continuando con la configuración actual...");
    }
}

/**
 * Extrae los datos de resumen de la tabla de totales (antes del contenedor)
 */
async function extraerDatosResumen(page) {
    console.log("   Extrayendo datos de resumen...");

    const datosResumen = await page.evaluate(() => {
        const resumen = {};

        try {
            // Buscar la tabla de resumen (clase CabeceraTablaBorde, antes del contenedor)
            const tablasResumen = document.querySelectorAll('table.CabeceraTablaBorde');

            // La primera tabla debería ser la de resumen
            if (tablasResumen.length > 0) {
                const tablaResumen = tablasResumen[0];

                // Extraer fecha de cálculo
                const fechaCalculo = tablaResumen.textContent.match(/FECHA DE C[ÁA]LCULO:\s*(\d{2}\/\d{2}\/\d{4})/);
                if (fechaCalculo) {
                    resumen.fechaCalculo = fechaCalculo[1];
                }

                // Extraer período total
                const periodoTotal = tablaResumen.textContent.match(/PER[ÍI]ODO TOTAL CALCULADO\s*(\d{2}\/\d{4}\s*-\s*\d{2}\/\d{4})/);
                if (periodoTotal) {
                    resumen.periodoTotal = periodoTotal[1];
                }

                // Extraer totales (números con formato 123,456.78)
                const textoTabla = tablaResumen.textContent;

                const saldoDeudor = textoTabla.match(/Total Saldo Deudor:\s*([\d,]+\.?\d*)/);
                if (saldoDeudor) resumen.totalSaldoDeudor = saldoDeudor[1];

                const saldoAcreedor = textoTabla.match(/Total Saldo Acreedor:\s*([\d,]+\.?\d*)/);
                if (saldoAcreedor) resumen.totalSaldoAcreedor = saldoAcreedor[1];

                // Puede haber dos "Obligación Mensual" (deudor y acreedor), tomar ambos
                const obligacionesMatch = textoTabla.matchAll(/Obligaci[óo]n Mensual:\s*([\d,]+\.?\d*)/g);
                const obligaciones = Array.from(obligacionesMatch).map(m => m[1]);
                if (obligaciones.length >= 1) resumen.obligacionMensualDeudor = obligaciones[0];
                if (obligaciones.length >= 2) resumen.obligacionMensualAcreedor = obligaciones[1];

                // Accesorios
                const accesoriosMatch = textoTabla.matchAll(/Accesorios:\s*([\d,]+\.?\d*)/g);
                const accesorios = Array.from(accesoriosMatch).map(m => m[1]);
                if (accesorios.length >= 1) resumen.accesoriosDeudor = accesorios[0];
                if (accesorios.length >= 2) resumen.accesoriosAcreedor = accesorios[1];
            }
        } catch (error) {
            console.warn('Error extrayendo resumen:', error);
        }

        return resumen;
    });

    console.log('   ✅ Resumen extraído:', datosResumen);
    return datosResumen;
}

/**
 * Extrae los datos personales del contribuyente
 */
async function extraerDatosPersonales(page) {
    console.log("   Extrayendo datos personales...");

    const datosPersonales = await page.evaluate(() => {
        const datos = {};

        try {
            // Buscar la tabla dentro del <center> que contiene los datos personales
            // La estructura es: <center><table>...</table></center>
            const centros = document.querySelectorAll('center');

            for (const centro of centros) {
                const tabla = centro.querySelector('table');
                if (!tabla) continue;

                const textoTabla = tabla.textContent || '';

                // Si encontramos "CUIT:" en el texto, es la tabla correcta
                if (textoTabla.includes('CUIT:')) {
                    // Buscar todas las filas de la tabla
                    const filas = tabla.querySelectorAll('tr');

                    filas.forEach(fila => {
                        const texto = fila.textContent || '';

                        // CUIT
                        if (texto.includes('CUIT:')) {
                            const cuitMatch = texto.match(/CUIT:\s*(\d{2}-\d{8}-\d{1})/);
                            if (cuitMatch) datos.cuit = cuitMatch[1];
                        }

                        // Tipo de Contribuyente
                        if (texto.includes('Tipo de Contribuyente:')) {
                            const tipoMatch = texto.match(/Tipo\s+de\s+Contribuyente:\s*([A-ZÁÉÍÓÚÑ\s]+)/i);
                            if (tipoMatch) {
                                let tipo = tipoMatch[1].trim();
                                // Remover cualquier texto que venga después
                                tipo = tipo.replace(/\d{2}\/\d{2}\/\d{4}.*/i, '').trim();
                                datos.tipoContribuyente = tipo;
                            }
                        }

                        // Apellido y Nombre
                        if (texto.includes('Apellido y Nombre:')) {
                            const nombreMatch = texto.match(/Apellido\s+y\s+Nombre:\s*([A-ZÁÉÍÓÚÑ,\s]+?)(?:Tipo\s+de\s+Contribuyente|$)/i);
                            if (nombreMatch) {
                                let nombre = nombreMatch[1].trim();
                                // Limpiar espacios extra
                                nombre = nombre.replace(/\s{2,}/g, ' ').trim();
                                datos.nombre = nombre;
                            }
                        }

                        // Domicilio
                        if (texto.includes('Domicilio:')) {
                            const domicilioMatch = texto.match(/Domicilio:\s*([A-Z0-9ÁÉÍÓÚÑ,\s\-]+?)(?:Dependencia|$)/i);
                            if (domicilioMatch) {
                                let domicilio = domicilioMatch[1].trim();
                                domicilio = domicilio.replace(/\s{2,}/g, ' ').trim();
                                datos.domicilio = domicilio;
                            }
                        }

                        // Dependencia
                        if (texto.includes('Dependencia:')) {
                            const dependenciaMatch = texto.match(/Dependencia:\s*([A-ZÁÉÍÓÚÑ0-9\s\-\.]+?)(?:\d{2}\/\d{2}\/\d{4}|$)/i);
                            if (dependenciaMatch) {
                                let dependencia = dependenciaMatch[1].trim();
                                dependencia = dependencia.replace(/\s{2,}/g, ' ').trim();
                                datos.dependencia = dependencia;
                            }
                        }
                    });

                    break; // Ya encontramos la tabla, salir del loop
                }
            }
        } catch (error) {
            console.warn('Error extrayendo datos personales:', error);
        }

        return datos;
    });

    console.log('   ✅ Datos personales extraídos:', datosPersonales);
    return datosPersonales;
}

/**
 * Extrae los datos de la tabla "Filtro Avanzado"
 */
async function extraerFiltrosAvanzados(page) {
    console.log("   Extrayendo filtros avanzados...");

    const filtros = await page.evaluate(() => {
        const datos = {};

        try {
            // Buscar todas las tablas con clase CabeceraTablaBorde
            const tablas = document.querySelectorAll('table.CabeceraTablaBorde');

            // Buscar la tabla que contiene "FILTRO AVANZADO"
            for (const tabla of tablas) {
                const textoTabla = tabla.textContent || '';

                if (textoTabla.includes('FILTRO AVANZADO')) {
                    // Esta es la tabla de filtros
                    // Buscar todas las filas de la tabla para extraer cada valor
                    const filas = tabla.querySelectorAll('tr');

                    filas.forEach(fila => {
                        const texto = fila.textContent || '';

                        // Período Desde
                        if (texto.includes('Período Desde') || texto.includes('Periodo Desde')) {
                            const match = texto.match(/Per[ií]odo\s+Desde:\s*(\d{2}\/\d{4})/i);
                            if (match) datos.periodoDesde = match[1];
                        }

                        // Período Hasta
                        if (texto.includes('Período Hasta') || texto.includes('Periodo Hasta')) {
                            const match = texto.match(/Per[ií]odo\s+Hasta:\s*(\d{2}\/\d{4})/i);
                            if (match) datos.periodoHasta = match[1];
                        }

                        // Detalle
                        if (texto.includes('Detalle:')) {
                            const match = texto.match(/Detalle:\s*([A-ZÁÉÍÓÚÑ0-9\s\-]+?)(?:Impuesto:|$)/i);
                            if (match) {
                                let detalle = match[1].trim();
                                detalle = detalle.replace(/\s{2,}/g, ' ').trim();
                                datos.detalle = detalle;
                            }
                        }

                        // Impuesto
                        if (texto.includes('Impuesto:')) {
                            const match = texto.match(/Impuesto:\s*([A-ZÁÉÍÓÚÑ0-9\s\-]+?)(?:Concepto:|$)/i);
                            if (match) {
                                let impuesto = match[1].trim();
                                impuesto = impuesto.replace(/\s{2,}/g, ' ').trim();
                                datos.impuesto = impuesto;
                            }
                        }

                        // Concepto
                        if (texto.includes('Concepto:')) {
                            const match = texto.match(/Concepto:\s*([A-ZÁÉÍÓÚÑ0-9\s\-]+?)(?:Subconcepto:|$)/i);
                            if (match) {
                                let concepto = match[1].trim();
                                concepto = concepto.replace(/\s{2,}/g, ' ').trim();
                                datos.concepto = concepto;
                            }
                        }

                        // Subconcepto
                        if (texto.includes('Subconcepto:')) {
                            const match = texto.match(/Subconcepto:\s*([A-ZÁÉÍÓÚÑ0-9\s\-]+?)(?:\n|$)/i);
                            if (match) {
                                let subconcepto = match[1].trim();
                                subconcepto = subconcepto.replace(/\s{2,}/g, ' ').trim();
                                datos.subconcepto = subconcepto;
                            }
                        }
                    });

                    break; // Ya encontramos la tabla, salir
                }
            }
        } catch (error) {
            console.warn('Error extrayendo filtros avanzados:', error);
        }

        return datos;
    });

    console.log('   ✅ Filtros avanzados extraídos:', filtros);
    return filtros;
}

/**
 * Extrae los datos de la tabla de deuda (con paginación automática)
 */
async function extraerDatosTabla(page) {
    console.log("   Extrayendo datos de la tabla...");

    let todasLasFilas = [];
    let paginaActual = 1;
    let hayMasPaginas = true;

    while (hayMasPaginas) {
        console.log(`   📄 Procesando página ${paginaActual}...`);

        // Extraer filas de la página actual
        const filasPagina = await page.evaluate(() => {
            // Buscar el contenedor específico donde están los datos reales
            const contenedor = document.getElementById('contenedor');

            if (!contenedor) {
                console.warn('⚠️ No se encontró el contenedor con id="contenedor"');
                // Fallback: buscar en todo el documento
            }

            // Función auxiliar para limpiar texto (remover scripts, tabulaciones, espacios extras)
            function limpiarTexto(elemento) {
                if (!elemento) return '';

                // Clonar el elemento para no modificar el DOM original
                const clone = elemento.cloneNode(true);

                // Remover scripts, style tags y elementos ocultos
                const scriptsYStyles = clone.querySelectorAll('script, style, [style*="display:none"], [style*="display: none"]');
                scriptsYStyles.forEach(el => el.remove());

                // Obtener el texto
                let texto = clone.textContent || '';

                // Limpiar tabulaciones, saltos de línea múltiples y espacios extras
                texto = texto
                    .replace(/\t+/g, ' ')           // Reemplazar tabulaciones por un espacio
                    .replace(/\n+/g, ' ')           // Reemplazar saltos de línea por un espacio
                    .replace(/\r+/g, ' ')           // Reemplazar retornos de carro
                    .replace(/\s{2,}/g, ' ')        // Reemplazar múltiples espacios por uno solo
                    .trim();                         // Quitar espacios al inicio y final

                return texto;
            }

            // Función auxiliar para convertir valores negativos de (123.45) a -123.45
            function procesarValorNumerico(valor) {
                if (!valor) return valor;

                const valorTrim = String(valor).trim();

                // Si está entre paréntesis (número negativo en contabilidad)
                if (valorTrim.startsWith('(') && valorTrim.endsWith(')')) {
                    // Remover paréntesis y agregar signo menos
                    const numeroSinParentesis = valorTrim.replace(/[()]/g, '').trim();
                    return `-${numeroSinParentesis}`;
                }

                return valor;
            }

            const filas = [];

            // Buscar filas SOLO dentro del contenedor
            let rows;
            if (contenedor) {
                // Buscar la tabla específica dentro del contenedor
                const tabla = contenedor.querySelector('table.CabeceraTablaBorde_ConsDeuFec');

                if (tabla) {
                    rows = tabla.querySelectorAll('tbody tr');
                } else {
                    // Fallback: buscar cualquier tabla dentro del contenedor
                    rows = contenedor.querySelectorAll('table tbody tr');
                }
            } else {
                // Fallback final: buscar en todo el documento (comportamiento anterior)
                rows = document.querySelectorAll('table tbody tr');
            }

            rows.forEach(row => {
                // Filtrar filas ocultas y filas de relleno (SS, ST)
                const style = row.getAttribute('style') || '';
                const id = row.getAttribute('id') || '';

                if (style.includes('display:none') || style.includes('display: none')) {
                    return; // Saltar filas ocultas
                }

                if (id.startsWith('SS') || id.startsWith('ST')) {
                    return; // Saltar filas de totales ocultos
                }

                const celdas = row.querySelectorAll('td');

                // Verificar que sea una fila de datos válida (con clase CeldaBorde_ConsDeuFec)
                const esFilaValida = Array.from(celdas).some(td =>
                    td.className && td.className.includes('CeldaBorde_ConsDeuFec')
                );

                // Validación más estricta: la fila debe tener la clase o sus celdas deben tenerla
                const filaClase = row.className || '';
                const esFilaDeDatos = esFilaValida || filaClase.includes('CeldaBorde_ConsDeuFec');

                if (!esFilaDeDatos || celdas.length < 10) {
                    return; // Saltar filas que no son de datos
                }

                // Detectar y saltar filas de encabezado (headers duplicados en paginación)
                const primeraCeldaTexto = celdas[0] ? (celdas[0].textContent || '').trim().toLowerCase() : '';
                const segundaCeldaTexto = celdas[1] ? (celdas[1].textContent || '').trim().toLowerCase() : '';

                // Si la primera o segunda celda contiene texto de header, saltar
                if (primeraCeldaTexto === 'detalle' ||
                    segundaCeldaTexto === 'periodo' ||
                    primeraCeldaTexto.includes('impuesto') ||
                    primeraCeldaTexto === '' && segundaCeldaTexto === 'periodo') {
                    return; // Saltar header duplicado
                }

                // Extraer datos de las celdas usando la función de limpieza
                // NOTA: celdas[0] contiene una imagen, por eso empezamos desde índice 1 para los datos
                const detalle = limpiarTexto(celdas[1]);       // Detalle
                const periodo = limpiarTexto(celdas[2]);       // Período
                const impuesto = limpiarTexto(celdas[3]);      // Impuesto
                const concepto = limpiarTexto(celdas[4]);      // Concepto
                const subcpto = limpiarTexto(celdas[5]);       // Subconcepto
                const descripcion = limpiarTexto(celdas[6]);   // Descripción
                const fechaMovimiento = limpiarTexto(celdas[7]); // Fecha Movimiento

                // Procesar valores numéricos (convertir paréntesis a signo menos)
                const debe = procesarValorNumerico(limpiarTexto(celdas[8]));   // Debe
                const haber = procesarValorNumerico(limpiarTexto(celdas[9]));  // Haber
                const saldo = procesarValorNumerico(limpiarTexto(celdas[10])); // Saldo

                filas.push({
                    detalle,
                    periodo,
                    impuesto,
                    concepto,
                    subcpto,
                    descripcion,
                    fechaMovimiento,
                    debe,
                    haber,
                    saldo
                });
            });

            return filas;
        });

        console.log(`   ✅ Extraídas ${filasPagina.length} filas de página ${paginaActual}`);

        todasLasFilas = todasLasFilas.concat(filasPagina);

        // Verificar si hay más páginas (botón "mas0" visible)
        hayMasPaginas = await page.evaluate(() => {
            const botonMas = document.querySelector('#mas0');
            if (!botonMas) return false;

            const style = window.getComputedStyle(botonMas);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });

        if (hayMasPaginas) {
            console.log("   ➡️  Navegando a siguiente página...");

            // Hacer clic en el botón "más"
            await page.click('#mas0');

            // Esperar a que se actualice la tabla
            await new Promise(resolve => setTimeout(resolve, 2000));

            paginaActual++;
        }
    }

    console.log(`   ✅ Extracción completada: ${todasLasFilas.length} filas en total`);

    // DEBUG: Estadísticas de datos extraídos
    console.log('   📊 Estadísticas de extracción:');
    console.log(`      Total de filas: ${todasLasFilas.length}`);
    console.log(`      Total de páginas procesadas: ${paginaActual}`);

    // Verificar campos únicos
    const periodosUnicos = new Set(todasLasFilas.map(f => f.periodo).filter(p => p));
    console.log(`      Períodos únicos encontrados: ${periodosUnicos.size}`);
    console.log(`      Períodos: ${Array.from(periodosUnicos).slice(0, 5).join(', ')}${periodosUnicos.size > 5 ? '...' : ''}`);

    return {
        filas: todasLasFilas,
        totalFilas: todasLasFilas.length
    };
}

/**
 * Trunca texto para que no exceda el límite de Excel (32,767 caracteres)
 */
function truncarTexto(texto, limite = 32767) {
    if (!texto) return '';
    const textoStr = String(texto);
    if (textoStr.length <= limite) return textoStr;
    return textoStr.substring(0, limite - 3) + '...';
}

/**
 * Convierte un valor de texto a número (formato americano de AFIP: coma=miles, punto=decimal)
 * Ejemplos: "10,653.00" → 10653.00 | "519.66" → 519.66
 */
function convertirANumero(valor) {
    if (!valor || valor === '') return '';

    const valorStr = String(valor).trim();

    // Remover comas (separador de miles en formato americano)
    const numeroLimpio = valorStr.replace(/,/g, '');

    // Convertir a número
    const numero = parseFloat(numeroLimpio);

    // Si es válido, retornar con máximo 2 decimales
    if (!isNaN(numero)) {
        return parseFloat(numero.toFixed(2));
    }

    return '';
}

/**
 * Genera un archivo Excel con los datos extraídos
 */
async function generarArchivoExcel(datosTabla, datosPersonales, datosResumen, filtrosAvanzados, usuario, basePath, periodoDesde, periodoHasta, fechaCalculo) {
    console.log("   Generando archivo Excel con dos hojas...");

    // DEBUG: Verificar celdas problemáticas ANTES de truncar
    console.log('   🔍 Verificando longitud de celdas...');
    let celdasLargas = 0;
    datosTabla.filas.forEach((fila, idx) => {
        Object.entries(fila).forEach(([key, value]) => {
            if (value && String(value).length > 1000) {
                celdasLargas++;
                console.log(`   ⚠️ Fila ${idx + 1}, campo "${key}": ${String(value).length} caracteres`);
                if (String(value).length > 32767) {
                    console.log(`      ❌ EXCEDE LÍMITE! Primeros 200 chars: ${String(value).substring(0, 200)}...`);
                }
            }
        });
    });
    console.log(`   Total de celdas largas (>1000 chars): ${celdasLargas}`);

    // ========== HOJA 1: INFORMACIÓN GENERAL ==========
    console.log('   📄 Creando Hoja 1: Información General...');

    const infoGeneral = [];

    // Título
    infoGeneral.push({ 'Campo': 'CONSULTA DE DEUDA - AFIP', 'Valor': '' });
    infoGeneral.push({ 'Campo': '', 'Valor': '' }); // Línea en blanco

    // Datos personales
    if (datosPersonales && Object.keys(datosPersonales).length > 0) {
        infoGeneral.push({ 'Campo': '=== DATOS PERSONALES ===', 'Valor': '' });

        if (datosPersonales.cuit) {
            infoGeneral.push({ 'Campo': 'CUIT', 'Valor': datosPersonales.cuit });
        }

        if (datosPersonales.nombre) {
            infoGeneral.push({ 'Campo': 'Apellido y Nombre', 'Valor': datosPersonales.nombre });
        }

        if (datosPersonales.tipoContribuyente) {
            infoGeneral.push({ 'Campo': 'Tipo de Contribuyente', 'Valor': datosPersonales.tipoContribuyente });
        }

        if (datosPersonales.domicilio) {
            infoGeneral.push({ 'Campo': 'Domicilio', 'Valor': datosPersonales.domicilio });
        }

        if (datosPersonales.dependencia) {
            infoGeneral.push({ 'Campo': 'Dependencia', 'Valor': datosPersonales.dependencia });
        }

        infoGeneral.push({ 'Campo': '', 'Valor': '' }); // Línea en blanco
    }

    // Filtros avanzados
    if (filtrosAvanzados && Object.keys(filtrosAvanzados).length > 0) {
        infoGeneral.push({ 'Campo': '=== FILTRO AVANZADO ===', 'Valor': '' });

        if (filtrosAvanzados.periodoDesde) {
            infoGeneral.push({ 'Campo': 'Período Desde', 'Valor': filtrosAvanzados.periodoDesde });
        }

        if (filtrosAvanzados.periodoHasta) {
            infoGeneral.push({ 'Campo': 'Período Hasta', 'Valor': filtrosAvanzados.periodoHasta });
        }

        if (filtrosAvanzados.detalle) {
            infoGeneral.push({ 'Campo': 'Detalle', 'Valor': filtrosAvanzados.detalle });
        }

        if (filtrosAvanzados.impuesto) {
            infoGeneral.push({ 'Campo': 'Impuesto', 'Valor': filtrosAvanzados.impuesto });
        }

        if (filtrosAvanzados.concepto) {
            infoGeneral.push({ 'Campo': 'Concepto', 'Valor': filtrosAvanzados.concepto });
        }

        if (filtrosAvanzados.subconcepto) {
            infoGeneral.push({ 'Campo': 'Subconcepto', 'Valor': filtrosAvanzados.subconcepto });
        }

        infoGeneral.push({ 'Campo': '', 'Valor': '' }); // Línea en blanco
    }

    // Resumen de deuda (Última deuda calculada)
    if (datosResumen && Object.keys(datosResumen).length > 0) {
        infoGeneral.push({ 'Campo': '=== ÚLTIMA DEUDA CALCULADA ===', 'Valor': '' });

        if (datosResumen.fechaCalculo) {
            infoGeneral.push({ 'Campo': 'Fecha de Cálculo', 'Valor': datosResumen.fechaCalculo });
        }

        if (datosResumen.periodoTotal) {
            infoGeneral.push({ 'Campo': 'Período Total Calculado', 'Valor': datosResumen.periodoTotal });
        }

        if (datosResumen.totalSaldoDeudor) {
            infoGeneral.push({ 'Campo': 'Total Saldo Deudor', 'Valor': convertirANumero(datosResumen.totalSaldoDeudor) });
        }

        if (datosResumen.totalSaldoAcreedor) {
            infoGeneral.push({ 'Campo': 'Total Saldo Acreedor', 'Valor': convertirANumero(datosResumen.totalSaldoAcreedor) });
        }

        if (datosResumen.obligacionMensualDeudor) {
            infoGeneral.push({ 'Campo': 'Obligación Mensual (Deudor)', 'Valor': convertirANumero(datosResumen.obligacionMensualDeudor) });
        }

        if (datosResumen.obligacionMensualAcreedor) {
            infoGeneral.push({ 'Campo': 'Obligación Mensual (Acreedor)', 'Valor': convertirANumero(datosResumen.obligacionMensualAcreedor) });
        }

        if (datosResumen.accesoriosDeudor) {
            infoGeneral.push({ 'Campo': 'Accesorios (Deudor)', 'Valor': convertirANumero(datosResumen.accesoriosDeudor) });
        }

        if (datosResumen.accesoriosAcreedor) {
            infoGeneral.push({ 'Campo': 'Accesorios (Acreedor)', 'Valor': convertirANumero(datosResumen.accesoriosAcreedor) });
        }

        infoGeneral.push({ 'Campo': '', 'Valor': '' }); // Línea en blanco
    }

    // Información adicional
    infoGeneral.push({ 'Campo': 'Fecha de Consulta', 'Valor': fechaCalculo });
    infoGeneral.push({ 'Campo': 'Total de Registros', 'Valor': datosTabla.totalFilas });

    // Crear hoja de información general
    const hojaInfoGeneral = XLSX.utils.json_to_sheet(infoGeneral);

    // Aplicar formato de 2 decimales a los valores numéricos
    const rangoInfo = XLSX.utils.decode_range(hojaInfoGeneral['!ref']);
    for (let fila = rangoInfo.s.r + 1; fila <= rangoInfo.e.r; fila++) {
        const direccionCelda = XLSX.utils.encode_cell({ r: fila, c: 1 }); // Columna "Valor"
        const celda = hojaInfoGeneral[direccionCelda];

        if (celda && typeof celda.v === 'number') {
            celda.z = '0.00'; // Formato: 2 decimales exactos
        }
    }

    console.log(`   ✅ Hoja 1 creada con ${infoGeneral.length} filas`);

    // ========== HOJA 2: DETALLE DE DEUDA ==========
    console.log('   📄 Creando Hoja 2: Detalle de Deuda...');

    // Preparar datos para Excel con truncamiento de texto y conversión de números
    const datosParaExcel = datosTabla.filas.map(fila => ({
        'Detalle': truncarTexto(fila.detalle),
        'Período': truncarTexto(fila.periodo),
        'Impuesto': truncarTexto(fila.impuesto),
        'Concepto': truncarTexto(fila.concepto),
        'Subconcepto': truncarTexto(fila.subcpto),
        'Descripción': truncarTexto(fila.descripcion),
        'Fecha Movimiento': truncarTexto(fila.fechaMovimiento),
        'Debe': fila.debe ? convertirANumero(fila.debe) : '',
        'Haber': fila.haber ? convertirANumero(fila.haber) : '',
        'Saldo': fila.saldo ? convertirANumero(fila.saldo) : ''
    }));

    // DEBUG: Verificar que el truncamiento funcionó
    console.log('   ✅ Datos truncados. Verificando longitudes...');
    let maxLength = 0;
    datosParaExcel.forEach((fila, idx) => {
        Object.entries(fila).forEach(([key, value]) => {
            const len = String(value).length;
            if (len > maxLength) maxLength = len;
            if (len > 32767) {
                console.log(`   ❌ ERROR: Fila ${idx + 1}, campo "${key}" AÚN excede límite: ${len} caracteres`);
            }
        });
    });
    console.log(`   Longitud máxima de celda después de truncar: ${maxLength} caracteres`);

    // Crear hoja de detalle de deuda
    const hojaDetalleDeuda = XLSX.utils.json_to_sheet(datosParaExcel);

    // Aplicar formato de 2 decimales a las columnas numéricas
    const rango = XLSX.utils.decode_range(hojaDetalleDeuda['!ref']);
    const columnasNumericas = [7, 8, 9]; // Debe, Haber, Saldo

    for (let fila = rango.s.r + 1; fila <= rango.e.r; fila++) {
        columnasNumericas.forEach(col => {
            const direccionCelda = XLSX.utils.encode_cell({ r: fila, c: col });
            const celda = hojaDetalleDeuda[direccionCelda];

            if (celda && typeof celda.v === 'number') {
                celda.z = '0.00'; // Formato: 2 decimales exactos
            }
        });
    }

    console.log(`   ✅ Columnas numéricas con formato de 2 decimales (Debe, Haber, Saldo)`);
    console.log(`   ✅ Hoja 2 creada con ${datosTabla.filas.length} registros`);

    // ========== CREAR LIBRO DE TRABAJO ==========
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, hojaInfoGeneral, 'Información General');
    XLSX.utils.book_append_sheet(workbook, hojaDetalleDeuda, 'Detalle de Deuda');

    // Determinar ruta del archivo
    const downloadPath = getDownloadPath(basePath, usuario.nombre, 'archivos_afip');

    // Convertir períodos de "MM/AAAA" a "AAAA-MM"
    const convertirPeriodo = (periodo) => {
        if (!periodo) return '';
        const [mes, anio] = periodo.split('/');
        return `${anio}-${mes}`;
    };

    const periodoDesdeFormateado = convertirPeriodo(periodoDesde);
    const periodoHastaFormateado = convertirPeriodo(periodoHasta);
    const fechaCalculoformateada = fechaCalculo.replace(/\//g, '-');

    // Generar nombre de archivo con períodos consultados y fecha actual
    const fechaHoy = new Date();
    const dia = String(fechaHoy.getDate()).padStart(2, '0');
    const mes = String(fechaHoy.getMonth() + 1).padStart(2, '0');
    const anio = fechaHoy.getFullYear();
    const fechaFormateada = `${dia}-${mes}-${anio}`;

    // Formato: consulta_deuda_CUIT_YYYY-MM_a_YYYY-MM_DD-MM-YYYY.xlsx
    const nombreArchivo = `consulta_deuda_${usuario.cuit}_${periodoDesdeFormateado}_a_${periodoHastaFormateado}_${fechaCalculoformateada}.xlsx`;
    const rutaCompleta = path.join(downloadPath, nombreArchivo);

    // Guardar archivo
    XLSX.writeFile(workbook, rutaCompleta);

    console.log(`   ✅ Archivo Excel generado: ${nombreArchivo}`);
    console.log(`   Ruta: ${rutaCompleta}`);

    return rutaCompleta;
}

module.exports = {
    ejecutarFlujoConsultaDeuda
};
