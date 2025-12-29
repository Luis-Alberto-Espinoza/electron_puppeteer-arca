const path = require('path');
const fs = require('fs').promises;
const { getDownloadPath, getFilenameRetenciones } = require('../../../utils/fileManager.js');

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
 * @returns {Promise<Object>} Resultado de la descarga
 */
async function descargarRetencionGenerico(config) {
    const { nombre, page, nombreUsuario, cuit, downloadsPath, periodo } = config;

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

        // Función helper para seleccionar un valor en un bandbox
        async function seleccionarEnBandbox(frame, bandboxIndex, valorBuscado, nombreCampo) {
            try {
                const botonesBandbox = await frame.$$('.z-bandbox-button');

                if (bandboxIndex >= botonesBandbox.length) {
                    throw new Error(`No se encontró el bandbox en el índice ${bandboxIndex}`);
                }

                const botonBandbox = botonesBandbox[bandboxIndex];
                await botonBandbox.click();

                // Esperar popup
                await frame.waitForFunction(
                    () => {
                        const popups = document.querySelectorAll('.z-bandpopup');
                        for (const popup of popups) {
                            const style = window.getComputedStyle(popup);
                            if (style.display !== 'none' && style.visibility !== 'hidden' && popup.style.display !== 'none') {
                                const items = popup.querySelectorAll('.z-listitem');
                                if (items.length > 0) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    },
                    { timeout: 5000 }
                );

                await new Promise(resolve => setTimeout(resolve, 300));

                // Buscar y hacer clic en el item
                const resultado = await frame.evaluate((valor) => {
                    const items = Array.from(document.querySelectorAll('.z-listitem[aria-label]'));
                    const itemsDisponibles = items.map(i => i.getAttribute('aria-label'));
                    const item = items.find(i => i.getAttribute('aria-label') === valor);

                    if (item) {
                        item.click();
                        return { encontrado: true, itemsDisponibles };
                    }

                    return { encontrado: false, itemsDisponibles };
                }, valorBuscado);

                if (!resultado.encontrado) {
                    throw new Error(`Valor "${valorBuscado}" no encontrado. Disponibles: ${resultado.itemsDisponibles.join(', ')}`);
                }

                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`[${nombre}] ❌ Error seleccionando ${nombreCampo}: ${error.message}`);
                throw error;
            }
        }

        // Seleccionar año y mes
        await seleccionarEnBandbox(frame, 0, anio, 'año');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await seleccionarEnBandbox(frame, 1, mes, 'mes/cuota');
        console.log(`[${nombre}]    ✓ Periodo configurado: ${anio}-${mes}`);

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

        // Detectar modal "sin registros"
        await new Promise(resolve => setTimeout(resolve, 2500));

        const modalInfo = await frame.evaluate(() => {
            // Buscar modal ZK específico
            const modal = document.querySelector('.z-window-modal[role="dialog"][aria-modal="true"]');

            if (modal) {
                const style = window.getComputedStyle(modal);

                // Verificar que esté visible
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    // Extraer mensaje del modal
                    const spanMensaje = modal.querySelector('.z-window-content .z-label');
                    const mensaje = spanMensaje ? spanMensaje.textContent.trim() : 'Modal sin mensaje';

                    // Hacer clic en el botón Aceptar
                    const btnAceptar = modal.querySelector('.z-window-content .z-button');
                    if (btnAceptar) {
                        btnAceptar.click();
                        console.log('[Modal] Botón Aceptar clickeado');
                    }

                    return { detectado: true, mensaje };
                }
            }

            return { detectado: false, mensaje: '' };
        });

        if (modalInfo.detectado) {
            console.log(`[${nombre}]    ⊘ Sin registros`);
            return {
                success: true,
                tipo: nombre,
                registros: 0,
                archivosDescargados: 0,
                files: [],
                downloadDir: null,
                mensaje: 'Sin registros (modal)',
                alertMensaje: modalInfo.mensaje
            };
        }

        // Verificar cantidad de registros
        await new Promise(resolve => setTimeout(resolve, 1000));

        const cantidad = await frame.evaluate(() => {
            // Buscar el span que dice "Cantidad:"
            const spans = Array.from(document.querySelectorAll('span.z-label'));
            const cantidadLabel = spans.find(span => span.textContent.trim() === 'Cantidad:');

            if (cantidadLabel) {
                // Subir al contenedor .z-hlayout
                const hlayout = cantidadLabel.closest('.z-hlayout');

                if (hlayout) {
                    // Buscar todos los spans dentro del hlayout
                    const allSpans = hlayout.querySelectorAll('span.z-label');

                    // El segundo span contiene el número
                    if (allSpans.length >= 2) {
                        const numeroTexto = allSpans[1].textContent.trim();
                        const numero = parseInt(numeroTexto);
                        console.log(`[Cantidad detectada] ${numeroTexto} → ${numero}`);
                        return isNaN(numero) ? 0 : numero;
                    }
                }
            }

            console.warn('[Cantidad] No se encontró el elemento "Cantidad:"');
            return 0;
        });

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
        const downloadDir = getDownloadPath(downloadsPath, nombreUsuario, 'archivos_atm/RetencionesYPercepciones');
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

        // Click en Excel
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

        // Esperar 3 segundos entre clicks para dar tiempo al navegador
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Click en DIU
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

        // CRÍTICO: Esperar activamente a que aparezcan AMBOS archivos (Excel Y TXT)
        console.log(`[${nombre}]       Esperando descarga de ambos archivos...`);

        const tiempoInicio = Date.now();
        const timeoutMaximo = 20000; // 20 segundos máximo
        let archivosNuevos = [];
        let ultimoReporte = 0;

        while (archivosNuevos.length < 2 && (Date.now() - tiempoInicio < timeoutMaximo)) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Verificar cada 500ms

            const archivosActuales = await fs.readdir(downloadDir);
            archivosNuevos = archivosActuales.filter(
                archivo => !archivosAntesDeDescarga.includes(archivo)
            );

            // Reportar cada 5 segundos
            const tiempoTranscurrido = Date.now() - tiempoInicio;
            if (tiempoTranscurrido - ultimoReporte >= 5000) {
                console.log(`[${nombre}]          [${Math.round(tiempoTranscurrido/1000)}s] ${archivosNuevos.length} archivo(s) detectado(s): ${archivosNuevos.join(', ') || 'ninguno'}`);
                ultimoReporte = tiempoTranscurrido;
            }
        }

        if (archivosNuevos.length < 2) {
            console.warn(`[${nombre}]       ⚠️ Solo ${archivosNuevos.length} archivo(s) después de ${timeoutMaximo/1000}s`);
            console.warn(`[${nombre}]          Archivos detectados: ${archivosNuevos.join(', ') || 'ninguno'}`);
            console.warn(`[${nombre}]          Todos los archivos en dir: ${(await fs.readdir(downloadDir)).join(', ')}`);
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

        // CRÍTICO: Recargar página para estabilizar el DOM después de las descargas
        console.log(`[${nombre}]    🔄 Recargando página...`);
        await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2s para estabilización
        console.log(`[${nombre}]    ✓ Página estabilizada`);

        const archivosDescargados = archivosRenombrados;

        return {
            success: true,
            tipo: nombre,
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

module.exports = { descargarRetencionGenerico };
