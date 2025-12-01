/**
 * Módulo para manejar el flujo completo del formulario de Tasa Cero
 *
 * FLUJO:
 * 1. Clic en botón "Procesar"
 * 2. Se abre nueva ventana
 * 3. Scroll al final de la página
 * 4. Clic en checkbox términos y condiciones
 * 5. Clic en botón "Enviar"
 * 6. Espera 4 segundos (procesamiento)
 * 7. Detectar ACEPTADA vs RECHAZADA
 * 8. Descargar PDF correspondiente
 */

const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Obtiene el nombre del mes actual en español abreviado
 * @returns {string} Nombre del mes (ene, feb, mar, etc.)
 */
function obtenerMesActual() {
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const fecha = new Date();
    return meses[fecha.getMonth()];
}

/**
 * Sanitiza un nombre para usarlo en archivos (elimina caracteres especiales)
 * @param {string} nombre - Nombre a sanitizar
 * @returns {string} Nombre sanitizado
 */
function sanitizarNombre(nombre) {
    return nombre
        .replace(/\s+/g, '') // Eliminar espacios
        .replace(/[^a-zA-Z0-9]/g, '') // Eliminar caracteres especiales
        .substring(0, 30); // Limitar longitud
}

/**
 * Genera el nombre del archivo PDF según el formato requerido
 * @param {string} nombreEmpresa - Nombre de la empresa
 * @param {string} cuit - CUIT de la empresa
 * @param {string} estado - ACEPTADA o RECHAZADA
 * @returns {string} Nombre del archivo sin extensión
 */
function generarNombreArchivo(nombreEmpresa, cuit, estado) {
    const empresaSanitizada = sanitizarNombre(nombreEmpresa);
    const mes = obtenerMesActual();
    const estadoTexto = estado === 'ACEPTADA' ? 'tasaCero_Aceptado' : 'tasaCero_Rechazado';

    return `${empresaSanitizada}_${cuit}_${mes}_${estadoTexto}`;
}

/**
 * Espera a que aparezca un archivo nuevo en la carpeta de descargas y lo renombra
 * @param {string} carpetaDescarga - Ruta de la carpeta de descargas
 * @param {string} nombreDestino - Nombre destino del archivo (sin extensión)
 * @param {Array<string>|number} archivosAnterioresOTimeout - Archivos anteriores o timeout
 * @param {number} timeout - Tiempo máximo de espera en ms
 * @returns {Promise<string>} Ruta del archivo renombrado
 */
async function esperarYRenombrarDescarga(carpetaDescarga, nombreDestino, archivosAnterioresOTimeout = 30000, timeout = 30000) {
    // Manejar parámetros (compatibilidad hacia atrás)
    let archivoAnterior = null;
    let timeoutReal = timeout;

    if (Array.isArray(archivosAnterioresOTimeout)) {
        archivoAnterior = archivosAnterioresOTimeout;
    } else if (typeof archivosAnterioresOTimeout === 'number') {
        timeoutReal = archivosAnterioresOTimeout;
    }

    const inicioEspera = Date.now();

    console.log(`[esperarYRenombrarDescarga] Monitoreando descarga en: ${carpetaDescarga}`);

    if (archivoAnterior === null) {
        try {
            const archivosIniciales = await fs.readdir(carpetaDescarga);
            archivoAnterior = archivosIniciales.filter(f => f.endsWith('.pdf') && !f.endsWith('.crdownload'));
        } catch (error) {
            archivoAnterior = [];
        }
    }

    let iteracion = 0;
    // Esperar a que aparezca un archivo nuevo
    while (Date.now() - inicioEspera < timeoutReal) {
        iteracion++;
        try {
            const archivosActuales = await fs.readdir(carpetaDescarga);

            // Buscar archivos PDF que no sean temporales
            const pdfDescargados = archivosActuales.filter(f =>
                f.endsWith('.pdf') &&
                !f.endsWith('.crdownload') &&
                (!archivoAnterior || !archivoAnterior.includes(f))
            );

            if (pdfDescargados.length > 0) {
                // Encontramos un archivo nuevo
                const archivoDescargado = pdfDescargados[0];
                const rutaOrigen = path.join(carpetaDescarga, archivoDescargado);
                const rutaDestino = path.join(carpetaDescarga, `${nombreDestino}.pdf`);

                console.log(`[esperarYRenombrarDescarga] ✅ Archivo detectado: ${archivoDescargado}`);
                console.log(`[esperarYRenombrarDescarga] Renombrando a: ${nombreDestino}.pdf`);

                // Renombrar el archivo
                await fs.rename(rutaOrigen, rutaDestino);

                return rutaDestino;
            }
        } catch (error) {
            // Ignorar errores temporales
        }

        // Esperar 500ms antes de volver a intentar
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.error(`[esperarYRenombrarDescarga] ❌ TIMEOUT - No se detectó descarga en ${carpetaDescarga}`);
    throw new Error('Timeout esperando descarga del archivo PDF');
}

// ============================================================================
// SELECTORES - Configurables según la implementación real de la página
// ============================================================================
const SELECTORES = {
    // Botón "Procesar" en la página principal de Tasa Cero
    // El botón tiene id="Gx1" y name="Gx1" además de value="Procesar"
    botonProcesar: 'input#Gx1[type="button"][value="Procesar"]',
    xpathBotonProcesar: '//input[@type="button" and @value="Procesar"]',

    // Checkbox de términos y condiciones
    checkboxTerminos: 'input#cuit[type="checkbox"]',
    xpathCheckboxTerminos: '//input[@id="cuit" and @type="checkbox"]',

    // Botón "Enviar"
    botonEnviar: 'input[type="submit"][value="Enviar"]',
    xpathBotonEnviar: '//input[@type="submit" and @value="Enviar"]',

    // Botón de descarga en solicitud ACEPTADA (botón con flecha hacia abajo)
    // Incluye cr-icon-button para el visor de PDF de Chrome
    botonDescargarAceptada: 'cr-icon-button#download, cr-icon-button[title*="Descargar"], button[title*="Descargar"], a[title*="Descargar"], button:has(svg[*|href*="download"])',
    xpathBotonDescargarAceptada: '//cr-icon-button[@id="download"] | //button[contains(@title, "Descargar")] | //a[contains(@title, "Descargar")]',

    // Botón "Imprimir Solicitud Rechazada"
    botonImprimirRechazada: 'input[type="button"][value="Imprimir Solicitud Rechazada"]',
    xpathBotonImprimirRechazada: '//input[@type="button" and @value="Imprimir Solicitud Rechazada"]',

    // Timeouts
    tiempoEsperaSelector: 5000, // Reducido de 10s a 5s
    tiempoEsperaProcesamiento: 4000, // 4 segundos después de enviar
    tiempoEsperaDescarga: 30000,
};

/**
 * Ejecuta el flujo completo de Tasa Cero
 * @param {import('puppeteer').Page} paginaTasaCero - Página inicial de Tasa Cero
 * @param {import('puppeteer').Browser} navegador - Instancia del navegador
 * @param {string} carpetaDescarga - Carpeta donde guardar el PDF
 * @param {string} nombreEmpresa - Nombre de la empresa
 * @param {string} cuit - CUIT de la empresa
 * @returns {Promise<{exito: boolean, rutaArchivo?: string, estado?: string, mensaje?: string}>}
 */
async function ejecutarFlujoTasaCero(paginaTasaCero, navegador, carpetaDescarga, nombreEmpresa, cuit) {
    try {
        const tiempoInicio = Date.now();
        console.log(`⏱️ [${new Date().toISOString()}] [Flujo Tasa Cero] Iniciando proceso...`);

        // ====================================================================
        // PASO 0: Acceder directamente al frame "listado"
        // ====================================================================
        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] [Paso 0] Accediendo al frame "listado"...`);

        // Buscar directamente el frame "listado" (sabemos el nombre)
        const frameListado = paginaTasaCero.frames().find(frame => frame.name() === 'listado');

        if (!frameListado) {
            throw new Error('No se encontró el frame "listado" en la página de Tasa Cero');
        }

        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] ✅ [Paso 0] Frame "listado" encontrado`);

        // A partir de ahora, usamos frameListado
        const paginaConBotones = frameListado;

        // ====================================================================
        // PASO 1: Hacer clic en el botón "Procesar"
        // ====================================================================
        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] [Paso 1] Buscando botón "Procesar" (id=Gx1)...`);

        // Buscar directamente por ID "Gx1" que sabemos que existe
        const botonProcesar = await paginaConBotones.evaluateHandle(() => {
            return document.getElementById('Gx1');
        });

        // Verificar si se encontró
        const tipoElemento = await botonProcesar.evaluate(el => el ? el.tagName : null);
        if (!tipoElemento) {
            throw new Error('No se encontró el botón "Procesar" con id="Gx1"');
        }

        console.log(`⏱️ [+${Date.now() - tiempoInicio}ms] 👆 [Paso 1] Haciendo clic en "Procesar"...`);

        // ====================================================================
        // DETECCIÓN DE DIALOG: "Solicitud ya aprobada"
        // ====================================================================
        // Preparar promesa para capturar dialog nativo (alert)
        const dialogPromise = new Promise(resolve => {
            paginaTasaCero.once('dialog', async dialog => {
                const mensaje = dialog.message();
                console.log('🚨 [Paso 1] Dialog detectado:', mensaje);

                // Aceptar el dialog para desbloquearlo
                await dialog.accept();

                // Verificar si el mensaje es el de "Constancia Aprobada - reimprimir"
                // Texto exacto: "La Constancia se encuentra Aprobada. Si necesita reimprimir..."
                if (mensaje.includes('Constancia se encuentra Aprobada') ||
                    mensaje.includes('Estado Solicitudes')) {
                    console.log('✅ [Paso 1] Detectado: Solicitud ya aprobada, se requiere reimpresión');
                    resolve({
                        yaAprobada: true,
                        mensaje: mensaje
                    });
                } else {
                    console.log('⚠️ [Paso 1] Dialog detectado pero no es de reimpresión');
                    resolve({
                        yaAprobada: false,
                        mensaje: mensaje
                    });
                }
            });
        });

        // Hacer clic en "Procesar"
        await botonProcesar.click();

        console.log('[Paso 1] Esperando respuesta (navegación o dialog)...');

        // Esperar 3 segundos para ver si aparece el dialog
        const resultadoDialog = await Promise.race([
            dialogPromise,
            new Promise(resolve => setTimeout(() => resolve({ yaAprobada: false }), 3000))
        ]);

        // Si apareció el dialog de "ya aprobada", retornar para manejar reimpresión
        if (resultadoDialog.yaAprobada) {
            console.log('⚠️ [Paso 1] Solicitud ya fue aprobada. Se requiere reimpresión.');
            return {
                exito: false,
                necesitaReimpresion: true,
                mensaje: 'Su Solicitud ya fue aprobada y descargada',
                mensajeOriginal: resultadoDialog.mensaje
            };
        }

        console.log('[Paso 1] No se detectó dialog. Esperando navegación del frame...');

        // Esperar a que el frame "listado" navegue a la nueva página
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('✅ [Paso 1] Frame navegó a página de términos');

        // ====================================================================
        // PASO 2: El frame "listado" ahora contiene la página de términos
        // ====================================================================
        console.log('[Paso 2] Accediendo nuevamente al frame "listado" (ahora con términos)...');

        // Esperar un momento para que el contenido del frame se actualice
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Volver a obtener el frame "listado" (ahora tiene el contenido de términos)
        const framesActualizados = paginaTasaCero.frames();
        let frameContenido = null;

        for (const frame of framesActualizados) {
            if (frame.name() === 'listado') {
                frameContenido = frame;
                console.log('✅ [Paso 2] Frame "listado" encontrado (con contenido de términos)');
                break;
            }
        }

        if (!frameContenido) {
            throw new Error('No se pudo acceder al frame "listado" después de hacer clic en Procesar');
        }

        console.log('[Paso 2] Haciendo scroll al final de la página...');
        await frameContenido.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        await new Promise(resolve => setTimeout(resolve, 500)); // Pequeña pausa después del scroll

        // ====================================================================
        // PASO 3: Hacer clic en checkbox de términos y condiciones
        // ====================================================================
        console.log('[Paso 3] Buscando checkbox de términos y condiciones...');

        let checkboxTerminos = null;

        // Intentar con selector CSS
        if (SELECTORES.checkboxTerminos) {
            try {
                await frameContenido.waitForSelector(SELECTORES.checkboxTerminos, {
                    visible: true,
                    timeout: SELECTORES.tiempoEsperaSelector
                });
                checkboxTerminos = await frameContenido.$(SELECTORES.checkboxTerminos);
            } catch (error) {
                console.warn('[Paso 3] No se encontró checkbox con CSS, intentando búsqueda alternativa...');
            }
        }

        // Si no se encontró, intentar buscando por id y type
        if (!checkboxTerminos) {
            console.warn('[Paso 3] Intentando buscar checkbox por evaluateHandle...');
            checkboxTerminos = await frameContenido.evaluateHandle(() => {
                const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                for (const cb of checkboxes) {
                    if (cb.id === 'cuit') {
                        return cb;
                    }
                }
                return null;
            });

            const tipoElemento = await checkboxTerminos.evaluate(el => el ? el.tagName : null);
            if (!tipoElemento) {
                throw new Error('No se encontró el checkbox de términos y condiciones');
            }
        }

        console.log('✅ [Paso 3] Haciendo clic en checkbox de términos...');
        await checkboxTerminos.click();

        // ====================================================================
        // PASO 4: Hacer clic en botón "Enviar"
        // ====================================================================
        console.log('[Paso 4] Buscando botón "Enviar"...');

        let botonEnviar = null;

        // Intentar con selector CSS
        if (SELECTORES.botonEnviar) {
            try {
                await frameContenido.waitForSelector(SELECTORES.botonEnviar, {
                    visible: true,
                    timeout: SELECTORES.tiempoEsperaSelector
                });
                botonEnviar = await frameContenido.$(SELECTORES.botonEnviar);
            } catch (error) {
                console.warn('[Paso 4] No se encontró botón con CSS, intentando búsqueda alternativa...');
            }
        }

        // Si no se encontró, intentar buscando por type y value
        if (!botonEnviar) {
            console.warn('[Paso 4] Intentando buscar botón Enviar por evaluateHandle...');
            botonEnviar = await frameContenido.evaluateHandle(() => {
                const inputs = document.querySelectorAll('input[type="submit"]');
                for (const input of inputs) {
                    if (input.value === 'Enviar') {
                        return input;
                    }
                }
                return null;
            });

            const tipoElemento = await botonEnviar.evaluate(el => el ? el.tagName : null);
            if (!tipoElemento) {
                throw new Error('No se encontró el botón "Enviar"');
            }
        }

        console.log('👆 [Paso 4] Haciendo clic en "Enviar"...');
        await botonEnviar.click();

        // ====================================================================
        // PASO 5: Esperar 4 segundos (procesamiento del sistema)
        // ====================================================================
        console.log('⏳ [Paso 5] Esperando 4 segundos para que el sistema procese...');
        await new Promise(resolve => setTimeout(resolve, SELECTORES.tiempoEsperaProcesamiento));

        // ====================================================================
        // PASO 6: Detectar si fue ACEPTADA o RECHAZADA
        // ====================================================================
        console.log('[Paso 6] Detectando si la solicitud fue ACEPTADA o RECHAZADA...');

        const resultado = await detectarEstadoSolicitud(frameContenido, paginaTasaCero, navegador, carpetaDescarga, nombreEmpresa, cuit);

        return resultado;

    } catch (error) {
        console.error('❌ [Flujo Tasa Cero] Error durante el proceso:', error.message);
        return {
            exito: false,
            mensaje: `Error en flujo Tasa Cero: ${error.message}`
        };
    }
}

/**
 * Detecta si la solicitud fue ACEPTADA o RECHAZADA y procede con la descarga
 * @param {import('puppeteer').Frame} frameContenido - Frame con el contenido de términos
 * @param {import('puppeteer').Page} paginaPrincipal - Página principal de Tasa Cero
 * @param {import('puppeteer').Browser} navegador - Instancia del navegador
 * @param {string} carpetaDescarga - Carpeta donde guardar
 * @param {string} nombreEmpresa - Nombre de la empresa
 * @param {string} cuit - CUIT de la empresa
 * @returns {Promise<{exito: boolean, rutaArchivo?: string, estado?: string, mensaje?: string}>}
 */
async function detectarEstadoSolicitud(frameContenido, paginaPrincipal, navegador, carpetaDescarga, nombreEmpresa, cuit) {
    try {
        // Verificar todas las páginas abiertas
        const todasLasPaginas = await navegador.pages();
        console.log(`[Detección] Total de páginas abiertas: ${todasLasPaginas.length}`);

        // DEBUG: Ver todos los botones disponibles para detectar el estado
        const debugBotones = await frameContenido.evaluate(() => {
            const inputs = document.querySelectorAll('input[type="button"], input[type="submit"]');
            return Array.from(inputs).map(btn => ({
                type: btn.type,
                value: btn.value,
                id: btn.id,
                name: btn.name
            }));
        });
        console.log('🔍 [DEBUG Detección] Botones encontrados en la página de resultado:', JSON.stringify(debugBotones, null, 2));

        // Buscar botón de "Imprimir Solicitud Rechazada" en el frame de contenido
        const botonRechazada = await frameContenido.evaluateHandle(() => {
            const inputs = document.querySelectorAll('input[type="button"]');
            for (const input of inputs) {
                console.log('[DEBUG] Evaluando botón:', input.value);
                if (input.value === 'Imprimir Solicitud Rechazada') {
                    console.log('[DEBUG] ¡Botón de RECHAZO encontrado!');
                    return input;
                }
            }
            console.log('[DEBUG] No se encontró botón de rechazo');
            return null;
        });

        const tieneBotonRechazada = await botonRechazada.evaluate(el => el ? true : false);
        console.log(`🔍 [DEBUG Detección] ¿Tiene botón de rechazo?: ${tieneBotonRechazada}`);

        if (tieneBotonRechazada) {
            // ================================================================
            // CASO: SOLICITUD RECHAZADA
            // ================================================================
            console.log('❌ [Detección] Solicitud RECHAZADA detectada');

            // Capturar archivos ANTES del clic (la descarga es instantánea)
            const archivosAntesDelClick = await fs.readdir(carpetaDescarga)
                .then(files => files.filter(f => f.endsWith('.pdf') && !f.endsWith('.crdownload')))
                .catch(() => []);

            // Si ya hay archivos, eliminarlos para poder detectar el nuevo
            if (archivosAntesDelClick.length > 0) {
                console.log('[Rechazada] Limpiando archivos existentes...');
                for (const archivo of archivosAntesDelClick) {
                    await fs.unlink(path.join(carpetaDescarga, archivo));
                }
                archivosAntesDelClick.length = 0;
            }

            console.log('[Rechazada] Haciendo clic en "Imprimir Solicitud Rechazada"...');
            await botonRechazada.click();

            // Generar nombre del archivo con formato: EmpresaPoderosa_30275468365_nov_tasaCeroRechazada
            const nombreArchivoFinal = generarNombreArchivo(nombreEmpresa, cuit, 'RECHAZADA');
            const rutaArchivo = await esperarYRenombrarDescarga(carpetaDescarga, nombreArchivoFinal, archivosAntesDelClick, 30000);

            console.log(`✅ [Rechazada] PDF descargado y renombrado: ${path.basename(rutaArchivo)}`);

            return {
                exito: true,
                estado: 'RECHAZADA',
                rutaArchivo: rutaArchivo,
                mensaje: 'Solicitud rechazada. PDF descargado.'
            };

        } else {
            // ================================================================
            // CASO: SOLICITUD ACEPTADA
            // ================================================================
            console.log('✅ [Detección] Solicitud ACEPTADA detectada');

            // Buscar la nueva ventana con el PDF
            console.log('[Aceptada] Buscando ventana con PDF...');
            const paginaPDF = todasLasPaginas[todasLasPaginas.length - 1];

            // Configurar descarga en la nueva ventana del PDF
            try {
                const clientPDF = await paginaPDF.target().createCDPSession();
                await clientPDF.send('Page.setDownloadBehavior', {
                    behavior: 'allow',
                    downloadPath: carpetaDescarga
                });
                console.log('[Aceptada] Descarga configurada en:', carpetaDescarga);
            } catch (error) {
                console.error('[Aceptada] Error al configurar descarga:', error.message);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));

            // ====================================================================
            // DEBUG: Inspeccionar la página del PDF
            // ====================================================================
            console.log('🔍 [Aceptada DEBUG] Inspeccionando página del PDF...');

            const urlPaginaPDF = paginaPDF.url();
            console.log(`🔍 [Aceptada DEBUG] URL de la página: ${urlPaginaPDF}`);

            const debugInfo = await paginaPDF.evaluate(() => {
                return {
                    url: window.location.href,
                    title: document.title,
                    bodyText: document.body ? document.body.innerText.substring(0, 200) : 'NO BODY',
                    crIconButtons: Array.from(document.querySelectorAll('cr-icon-button')).map(btn => ({
                        id: btn.id,
                        title: btn.title,
                        ariaLabel: btn.getAttribute('aria-label'),
                        innerHTML: btn.innerHTML.substring(0, 100)
                    })),
                    allButtons: Array.from(document.querySelectorAll('button')).map(btn => ({
                        id: btn.id,
                        title: btn.title,
                        textContent: btn.textContent.trim().substring(0, 50),
                        className: btn.className
                    })),
                    allInputs: Array.from(document.querySelectorAll('input')).map(inp => ({
                        type: inp.type,
                        id: inp.id,
                        value: inp.value
                    })),
                    embedObjects: Array.from(document.querySelectorAll('embed, object, iframe')).map(el => ({
                        tag: el.tagName,
                        type: el.type,
                        src: el.src
                    })),
                    bodyHTML: document.body ? document.body.innerHTML.substring(0, 500) : 'NO BODY'
                };
            });

            console.log('🔍 [Aceptada DEBUG] Información de la página:');
            console.log(JSON.stringify(debugInfo, null, 2));
            console.log('🔍 [Aceptada DEBUG] ========================================');

            // Buscar el botón de descarga directamente en la página del PDF
            console.log('[Aceptada] Buscando botón de descarga...');

            let botonDescargar = null;

            // Intentar buscar el botón directamente en paginaPDF
            botonDescargar = await paginaPDF.evaluateHandle(() => {
                // Primero intentar con cr-icon-button específico
                const crIconButton = document.querySelector('cr-icon-button#download');
                if (crIconButton) {
                    return crIconButton;
                }

                // Buscar cualquier cr-icon-button con title "Descargar"
                const crButtons = document.querySelectorAll('cr-icon-button');
                for (const btn of crButtons) {
                    if (btn.title && btn.title.includes('Descargar')) {
                        return btn;
                    }
                    // También buscar por aria-label
                    const ariaLabel = btn.getAttribute('aria-label');
                    if (ariaLabel && ariaLabel.includes('Descargar')) {
                        return btn;
                    }
                }

                // Buscar botones normales con title "Descargar"
                const botones = document.querySelectorAll('button, a');
                for (const boton of botones) {
                    if (boton.title && boton.title.includes('Descargar')) {
                        return boton;
                    }
                }

                return null;
            });

            const tipoElemento = await botonDescargar.evaluate(el => el ? el.tagName : null);
            if (!tipoElemento) {
                botonDescargar = null; // No se encontró
                console.warn('[Aceptada] ⚠️ No se encontró el botón de descarga en la página');
            } else {
                console.log(`[Aceptada] ✅ Botón encontrado: ${tipoElemento}`);
            }

            if (botonDescargar) {
                // Capturar archivos ANTES del clic (la descarga puede ser instantánea)
                const archivosAntesDelClickAceptada = await fs.readdir(carpetaDescarga)
                    .then(files => files.filter(f => f.endsWith('.pdf') && !f.endsWith('.crdownload')))
                    .catch(() => []);

                console.log('[Aceptada] Haciendo clic en botón de descarga...');
                await botonDescargar.click();

                // Generar nombre del archivo con formato: EmpresaPoderosa_30275468365_nov_tasaCeroAceptada
                const nombreArchivoFinal = generarNombreArchivo(nombreEmpresa, cuit, 'ACEPTADA');

                try {
                    const rutaArchivo = await esperarYRenombrarDescarga(carpetaDescarga, nombreArchivoFinal, archivosAntesDelClickAceptada, 30000);

                    console.log(`✅ [Aceptada] PDF descargado y renombrado: ${path.basename(rutaArchivo)}`);

                    return {
                        exito: true,
                        estado: 'ACEPTADA',
                        rutaArchivo: rutaArchivo,
                        mensaje: 'Solicitud aceptada. PDF descargado.'
                    };
                } catch (error) {
                    // Si falla, intentar buscar en la carpeta de descargas predeterminada
                    console.error('[Aceptada] ❌ No se encontró el archivo en carpetaDescarga:', error.message);
                    console.log('[Aceptada] 🔍 Buscando en carpeta de descargas predeterminada del sistema...');

                    const carpetaDescargasPredeterminada = path.join(os.homedir(), 'Downloads');
                    console.log(`[Aceptada] Carpeta predeterminada: ${carpetaDescargasPredeterminada}`);

                    try {
                        const rutaArchivoPredeterminada = await esperarYRenombrarDescarga(carpetaDescargasPredeterminada, nombreArchivoFinal, 10000); // Sin archivos anteriores

                        // Mover el archivo a la carpeta correcta
                        const rutaDestino = path.join(carpetaDescarga, `${nombreArchivoFinal}.pdf`);
                        await fs.rename(rutaArchivoPredeterminada, rutaDestino);

                        console.log(`✅ [Aceptada] PDF encontrado en carpeta predeterminada y movido a: ${path.basename(rutaDestino)}`);

                        return {
                            exito: true,
                            estado: 'ACEPTADA',
                            rutaArchivo: rutaDestino,
                            mensaje: 'Solicitud aceptada. PDF descargado desde carpeta predeterminada.'
                        };
                    } catch (errorPredeterminada) {
                        console.error('[Aceptada] ❌ Tampoco se encontró en carpeta predeterminada:', errorPredeterminada.message);
                        throw error; // Re-lanzar el error original
                    }
                }
            } else {
                console.warn('⚠️ [Aceptada] No se encontró botón de descarga. El PDF puede estar visible en la página.');

                // Intentar descargar de todos modos (puede haberse descargado automáticamente)
                console.log('[Aceptada] Intentando detectar descarga automática...');

                try {
                    const nombreArchivoFinal = generarNombreArchivo(nombreEmpresa, cuit, 'ACEPTADA');
                    const rutaArchivo = await esperarYRenombrarDescarga(carpetaDescarga, nombreArchivoFinal, 15000); // Sin archivos anteriores (descarga automática)

                    console.log(`✅ [Aceptada] PDF descargado automáticamente y renombrado: ${path.basename(rutaArchivo)}`);

                    return {
                        exito: true,
                        estado: 'ACEPTADA',
                        rutaArchivo: rutaArchivo,
                        mensaje: 'Solicitud aceptada. PDF descargado automáticamente.'
                    };
                } catch (error) {
                    console.error('[Aceptada] No se detectó descarga automática:', error.message);
                    return {
                        exito: false,
                        estado: 'ACEPTADA',
                        mensaje: 'Solicitud aceptada pero no se pudo descargar el PDF.'
                    };
                }
            }
        }

    } catch (error) {
        console.error('❌ [Detección] Error al detectar estado:', error.message);
        return {
            exito: false,
            mensaje: `Error al detectar estado: ${error.message}`
        };
    }
}

/**
 * Ejecuta el flujo de reimpresión para solicitudes ya aprobadas
 * @param {import('puppeteer').Page} paginaTasaCero - Página principal de Tasa Cero
 * @param {import('puppeteer').Browser} navegador - Instancia del navegador
 * @param {string} carpetaDescarga - Carpeta donde guardar el PDF
 * @param {string} nombreEmpresa - Nombre de la empresa
 * @param {string} cuit - CUIT de la empresa
 * @returns {Promise<{exito: boolean, rutaArchivo?: string, estado?: string, mensaje?: string}>}
 */
async function ejecutarFlujoReimpresion(paginaTasaCero, navegador, carpetaDescarga, nombreEmpresa, cuit) {
    try {
        console.log('🔄 [Reimpresión] Iniciando flujo de reimpresión...');

        // ====================================================================
        // PASO 1: Hacer clic en "ESTADO SOLICITUDES"
        // ====================================================================
        console.log('[Reimpresión] Buscando elemento "ESTADO SOLICITUDES"...');

        // DEBUG: Ver qué frames y páginas hay disponibles
        const frames = paginaTasaCero.frames();
        console.log(`[Reimpresión DEBUG] Total frames disponibles: ${frames.length}`);
        for (let i = 0; i < frames.length; i++) {
            console.log(`[Reimpresión DEBUG] Frame ${i}: name="${frames[i].name()}", url="${frames[i].url()}"`);
        }

        // Intentar buscar en la página principal primero
        console.log('[Reimpresión] Buscando en página principal...');
        let tdEstadoSolicitudes = await paginaTasaCero.evaluateHandle(() => {
            const tds = document.querySelectorAll('td');
            console.log(`[DEBUG] Total TDs encontrados en página principal: ${tds.length}`);

            for (const td of tds) {
                const onclick = td.getAttribute('onclick');
                const textContent = td.textContent.trim();

                // Buscar por onclick
                if (onclick && onclick.includes('solicitud_consultar.jsp')) {
                    console.log(`[DEBUG] Encontrado por onclick: "${textContent}"`);
                    return td;
                }

                // Buscar por texto "ESTADO SOLICITUDES"
                if (textContent.includes('ESTADO SOLICITUDES')) {
                    console.log(`[DEBUG] Encontrado por texto: "${textContent}", onclick="${onclick}"`);
                    return td;
                }
            }
            return null;
        });

        let tipoElemento = await tdEstadoSolicitudes.evaluate(el => el ? el.tagName : null);

        // Si no se encontró en página principal, buscar en frames
        if (!tipoElemento) {
            console.log('[Reimpresión] No encontrado en página principal. Buscando en frames...');

            for (const frame of frames) {
                console.log(`[Reimpresión] Buscando en frame: ${frame.name()}`);

                tdEstadoSolicitudes = await frame.evaluateHandle(() => {
                    const tds = document.querySelectorAll('td');
                    console.log(`[DEBUG] Total TDs en este frame: ${tds.length}`);

                    for (const td of tds) {
                        const onclick = td.getAttribute('onclick');
                        const textContent = td.textContent.trim();

                        if (onclick && onclick.includes('solicitud_consultar.jsp')) {
                            console.log(`[DEBUG] Encontrado por onclick: "${textContent}"`);
                            return td;
                        }

                        if (textContent.includes('ESTADO SOLICITUDES')) {
                            console.log(`[DEBUG] Encontrado por texto: "${textContent}"`);
                            return td;
                        }
                    }
                    return null;
                });

                tipoElemento = await tdEstadoSolicitudes.evaluate(el => el ? el.tagName : null);
                if (tipoElemento) {
                    console.log(`✅ [Reimpresión] Elemento encontrado en frame: ${frame.name()}`);
                    break;
                }
            }
        }

        if (!tipoElemento) {
            throw new Error('No se encontró el elemento "ESTADO SOLICITUDES" en ningún frame');
        }

        console.log('[Reimpresión] ✅ Elemento encontrado. Haciendo clic...');
        await tdEstadoSolicitudes.click();

        // Esperar a que se cargue el JSP
        await new Promise(resolve => setTimeout(resolve, 2000));

        // ====================================================================
        // PASO 2: Acceder al frame "listado" actualizado
        // ====================================================================
        console.log('[Reimpresión] Accediendo al frame "listado"...');

        const frameListado = paginaTasaCero.frames().find(frame => frame.name() === 'listado');
        if (!frameListado) {
            throw new Error('No se encontró el frame "listado" después de navegar a Estado Solicitudes');
        }

        // Esperar a que se cargue el contenido del frame
        await new Promise(resolve => setTimeout(resolve, 1500));

        // ====================================================================
        // PASO 3: Hacer clic en la primera celda (id="Gx1")
        // ====================================================================
        console.log('[Reimpresión] Buscando primera celda de la tabla (id=Gx1)...');

        const primeraCelda = await frameListado.evaluateHandle(() => {
            return document.getElementById('Gx1');
        });

        const tienePrimeraCelda = await primeraCelda.evaluate(el => el ? true : false);
        if (!tienePrimeraCelda) {
            throw new Error('No se encontró la primera celda (id=Gx1) en la tabla');
        }

        console.log('[Reimpresión] ✅ Primera celda encontrada. Ejecutando onclick...');

        // Capturar la cantidad de páginas antes del clic
        const paginasAntes = await navegador.pages();
        console.log(`[Reimpresión] Páginas abiertas antes del clic: ${paginasAntes.length}`);

        // Ejecutar el onclick (abre nueva ventana con PDF)
        await primeraCelda.evaluate(el => el.onclick());

        // Esperar a que se abra la nueva ventana
        await new Promise(resolve => setTimeout(resolve, 3000));

        // ====================================================================
        // PASO 4: Obtener la nueva ventana con el PDF
        // ====================================================================
        const paginasDespues = await navegador.pages();
        console.log(`[Reimpresión] Páginas abiertas después del clic: ${paginasDespues.length}`);

        if (paginasDespues.length <= paginasAntes.length) {
            throw new Error('No se abrió una nueva ventana con el PDF');
        }

        // La última página abierta es el PDF
        const paginaPDF = paginasDespues[paginasDespues.length - 1];
        const urlPDF = paginaPDF.url();
        console.log(`[Reimpresión] Nueva ventana detectada. URL: ${urlPDF}`);

        // ====================================================================
        // PASO 5: Descargar PDF directamente desde la URL
        // ====================================================================
        // Si la URL contiene "/tasacero/pdf", es una URL directa al PDF
        // Podemos descargarla usando fetch dentro del navegador
        if (urlPDF.includes('/tasacero/pdf')) {
            console.log('[Reimpresión] URL detectada como PDF directo. Descargando vía fetch...');

            // Descargar el PDF usando fetch dentro del contexto del navegador
            const pdfBuffer = await paginaPDF.evaluate(async (url) => {
                const response = await fetch(url);
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                // Convertir ArrayBuffer a Array para poder pasarlo desde el navegador
                return Array.from(new Uint8Array(arrayBuffer));
            }, urlPDF);

            console.log(`[Reimpresión] PDF descargado desde URL. Tamaño: ${pdfBuffer.length} bytes`);

            // Convertir el array de vuelta a Buffer
            const buffer = Buffer.from(pdfBuffer);

            // Generar nombre del archivo
            const nombreArchivoFinal = generarNombreArchivo(nombreEmpresa, cuit, 'ACEPTADA');
            const rutaArchivo = path.join(carpetaDescarga, `${nombreArchivoFinal}.pdf`);

            // Escribir el PDF a disco
            await fs.writeFile(rutaArchivo, buffer);

            console.log(`✅ [Reimpresión] PDF descargado y guardado: ${path.basename(rutaArchivo)}`);

            return {
                exito: true,
                estado: 'ACEPTADA',
                rutaArchivo: rutaArchivo,
                mensaje: 'Solicitud reimpresa exitosamente. PDF descargado.'
            };
        }

        // ====================================================================
        // PASO 5 (alternativo): Configurar descarga manual
        // ====================================================================
        console.log('[Reimpresión] Configurando descarga...');
        const clientPDF = await paginaPDF.target().createCDPSession();
        await clientPDF.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: carpetaDescarga
        });

        await new Promise(resolve => setTimeout(resolve, 1500));

        // ====================================================================
        // DEBUG: Inspeccionar la página del PDF
        // ====================================================================
        console.log('🔍 [Reimpresión DEBUG] Inspeccionando página del PDF...');

        const debugInfoPDF = await paginaPDF.evaluate(() => {
            return {
                url: window.location.href,
                title: document.title,
                bodyHTML: document.body ? document.body.innerHTML : 'NO BODY',
                embedObjects: Array.from(document.querySelectorAll('embed, object, iframe')).map(el => ({
                    tag: el.tagName,
                    type: el.type,
                    src: el.src,
                    data: el.getAttribute('data')
                })),
                allButtons: Array.from(document.querySelectorAll('button, input[type="button"], a')).map(btn => ({
                    tag: btn.tagName,
                    type: btn.type,
                    id: btn.id,
                    textContent: btn.textContent?.trim().substring(0, 50),
                    value: btn.value,
                    onclick: btn.getAttribute('onclick')
                })),
                crIconButtons: Array.from(document.querySelectorAll('cr-icon-button')).length
            };
        });

        console.log('🔍 [Reimpresión DEBUG] Contenido de la página:');
        console.log(JSON.stringify(debugInfoPDF, null, 2));

        // ====================================================================
        // PASO 6: Descargar el PDF (buscar botón o usar Ctrl+S)
        // ====================================================================
        console.log('[Reimpresión] Buscando botón de descarga...');

        let botonDescargar = await paginaPDF.evaluateHandle(() => {
            // Buscar cr-icon-button#download
            const crIconButton = document.querySelector('cr-icon-button#download');
            if (crIconButton) return crIconButton;

            // Buscar cualquier cr-icon-button con "Descargar"
            const crButtons = document.querySelectorAll('cr-icon-button');
            for (const btn of crButtons) {
                if (btn.title?.includes('Descargar') || btn.getAttribute('aria-label')?.includes('Descargar')) {
                    return btn;
                }
            }

            // Buscar botones normales
            const botones = document.querySelectorAll('button, a');
            for (const boton of botones) {
                if (boton.title?.includes('Descargar')) {
                    return boton;
                }
            }

            return null;
        });

        const tieneBoton = await botonDescargar.evaluate(el => el ? true : false);

        if (tieneBoton) {
            console.log('[Reimpresión] ✅ Botón de descarga encontrado. Haciendo clic...');

            // Capturar archivos antes del clic
            const archivosAntes = await fs.readdir(carpetaDescarga)
                .then(files => files.filter(f => f.endsWith('.pdf') && !f.endsWith('.crdownload')))
                .catch(() => []);

            await botonDescargar.click();

            // Generar nombre del archivo
            const nombreArchivoFinal = generarNombreArchivo(nombreEmpresa, cuit, 'ACEPTADA');

            try {
                const rutaArchivo = await esperarYRenombrarDescarga(carpetaDescarga, nombreArchivoFinal, archivosAntes, 30000);

                console.log(`✅ [Reimpresión] PDF descargado y renombrado: ${path.basename(rutaArchivo)}`);

                return {
                    exito: true,
                    estado: 'ACEPTADA',
                    rutaArchivo: rutaArchivo,
                    mensaje: 'Solicitud reimpresa exitosamente. PDF descargado.'
                };
            } catch (error) {
                console.error('[Reimpresión] Error al esperar descarga:', error.message);
                throw error;
            }
        } else {
            console.log('[Reimpresión] ⚠️ No se encontró botón. Intentando Ctrl+S...');

            // Capturar archivos antes de Ctrl+S
            const archivosAntes = await fs.readdir(carpetaDescarga)
                .then(files => files.filter(f => f.endsWith('.pdf') && !f.endsWith('.crdownload')))
                .catch(() => []);

            // Simular Ctrl+S
            await paginaPDF.keyboard.down('Control');
            await paginaPDF.keyboard.press('KeyS');
            await paginaPDF.keyboard.up('Control');

            console.log('[Reimpresión] Ctrl+S ejecutado. Esperando 2 segundos antes de monitorear...');

            // Esperar 2 segundos para que se inicie la descarga
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Generar nombre del archivo
            const nombreArchivoFinal = generarNombreArchivo(nombreEmpresa, cuit, 'ACEPTADA');

            try {
                const rutaArchivo = await esperarYRenombrarDescarga(carpetaDescarga, nombreArchivoFinal, archivosAntes, 30000);

                console.log(`✅ [Reimpresión] PDF descargado y renombrado: ${path.basename(rutaArchivo)}`);

                return {
                    exito: true,
                    estado: 'ACEPTADA',
                    rutaArchivo: rutaArchivo,
                    mensaje: 'Solicitud reimpresa exitosamente. PDF descargado.'
                };
            } catch (error) {
                console.error('[Reimpresión] Error al esperar descarga con Ctrl+S:', error.message);
                throw error;
            }
        }

    } catch (error) {
        console.error('❌ [Reimpresión] Error durante el flujo de reimpresión:', error.message);
        return {
            exito: false,
            mensaje: `Error en flujo de reimpresión: ${error.message}`
        };
    }
}

module.exports = {
    ejecutarFlujoTasaCero,
    ejecutarFlujoReimpresion,
    SELECTORES
};
