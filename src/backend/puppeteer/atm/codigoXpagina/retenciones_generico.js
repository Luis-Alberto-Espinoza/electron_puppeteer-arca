const path = require('path');
const fs = require('fs').promises;
const { getDownloadPath, getFilenameRetenciones } = require('../../../utils/fileManager.js');
const { getDownloadPathContribuyente } = require('../../../cliente/carpetaContribuyente.js');

/**
 * Descarga retenciones/percepciones de forma genérica para cualquier sub-servicio de ATM
 *
 * Flujo:
 * 1. Obtener iframe
 * 2. Click en "Consultar"
 * 3. Detectar modal (si aparece) → Sin registros
 * 4. Verificar cantidad de registros
 * 5. Si cantidad > 0 → Descargar Excel + DIU
 * 6. Si cantidad = 0 → No descargar
 *
 * @param {Object} config - Configuración del subservicio
 * @param {string} config.nombre - Nombre del subservicio (ej: "Retenciones SIRTAC I.B.")
 * @param {import('puppeteer').Page} config.page - Página de Puppeteer (Oficina Virtual)
 * @param {string} config.nombreUsuario - Nombre del usuario para construir ruta
 * @param {string} config.cuit - CUIT del cliente
 * @param {string} config.downloadsPath - Ruta base de descargas
 * @param {string} config.periodo - Periodo en formato YYYY-MM (ej: "2025-01")
 * @param {boolean} [config.recargarAlFinal=true] - Recargar la pagina al terminar.
 *        Se pone en false cuando vamos a consultar otro periodo del mismo
 *        sub-servicio: la pantalla queda lista para cambiar anio/mes y volver a
 *        consultar, asi evitamos re-navegar el menu en cada periodo.
 * @returns {Promise<Object>} Resultado de la descarga
 */
async function descargarRetencionGenerico(config) {
    const { nombre, page, nombreUsuario, cuit, downloadsPath, periodo, recargarAlFinal = true } = config;

    try {
        console.log(`[${nombre}] 🔄 Iniciando descarga para ${periodo}...`);

        // Validar periodo
        const periodoRegex = /^(\d{4})-(\d{2})$/;
        const match = periodo.match(periodoRegex);

        if (!match) {
            throw new Error(`Formato de periodo inválido: "${periodo}". Esperado: YYYY-MM`);
        }

        const anio = match[1];
        const mes = match[2];
        const mesNumero = parseInt(mes);

        if (mesNumero < 1 || mesNumero > 12) {
            throw new Error(`Mes inválido: "${mes}". Debe estar entre 01 y 12.`);
        }

        // Obtener iframe
        const frameHandle = await page.waitForSelector('iframe[src="nucleo/inicio.zul"]', { timeout: 10000 });
        const frame = await frameHandle.contentFrame();

        if (!frame) {
            throw new Error('No se pudo encontrar el contentFrame del iframe.');
        }

        // Configurar periodo (año y mes)
        await frame.waitForSelector('input.z-bandbox-input[value]', { timeout: 10000 });

        // Función helper para seleccionar un valor en un bandbox.
        //
        // Trampas de ZK que ya nos mordieron:
        //   1) Al item ya seleccionado le agrega " selected" al aria-label, asi que
        //      "2026" pasa a ser "2026 selected". Al recorrer varios meses del mismo
        //      año, el segundo mes fallaba con "Valor 2026 no encontrado".
        //   2) Las filas de la grilla de resultados tambien son .z-listitem con
        //      aria-label, asi que hay que mirar solo lo que cuelga de un .z-bandpopup.
        //   3) Hay MAS DE UN .z-bandpopup en el DOM (año y mes) y quedarse con "el
        //      popup visible" agarra el equivocado: buscabamos "11" en la lista de años.
        //      Por eso buscamos el valor en todos los popups de bandbox a la vez;
        //      los años y los meses no se pisan entre si.
        async function seleccionarEnBandbox(frame, bandboxIndex, valorBuscado, nombreCampo) {
            const MAX_INTENTOS = 2;
            let ultimoError = null;

            for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
                try {
                    const botonesBandbox = await frame.$$('.z-bandbox-button');

                    if (bandboxIndex >= botonesBandbox.length) {
                        throw new Error(`No se encontró el bandbox en el índice ${bandboxIndex}`);
                    }

                    const botonBandbox = botonesBandbox[bandboxIndex];
                    await botonBandbox.click();

                    // Esperar a que el valor buscado exista dentro de algún popup de bandbox
                    await frame.waitForFunction(
                        (valor) => {
                            const limpiar = (texto) => String(texto || '').replace(/\s*selected\s*$/i, '').trim();
                            return Array.from(document.querySelectorAll('.z-bandpopup .z-listitem'))
                                .some(item => limpiar(item.getAttribute('aria-label') || item.textContent) === valor);
                        },
                        { timeout: 5000 },
                        valorBuscado
                    );

                    await new Promise(resolve => setTimeout(resolve, 300));

                    // Buscar y hacer clic en el item (solo dentro de popups de bandbox)
                    const resultado = await frame.evaluate((valor) => {
                        // ZK marca el item activo agregando " selected" al aria-label
                        const limpiar = (texto) => String(texto || '').replace(/\s*selected\s*$/i, '').trim();
                        const etiqueta = (el) => limpiar(el.getAttribute('aria-label') || el.textContent);

                        const items = Array.from(document.querySelectorAll('.z-bandpopup .z-listitem'));
                        const item = items.find(i => etiqueta(i) === valor);

                        if (!item) {
                            return { encontrado: false, itemsDisponibles: items.map(etiqueta) };
                        }

                        const yaEstaba = /\s*selected\s*$/i.test(item.getAttribute('aria-label') || '');
                        item.click();
                        return { encontrado: true, itemsDisponibles: [], yaEstaba };
                    }, valorBuscado);

                    if (!resultado.encontrado) {
                        throw new Error(`Valor "${valorBuscado}" no encontrado. Disponibles: ${resultado.itemsDisponibles.join(', ')}`);
                    }

                    if (resultado.yaEstaba) {
                        console.log(`[${nombre}]    ${nombreCampo}: "${valorBuscado}" ya estaba seleccionado`);
                    }

                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Verificación suave: el input del bandbox debería mostrar el valor.
                    // Solo avisamos; la verificación dura es el nombre del archivo que baja ATM.
                    const valorInput = await frame.evaluate((idx) => {
                        const inputs = document.querySelectorAll('input.z-bandbox-input');
                        return inputs[idx] ? String(inputs[idx].value || '').trim() : null;
                    }, bandboxIndex);

                    if (valorInput && valorInput !== valorBuscado) {
                        console.warn(`[${nombre}]    ⚠️ ${nombreCampo}: se pidió "${valorBuscado}" y el campo muestra "${valorInput}"`);
                    }

                    return;

                } catch (error) {
                    ultimoError = error;
                    console.error(`[${nombre}] ❌ Error seleccionando ${nombreCampo} (intento ${intento}/${MAX_INTENTOS}): ${error.message}`);

                    if (intento < MAX_INTENTOS) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            }

            throw ultimoError;
        }

        // Seleccionar año y mes
        await seleccionarEnBandbox(frame, 0, anio, 'año');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await seleccionarEnBandbox(frame, 1, mes, 'mes/cuota');
        console.log(`[${nombre}]    ✓ Periodo configurado: ${anio}-${mes}`);

        // Marcar el estado actual antes de consultar.
        // Al recorrer varios periodos sin recargar la pagina, el label "Cantidad:"
        // conserva el numero del periodo anterior; sin esta marca podriamos leer
        // datos viejos y descargar el periodo equivocado.
        const estadoPrevio = await frame.evaluate(() => {
            // Huella de la grilla: cantidad de filas + primera y ultima.
            // Con la cantidad sola no alcanza: dos meses seguidos con el mismo numero
            // de registros parecian "no refrescados" y nos comiamos la espera entera.
            const filas = Array.from(document.querySelectorAll('.z-listitem'))
                .filter(fila => !fila.closest('.z-bandpopup'));
            const textoFila = (fila) => String(fila.getAttribute('aria-label') || fila.textContent || '').trim().slice(0, 120);
            const huellaGrilla = [
                filas.length,
                filas.length ? textoFila(filas[0]) : '',
                filas.length ? textoFila(filas[filas.length - 1]) : ''
            ].join('|');

            const spans = Array.from(document.querySelectorAll('span.z-label'));
            const cantidadLabel = spans.find(span => span.textContent.trim() === 'Cantidad:');
            const hlayout = cantidadLabel ? cantidadLabel.closest('.z-hlayout') : null;

            if (!hlayout) return { habia: false, texto: '', huellaGrilla };

            const allSpans = hlayout.querySelectorAll('span.z-label');
            const texto = allSpans.length >= 2 ? allSpans[1].textContent.trim() : '';
            hlayout.setAttribute('data-consulta-previa', texto);
            return { habia: true, texto, huellaGrilla };
        });

        // Click en "Consultar"
        await frame.waitForFunction(
            () => {
                const buttons = document.querySelectorAll('.z-button');
                for (const btn of buttons) {
                    if (btn.textContent.trim() === 'Consultar') {
                        return true;
                    }
                }
                return false;
            },
            { timeout: 10000 }
        );

        await frame.evaluate(() => {
            const buttons = document.querySelectorAll('.z-button');
            for (const btn of buttons) {
                if (btn.textContent.trim() === 'Consultar') {
                    btn.click();
                    return;
                }
            }
        });

        // Esperar la respuesta de la consulta: o aparece el modal "sin registros",
        // o el label "Cantidad:" se refresca con el numero del periodo pedido.
        // 4 segundos: es tiempo muerto puro cuando ATM no muestra el cartel de
        // "sin registros" y el mes nuevo se ve igual que el anterior en pantalla.
        const respuesta = await esperarRespuestaConsulta(frame, estadoPrevio, 4000);

        if (respuesta.modalDetectado) {
            console.log(`[${nombre}]    ⊘ Sin registros`);
            return {
                success: true,
                tipo: nombre,
                registros: 0,
                archivosDescargados: 0,
                files: [],
                downloadDir: null,
                mensaje: 'Sin registros (modal)',
                alertMensaje: respuesta.modalMensaje
            };
        }

        if (!respuesta.refrescado) {
            // No pudimos confirmar el refresco (por ejemplo, el periodo nuevo tiene la
            // misma cantidad que el anterior). Seguimos con lo ultimo leido y avisamos.
            console.warn(`[${nombre}]    ⚠️ No se pudo confirmar el refresco de la consulta. Debug: ${respuesta.debug}`);
        }

        const cantidad = respuesta.cantidad;

        if (cantidad === 0) {
            console.log(`[${nombre}]    ⊘ Sin registros (cantidad = 0)`);
            return {
                success: true,
                tipo: nombre,
                registros: 0,
                archivosDescargados: 0,
                files: [],
                downloadDir: null,
                mensaje: 'Sin registros (cantidad = 0)'
            };
        }

        console.log(`[${nombre}]    ✓ ${cantidad} registro(s) encontrado(s)`);

        // Preparar descarga
        const downloadDir = await getDownloadPathContribuyente(downloadsPath, cuit, nombreUsuario, 'archivos_atm/RetencionesYPercepciones');
        const archivosAntesDeDescarga = await fs.readdir(downloadDir);

        // Configurar CDP session para descargas
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadDir
        });

        // Esperar botones de exportación
        await frame.waitForFunction(
            () => {
                const btnExcel = Array.from(document.querySelectorAll('.z-button'))
                    .find(btn =>
                        btn.textContent.trim() === 'Exportar a Excel' ||
                        btn.title === 'Exportar a Excel'
                    );
                const btnDIU = Array.from(document.querySelectorAll('.z-button'))
                    .find(btn =>
                        btn.textContent.trim() === 'Exportar a TXT para DIU' ||
                        btn.title === 'Exportar a TXT para DIU'
                    );
                return btnExcel && btnDIU;
            },
            { timeout: 15000 }
        );

        // Descargar archivos
        console.log(`[${nombre}]    📥 Descargando archivos...`);

        // Helper: obtener archivos nuevos en el directorio
        const obtenerArchivosNuevos = async () => {
            const archivosActuales = await fs.readdir(downloadDir);
            return archivosActuales.filter(archivo => !archivosAntesDeDescarga.includes(archivo));
        };

        // Click en Excel
        console.log(`[${nombre}]       Clickeando botón Excel...`);
        const excelClicked = await frame.evaluate(() => {
            const btnExcel = Array.from(document.querySelectorAll('.z-button'))
                .find(btn =>
                    btn.textContent.trim() === 'Exportar a Excel' ||
                    btn.title === 'Exportar a Excel'
                );
            if (btnExcel) {
                btnExcel.click();
                return true;
            }
            return false;
        });

        if (!excelClicked) {
            throw new Error('No se pudo hacer click en botón Excel');
        }

        // CRÍTICO: Esperar a que el Excel empiece a descargarse antes de clickear DIU
        // Timeout DINÁMICO basado en cantidad de registros
        let timeoutEsperaExcel;
        if (cantidad < 50) {
            timeoutEsperaExcel = 5000;  // 5 segundos para pocos registros
        } else if (cantidad < 200) {
            timeoutEsperaExcel = 15000; // 15 segundos
        } else if (cantidad < 500) {
            timeoutEsperaExcel = 30000; // 30 segundos
        } else {
            timeoutEsperaExcel = 60000; // 60 segundos para muchos registros
        }

        console.log(`[${nombre}]       Esperando Excel (máx ${timeoutEsperaExcel/1000}s para ${cantidad} registros)...`);
        const inicioEsperaExcel = Date.now();
        let excelDetectado = false;
        let ultimoLog = 0;

        while (!excelDetectado && (Date.now() - inicioEsperaExcel < timeoutEsperaExcel)) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Verificar cada 500ms (más rápido)

            const archivosNuevos = await obtenerArchivosNuevos();

            // Buscar específicamente archivo Excel (completo o en progreso)
            // Nota: ATM genera .xls (Excel antiguo), no .xlsx
            const archivoExcel = archivosNuevos.find(archivo =>
                archivo.endsWith('.xlsx') || archivo.endsWith('.xlsx.crdownload') ||
                archivo.endsWith('.xls') || archivo.endsWith('.xls.crdownload')
            );

            if (archivoExcel) {
                excelDetectado = true;
                console.log(`[${nombre}]       ✓ Excel detectado: ${archivoExcel}`);
                break; // Salir inmediatamente
            }

            // Log cada 5 segundos solo si hay archivos (para debug)
            const tiempoTranscurrido = Date.now() - inicioEsperaExcel;
            if (tiempoTranscurrido - ultimoLog >= 5000) {
                const tiposArchivos = archivosNuevos.map(a => a.split('.').pop()).join(', ');
                console.log(`[${nombre}]          [${Math.round(tiempoTranscurrido/1000)}s] ${archivosNuevos.length} archivo(s): ${tiposArchivos || 'ninguno'}`);
                ultimoLog = tiempoTranscurrido;
            }
        }

        if (!excelDetectado) {
            const tiempoEsperado = Math.round((Date.now() - inicioEsperaExcel) / 1000);
            console.warn(`[${nombre}]       ⚠️ Excel no detectado después de ${tiempoEsperado}s, continuando...`);
        }

        // Pequeña pausa antes de clickear DIU
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Click en DIU
        console.log(`[${nombre}]       Clickeando botón DIU...`);
        const diuClicked = await frame.evaluate(() => {
            const btnDIU = Array.from(document.querySelectorAll('.z-button'))
                .find(btn =>
                    btn.textContent.trim() === 'Exportar a TXT para DIU' ||
                    btn.title === 'Exportar a TXT para DIU'
                );
            if (btnDIU) {
                btnDIU.click();
                return true;
            }
            return false;
        });

        if (!diuClicked) {
            throw new Error('No se pudo hacer click en botón DIU');
        }

        // CRÍTICO: Esperar activamente a que AMBOS archivos estén completos
        console.log(`[${nombre}]       Esperando que ambos archivos terminen de descargarse...`);

        const tiempoInicio = Date.now();
        // Timeout dinámico: base 60s + 1s por cada 50 registros (para archivos grandes)
        const timeoutBase = 60000;
        const timeoutExtra = Math.ceil(cantidad / 50) * 1000;
        const timeoutMaximo = Math.min(timeoutBase + timeoutExtra, 180000); // Máximo 3 minutos
        console.log(`[${nombre}]       Timeout configurado: ${timeoutMaximo/1000}s (${cantidad} registros)`);

        let archivosNuevos = [];
        let archivosCompletos = [];
        let ultimoReporte = 0;

        while (archivosCompletos.length < 2 && (Date.now() - tiempoInicio < timeoutMaximo)) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Verificar cada 500ms

            archivosNuevos = await obtenerArchivosNuevos();

            // Filtrar solo los archivos completos (sin .crdownload)
            archivosCompletos = archivosNuevos.filter(
                archivo => !archivo.endsWith('.crdownload')
            );

            const enProgreso = archivosNuevos.filter(a => a.endsWith('.crdownload'));

            // Reportar cada 5 segundos
            const tiempoTranscurrido = Date.now() - tiempoInicio;
            if (tiempoTranscurrido - ultimoReporte >= 5000) {
                console.log(`[${nombre}]          [${Math.round(tiempoTranscurrido/1000)}s] ${archivosCompletos.length} completo(s), ${enProgreso.length} en progreso`);
                if (enProgreso.length > 0) {
                    console.log(`[${nombre}]             En progreso: ${enProgreso.join(', ')}`);
                }
                ultimoReporte = tiempoTranscurrido;
            }

            // Si hay archivos en progreso, seguir esperando aunque pase el timeout base
            // (solo cortar si pasa el timeout máximo absoluto)
            if (enProgreso.length > 0 && archivosCompletos.length < 2) {
                // Extender espera si hay descargas activas
                continue;
            }
        }

        // Usar archivosCompletos para el resto del proceso
        archivosNuevos = archivosCompletos;

        if (archivosNuevos.length < 2) {
            const enProgreso = (await fs.readdir(downloadDir)).filter(a => a.endsWith('.crdownload'));
            console.warn(`[${nombre}]       ⚠️ Solo ${archivosNuevos.length} archivo(s) completo(s) después de ${Math.round((Date.now() - tiempoInicio)/1000)}s`);
            console.warn(`[${nombre}]          Archivos completos: ${archivosNuevos.join(', ') || 'ninguno'}`);
            if (enProgreso.length > 0) {
                console.warn(`[${nombre}]          Archivos incompletos (.crdownload): ${enProgreso.join(', ')}`);
            }
        } else {
            console.log(`[${nombre}]       ✓ Ambos archivos descargados correctamente`);
        }

        // Verificación dura del periodo: ATM nombra los archivos CUIT_AAAA_MM.
        // Si lo que bajó no es el mes que pedimos, lo estaríamos renombrando mal.
        let periodoArchivoInesperado = null;
        for (const archivo of archivosNuevos) {
            const marcaPeriodo = archivo.match(/_(\d{4})_(\d{2})\b/);
            if (marcaPeriodo && (marcaPeriodo[1] !== anio || marcaPeriodo[2] !== mes)) {
                periodoArchivoInesperado = `${marcaPeriodo[1]}-${marcaPeriodo[2]}`;
            }
        }

        if (periodoArchivoInesperado) {
            console.error(`[${nombre}] ╔══════════════════════════════════════════════════════════════╗`);
            console.error(`[${nombre}] ║ ⚠️  PERIODO QUE NO COINCIDE                                    ║`);
            console.error(`[${nombre}] ║ Se pidió ${periodo} y ATM devolvió archivos de ${periodoArchivoInesperado}`);
            console.error(`[${nombre}] ╚══════════════════════════════════════════════════════════════╝`);
        }

        // Renombrar archivos NUEVOS
        const archivosRenombrados = [];
        for (const archivo of archivosNuevos) {
            const archivoPath = path.join(downloadDir, archivo);
            const extension = path.extname(archivo).substring(1);
            const nuevoNombre = getFilenameRetenciones(cuit, nombre, periodo, extension);
            const nuevoPath = path.join(downloadDir, nuevoNombre);

            await fs.rename(archivoPath, nuevoPath);
            archivosRenombrados.push(nuevoPath);
        }

        console.log(`[${nombre}]    ✓ ${archivosRenombrados.length} archivo(s) descargado(s)`);

        // ═══════════════════════════════════════════════════════════════════
        // RESUMEN FINAL - Verificación de integridad de descarga
        // ═══════════════════════════════════════════════════════════════════
        const archivosDescargados = archivosRenombrados;
        const cantidadArchivos = archivosDescargados.length;

        if (cantidad >= 1 && cantidadArchivos === 2) {
            // ÉXITO TOTAL: Tenía registros y descargó ambos archivos
            console.log(`[${nombre}] ════════════════════════════════════════════════════════════`);
            console.log(`[${nombre}] ✅✅✅ ÉXITO COMPLETO: ${cantidad} registro(s) → ${cantidadArchivos} archivo(s) ✅✅✅`);
            console.log(`[${nombre}] ════════════════════════════════════════════════════════════`);
        } else if (cantidad >= 1 && cantidadArchivos < 2) {
            // PROBLEMA: Tenía registros pero NO descargó los 2 archivos esperados
            console.log(`[${nombre}] ╔══════════════════════════════════════════════════════════════╗`);
            console.log(`[${nombre}] ║ ⚠️⚠️⚠️  ATENCIÓN: DESCARGA INCOMPLETA  ⚠️⚠️⚠️                    ║`);
            console.log(`[${nombre}] ║ Registros: ${cantidad.toString().padEnd(4)} | Archivos descargados: ${cantidadArchivos} (esperado: 2) ║`);
            console.log(`[${nombre}] ║ CUIT: ${cuit.padEnd(15)}                                    ║`);
            console.log(`[${nombre}] ╚══════════════════════════════════════════════════════════════╝`);
        }

        // Cerrar la sesion CDP: al recorrer varios periodos abrimos una por consulta.
        try {
            await client.detach();
        } catch (errorDetach) {
            // La sesion pudo haberse cerrado sola; no es motivo para abortar.
        }

        if (recargarAlFinal) {
            // CRÍTICO: Recargar página para estabilizar el DOM después de las descargas
            console.log(`[${nombre}]    🔄 Recargando página...`);
            await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2s para estabilización
            console.log(`[${nombre}]    ✓ Página estabilizada`);
        } else {
            // La pantalla queda usable: alcanza con volver a elegir año/mes y consultar.
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        return {
            success: true,
            tipo: nombre,
            periodoArchivoInesperado,
            registros: cantidad,
            archivosDescargados: archivosDescargados.length,
            files: archivosDescargados,
            downloadDir: downloadDir,
            mensaje: 'Éxito'
        };

    } catch (error) {
        console.error(`[${nombre}] ❌ ERROR: ${error.message}`);
        throw error;
    }
}

/**
 * Espera la respuesta de un click en "Consultar".
 *
 * Devuelve apenas pasa una de estas dos cosas:
 *   - aparece el modal de "sin registros" (lo acepta y avisa), o
 *   - el label "Cantidad:" muestra un numero que corresponde a esta consulta.
 *
 * Para saber si el numero es nuevo usamos la marca data-consulta-previa que se
 * dejo antes de consultar: si ZK volvio a renderizar el nodo, la marca ya no
 * esta; si el nodo es el mismo, comparamos contra el texto anterior.
 *
 * @param {import('puppeteer').Frame} frame - Frame del formulario.
 * @param {{habia: boolean, texto: string}} estadoPrevio - Estado antes de consultar.
 * @param {number} timeout - Milisegundos maximos de espera.
 * @returns {Promise<Object>} { modalDetectado, modalMensaje, refrescado, cantidad, debug }
 */
async function esperarRespuestaConsulta(frame, estadoPrevio, timeout) {
    const inicio = Date.now();
    let ultimo = { modalDetectado: false, modalMensaje: '', refrescado: false, cantidad: 0, debug: 'sin lecturas' };

    while (Date.now() - inicio < timeout) {
        await new Promise(resolve => setTimeout(resolve, 500));

        ultimo = await frame.evaluate((previo) => {
            const resultado = { modalDetectado: false, modalMensaje: '', refrescado: false, cantidad: 0, debug: '' };

            // 1) Modal ZK de "sin registros"
            const modal = document.querySelector('.z-window-modal[role="dialog"][aria-modal="true"]');
            if (modal) {
                const style = window.getComputedStyle(modal);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    const spanMensaje = modal.querySelector('.z-window-content .z-label');
                    resultado.modalDetectado = true;
                    resultado.modalMensaje = spanMensaje ? spanMensaje.textContent.trim() : 'Modal sin mensaje';

                    const btnAceptar = modal.querySelector('.z-window-content .z-button');
                    if (btnAceptar) btnAceptar.click();

                    return resultado;
                }
            }

            // 2) Cantidad de registros
            const spans = Array.from(document.querySelectorAll('span.z-label'));
            const cantidadLabel = spans.find(span => span.textContent.trim() === 'Cantidad:');

            if (!cantidadLabel) {
                resultado.debug = 'Label "Cantidad:" NO encontrado. ';
                const similares = spans.map(s => s.textContent.trim()).filter(t => t.includes('antidad'));
                resultado.debug += `Textos similares: ${similares.join(', ') || 'ninguno'}`;
                return resultado;
            }

            const hlayout = cantidadLabel.closest('.z-hlayout');
            if (!hlayout) {
                resultado.debug = 'hlayout NO encontrado. ';
                const hermano = cantidadLabel.nextElementSibling;
                if (hermano) {
                    const numero = parseInt(hermano.textContent.trim());
                    resultado.cantidad = isNaN(numero) ? 0 : numero;
                    resultado.refrescado = !isNaN(numero);
                    resultado.debug += `Hermano: "${hermano.textContent.trim()}". `;
                }
                return resultado;
            }

            const allSpans = hlayout.querySelectorAll('span.z-label');
            if (allSpans.length < 2) {
                resultado.debug = `Solo ${allSpans.length} span(s) en el hlayout.`;
                return resultado;
            }

            const texto = allSpans[1].textContent.trim();
            const numero = parseInt(texto);

            const filas = Array.from(document.querySelectorAll('.z-listitem'))
                .filter(fila => !fila.closest('.z-bandpopup'));
            const textoFila = (fila) => String(fila.getAttribute('aria-label') || fila.textContent || '').trim().slice(0, 120);
            const huellaGrilla = [
                filas.length,
                filas.length ? textoFila(filas[0]) : '',
                filas.length ? textoFila(filas[filas.length - 1]) : ''
            ].join('|');

            resultado.debug = `Texto cantidad: "${texto}" (previo "${previo.texto}"). Filas: ${filas.length}.`;

            if (texto === '' || isNaN(numero)) return resultado;

            resultado.cantidad = numero;
            // Es nuevo si no habia consulta previa, si ZK re-renderizo el nodo
            // (perdio la marca), si cambio el numero o si cambio la grilla.
            const marca = hlayout.getAttribute('data-consulta-previa');
            resultado.refrescado = !previo.habia
                || marca === null
                || texto !== previo.texto
                || huellaGrilla !== previo.huellaGrilla;

            return resultado;
        }, estadoPrevio);

        if (ultimo.modalDetectado || ultimo.refrescado) return ultimo;
    }

    return ultimo;
}

module.exports = { descargarRetencionGenerico };
