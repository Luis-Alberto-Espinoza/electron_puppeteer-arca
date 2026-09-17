const path = require('path');
const fs = require('fs').promises;
const { getDownloadPath, getFilenameRetenciones } = require('../../../utils/fileManager.js');
const { getDownloadPathContribuyente } = require('../../../cliente/carpetaContribuyente.js');
const {
    iniciarSondaDescargas,
    esperarDescarga,
    estimarGeneracionMs,
    techoDescargaMs
} = require('./descarga_espera.js');

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

    // Vigila las pestañas y las descargas del navegador: es quien sabe cuando
    // ATM termino de generar. Ver descarga_espera.js
    let sonda = null;

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

        // Esperar la respuesta de la consulta. El limite es alto a proposito:
        // se sale por senal (modal o ciclo de ZK terminado), no por reloj, asi
        // que 30s es una red de seguridad y no una espera real. El "sin
        // registros" sigue saliendo a ~265ms. Ver esperarRespuestaConsulta.
        const respuesta = await esperarRespuestaConsulta(frame, estadoPrevio, 30000);

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

        if (respuesta.indeterminado) {
            // No pudimos leer la respuesta. Antes esto caia en "cantidad = 0" y
            // el periodo se salteaba en silencio con success:true. Preferimos
            // fallar fuerte: el flujo lo reporta y sigue con el resto del rango.
            throw new Error(
                `No se pudo determinar si hay registros para ${periodo} despues de 30s. ` +
                `La consulta de ATM no respondio o el label "Cantidad:" nunca se completo. ` +
                `Debug: ${respuesta.debug}`
            );
        }

        if (!respuesta.refrescado) {
            // Leimos un numero pero no pudimos confirmar que sea de esta consulta
            // (por ejemplo, el periodo nuevo tiene la misma cantidad que el
            // anterior). Seguimos con lo leido y avisamos.
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

        // Misma carpeta que la linea de arriba. Los dos setDownloadBehavior
        // conviven a proposito: el de pagina es la red por si la sonda no
        // pudiera abrir su sesion CDP y quedara inerte.
        sonda = await iniciarSondaDescargas({ page, downloadDir, etiqueta: nombre });

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

        // Helper: obtener archivos nuevos en el directorio
        const obtenerArchivosNuevos = async () => {
            const archivosActuales = await fs.readdir(downloadDir);
            return archivosActuales.filter(archivo => !archivosAntesDeDescarga.includes(archivo));
        };

        // ═══════════════════════════════════════════════════════════════════
        // DESCARGA: se corta por senal, no por reloj.
        //
        // La pestana en blanco que abre ATM vive exactamente lo que dura la
        // generacion del archivo; mirar la carpeta no distingue "ATM esta
        // pensando" de "no paso nada". Todo el porque y los numeros medidos
        // estan en descarga_espera.js.
        // ═══════════════════════════════════════════════════════════════════
        const techoMs = techoDescargaMs(cantidad);
        const estimadoSegundos = Math.round(estimarGeneracionMs(cantidad) / 1000);
        console.log(`[${nombre}]       ATM tarda ~${estimadoSegundos}s en armar el Excel de ${cantidad} registros (techo de seguridad: ${Math.round(techoMs / 1000)}s)`);

        // El avance de la espera va a la bitacora, no a consola: con 7 minutos
        // de generacion son 27 lineas iguales que tapan el log del lote. Si el
        // periodo termina incompleto, la cronologia las muestra todas.
        const avance = (texto) => sonda.marcar(texto);
        const clickEnBoton = (titulo) => frame.evaluate((tituloBoton) => {
            const boton = Array.from(document.querySelectorAll('.z-button'))
                .find(btn => btn.textContent.trim() === tituloBoton || btn.title === tituloBoton);
            if (!boton) return false;
            boton.click();
            return true;
        }, titulo);

        // --- Excel. El observador se crea ANTES del click: si naciera despues,
        //     se perderia la pestana, que aparece a los 110ms.
        const observadorExcel = sonda.observar(`click Excel (${cantidad} registros)`);
        if (!await clickEnBoton('Exportar a Excel')) {
            throw new Error('No se pudo hacer click en botón Excel');
        }

        const resultadoExcel = await esperarDescarga({
            observador: observadorExcel, techoMs, queEs: 'Excel', log: avance
        });

        if (resultadoExcel.ok) {
            console.log(`[${nombre}]       ✓ Excel listo en ${(resultadoExcel.ms / 1000).toFixed(1)}s: ${resultadoExcel.nombre}`);
        } else {
            console.warn(`[${nombre}]       ✗ Excel: ${resultadoExcel.motivo}`);
        }

        // --- DIU. Se pide IGUAL aunque el Excel haya fallado: medido contra
        //     ATM nunca tardo mas de 6s, ni siquiera con 2468 registros, asi
        //     que no hay razon para perderlo por culpa del otro archivo.
        await new Promise(resolve => setTimeout(resolve, 1000));
        const observadorDiu = sonda.observar('click DIU');
        if (!await clickEnBoton('Exportar a TXT para DIU')) {
            throw new Error('No se pudo hacer click en botón DIU');
        }

        const resultadoDiu = await esperarDescarga({
            observador: observadorDiu, techoMs, queEs: 'DIU', log: avance
        });

        if (resultadoDiu.ok) {
            console.log(`[${nombre}]       ✓ DIU listo en ${(resultadoDiu.ms / 1000).toFixed(1)}s: ${resultadoDiu.nombre}`);
        } else {
            console.warn(`[${nombre}]       ✗ DIU: ${resultadoDiu.motivo}`);
        }

        // Si algo quedo generando, hay que cerrarle la pestana: si entrega mas
        // tarde, el archivo cae en esta misma carpeta mientras corre el servicio
        // siguiente, y el renombrador lo adopta como propio. Ademas ATM le pone
        // el MISMO nombre a todos los Excel (CUIT_AAAA_MM.xls), asi que un
        // archivo tardio pisa al del otro servicio sin dejar rastro.
        const huerfanas = await sonda.cerrarHuerfanas();
        if (huerfanas) {
            console.warn(`[${nombre}]       ⚠️ ${huerfanas} pestaña(s) cerradas a la fuerza: ATM seguía generando`);
        }

        const fallaron = [
            resultadoExcel.ok ? null : `Excel (${resultadoExcel.motivo})`,
            resultadoDiu.ok ? null : `DIU (${resultadoDiu.motivo})`
        ].filter(Boolean);

        await sonda.detener();

        // Lo que efectivamente quedo en la carpeta, ya sin descargas a medio bajar.
        const archivosNuevos = (await obtenerArchivosNuevos())
            .filter(archivo => !archivo.endsWith('.crdownload'));

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
            console.error(`[${nombre}]    ⚠️ PERIODO QUE NO COINCIDE: se pidió ${periodo} y ATM devolvió archivos de ${periodoArchivoInesperado}`);
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

        const archivosDescargados = archivosRenombrados;
        const cantidadArchivos = archivosDescargados.length;

        if (cantidadArchivos === 2) {
            console.log(`[${nombre}]    ✓ ${cantidad} registro(s) → ${cantidadArchivos} archivo(s)`);
        } else {
            // Falto algo: esto tiene que saltar a la vista en el log del lote.
            console.error(`[${nombre}]    ⚠️ DESCARGA INCOMPLETA: ${cantidad} registro(s) → ${cantidadArchivos} de 2 archivo(s). CUIT ${cuit}`);
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

        // El valor de retorno no miente: si falto un archivo, esto NO es exito.
        // Se exige lo que dijo la espera Y lo que hay en disco, porque un
        // archivo que llega tarde puede hacer que una espera se de por buena
        // sin que el archivo propio haya bajado.
        // No tiramos error a proposito: el flujo reintenta ante una excepcion y
        // reintentar 7 minutos de generacion no arregla nada; le devolvemos el
        // fracaso con los archivos que si bajaron.
        const salioTodo = fallaron.length === 0 && cantidadArchivos === 2;
        if (!salioTodo && !fallaron.length) {
            fallaron.push(`solo quedaron ${cantidadArchivos} de 2 archivos en la carpeta`);
        }

        // La cronologia se vuelca solo si hay algo que investigar: cuando el
        // periodo sale bien no aporta nada y tapa el log del lote. Va aca y no
        // antes, para que alcance tambien al caso en que la espera dio por
        // buenos los dos archivos pero en la carpeta quedo uno solo.
        if (!salioTodo) sonda.resumen();
        sonda = null;

        return {
            success: salioTodo,
            tipo: nombre,
            periodoArchivoInesperado,
            registros: cantidad,
            archivosDescargados: archivosDescargados.length,
            files: archivosDescargados,
            downloadDir: downloadDir,
            mensaje: fallaron.length ? `No se pudo descargar: ${fallaron.join(' y ')}` : 'Éxito'
        };

    } catch (error) {
        if (sonda) {
            sonda.marcar(`el flujo aborto: ${error.message}`);
            sonda.resumen();
            await sonda.detener();
        }
        console.error(`[${nombre}] ❌ ERROR: ${error.message}`);
        throw error;
    }
}

/**
 * Espera la respuesta de un click en "Consultar".
 *
 * REGLA CENTRAL: mientras ZK tenga un pedido en vuelo NO se decide nada.
 * Antes esto miraba solo el label "Cantidad:" durante 4 segundos fijos y, si el
 * label todavia estaba vacio, devolvia cantidad 0. Un cliente con percepciones
 * que tardaban 5,2s se reportaba como "sin registros" y no se descargaba nada,
 * en silencio y con success:true. Medido en vivo el 2026-09-15 muestreando el
 * DOM cada 250ms (CUIT 30711438781, periodo 2026-08):
 *
 *   sin registros -> el modal aparece a ~265ms
 *   11 registros  -> el label se llena a 3593ms  (zafaba por 400ms)
 *   35 registros  -> el label se llena a 5188ms  (se lo comia)
 *
 * Por eso ahora esperamos el CICLO de ZK (zk.processing / .z-loading), no el
 * reloj. El caso comun no paga nada: el modal de "sin registros" sale a 265ms.
 *
 * Senales que se midieron y NO sirven, para que nadie las vuelva a proponer:
 *   - Los botones Excel/DIU estan presentes y habilitados desde t=0, incluso
 *     cuando no hay ni un registro. No dicen nada.
 *   - El paginador quedo en "/ 1" con 11 registros y en "/ 2" con 35.
 *   - Contar <tr> del listbox arrastra las filas de los popups de anio/mes.
 *   - OJO: filas visibles != cantidad. La grilla pagina de a 20, asi que con
 *     35 registros se ven 20. Nunca validar filas === cantidad.
 *
 * Tres resultados posibles:
 *   - modalDetectado: ATM dijo "no se encontraron"; es un cero de verdad.
 *   - indeterminado:  se agoto el tiempo sin poder leer. NO es cero: el
 *                     llamador tiene que tirar error, no saltear el periodo.
 *   - el numero leido, con refrescado indicando si pudimos confirmar que
 *     corresponde a esta consulta y no a la anterior.
 *
 * @param {import('puppeteer').Frame} frame - Frame del formulario.
 * @param {{habia: boolean, texto: string, huellaGrilla: string}} estadoPrevio
 * @param {number} timeout - Milisegundos maximos de espera.
 * @returns {Promise<Object>} { modalDetectado, modalMensaje, refrescado, indeterminado, cantidad, debug }
 */
async function esperarRespuestaConsulta(frame, estadoPrevio, timeout) {
    const INTERVALO_MS = 250;

    // Si nunca vemos a ZK trabajando (respuesta mas rapida que el muestreo) y el
    // numero tampoco cambia, a partir de este punto aceptamos lo que haya en
    // pantalla. Solo aplica cuando YA hay un numero leido; el caso del bug
    // (label vacio) nunca entra por aca.
    const GRACIA_SIN_ACTIVIDAD_MS = 3000;

    const inicio = Date.now();
    let vioActividad = false;
    let ultimo = {
        modalDetectado: false, modalMensaje: '', refrescado: false,
        indeterminado: true, cantidad: 0, ocupado: false, tieneNumero: false,
        debug: 'sin lecturas'
    };

    while (Date.now() - inicio < timeout) {
        await new Promise(resolve => setTimeout(resolve, INTERVALO_MS));

        const lectura = await frame.evaluate((previo) => {
            const resultado = {
                modalDetectado: false, modalMensaje: '', refrescado: false,
                cantidad: 0, ocupado: false, tieneNumero: false, debug: ''
            };

            const visible = (el) => {
                if (!el) return false;
                const st = window.getComputedStyle(el);
                return st.display !== 'none' && st.visibility !== 'hidden';
            };

            // 1) Modal ZK de "sin registros". Se chequea PRIMERO: es un
            //    resultado, no una espera. Ojo que trae su propia mascara
            //    (.z-modal-mask), que no hay que confundir con "cargando".
            const modal = document.querySelector('.z-window-modal[role="dialog"][aria-modal="true"]');
            if (visible(modal)) {
                const spanMensaje = modal.querySelector('.z-window-content .z-label');
                resultado.modalDetectado = true;
                resultado.modalMensaje = spanMensaje ? spanMensaje.textContent.trim() : 'Modal sin mensaje';

                const btnAceptar = modal.querySelector('.z-window-content .z-button');
                if (btnAceptar) btnAceptar.click();

                return resultado;
            }

            // 2) ¿ZK esta esperando al servidor? zk.processing es la bandera
            //    interna; las otras dos son el cartelito de carga.
            const zkProcesando = (typeof window.zk !== 'undefined') && window.zk.processing === true;
            const hayLoading = Array.from(document.querySelectorAll('.z-loading')).some(visible)
                || visible(document.querySelector('#zk_showBusy'));
            resultado.ocupado = zkProcesando || hayLoading;

            // 3) Cantidad de registros
            const spans = Array.from(document.querySelectorAll('span.z-label'));
            const cantidadLabel = spans.find(span => span.textContent.trim() === 'Cantidad:');

            if (!cantidadLabel) {
                const similares = spans.map(s => s.textContent.trim()).filter(t => t.includes('antidad'));
                resultado.debug = `Label "Cantidad:" NO encontrado. Similares: ${similares.join(', ') || 'ninguno'}`;
                return resultado;
            }

            const hlayout = cantidadLabel.closest('.z-hlayout');
            if (!hlayout) {
                resultado.debug = 'hlayout NO encontrado. ';
                const hermano = cantidadLabel.nextElementSibling;
                if (hermano) {
                    const numero = parseInt(hermano.textContent.trim());
                    resultado.debug += `Hermano: "${hermano.textContent.trim()}". `;
                    if (!isNaN(numero)) {
                        resultado.cantidad = numero;
                        resultado.tieneNumero = true;
                        resultado.refrescado = true;
                    }
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

            resultado.debug = `cantidad:"${texto}" (previo "${previo.texto}") filas:${filas.length} ocupado:${resultado.ocupado}`;

            if (texto === '' || isNaN(numero)) return resultado;

            resultado.cantidad = numero;
            resultado.tieneNumero = true;

            // Es nuevo si no habia consulta previa, si ZK re-renderizo el nodo
            // (perdio la marca), si cambio el numero o si cambio la grilla.
            const marca = hlayout.getAttribute('data-consulta-previa');
            resultado.refrescado = !previo.habia
                || marca === null
                || texto !== previo.texto
                || huellaGrilla !== previo.huellaGrilla;

            return resultado;
        }, estadoPrevio);

        ultimo = lectura;

        if (lectura.modalDetectado) {
            return { ...lectura, indeterminado: false };
        }

        // Mientras ZK trabaja no se decide nada, por mas que el label ya tenga
        // un numero: puede ser el de la consulta anterior.
        if (lectura.ocupado) {
            vioActividad = true;
            continue;
        }

        if (!lectura.tieneNumero) continue;

        // Terminado y con numero. Lo damos por bueno si vimos el ciclo completo
        // de ZK, o si el numero/grilla cambian respecto de la consulta anterior.
        if (vioActividad || lectura.refrescado) {
            return { ...lectura, indeterminado: false };
        }

        // Ni actividad ni cambio: puede ser el mismo periodo consultado dos
        // veces. Le damos un margen antes de aceptar lo que hay en pantalla.
        if (Date.now() - inicio >= GRACIA_SIN_ACTIVIDAD_MS) {
            return { ...lectura, indeterminado: false };
        }
    }

    // Se acabo el tiempo sin una respuesta legible. Esto NO es cero registros:
    // es "no pude leer". Devolvemos indeterminado para que el llamador falle
    // fuerte en vez de saltear el periodo sin que nadie se entere.
    return {
        ...ultimo,
        indeterminado: !ultimo.modalDetectado,
        debug: `${ultimo.debug} | timeout ${timeout}ms, vioActividad:${vioActividad}`
    };
}

// esperarRespuestaConsulta se exporta para poder testear la logica de espera
// sin navegador (ver retenciones_espera.test.js).
module.exports = { descargarRetencionGenerico, esperarRespuestaConsulta };
