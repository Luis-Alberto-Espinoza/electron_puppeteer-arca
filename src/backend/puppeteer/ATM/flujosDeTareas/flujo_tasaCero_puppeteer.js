/**
 * Orquestador principal del flujo de Tasa Cero con Puppeteer
 * Este módulo coordina todo el proceso de descarga de comprobantes Tasa Cero:
 * 1. Login en ATM
 * 2. Navegación al servicio
 * 3. Detección de CASO A o CASO B
 * 4. Descarga del PDF
 */

const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { launchBrowser } = require('../../browserLauncher.js');
const { loginATM } = require('../codigoXpagina/login_atm.js');
const { navegarATasaCero } = require('../codigoXpagina/aplicativos-tasaCero.js');
const {
    ejecutarFlujoTasaCero
} = require('../codigoXpagina/tasaCero-formulario.js');
const { getDownloadPath } = require('../../../utils/fileManager.js');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// --- Función para leer PDF de Tasa Cero de forma genérica ---
/**
 * Lee un PDF de Tasa Cero y extrae todos los items de texto agrupados por línea (coordenada Y)
 * @param {string} pdfPath - Ruta al archivo PDF
 * @returns {Promise<Object>} Objeto con allFilas (array de filas con items)
 */
async function leerPdfTasaCero(pdfPath) {
    console.log(`[leerPdfTasaCero] Leyendo PDF: ${pdfPath}`);

    try {
        // Cargar el PDF sin worker
        const loadingTask = pdfjsLib.getDocument({ url: pdfPath, disableWorker: true });
        const pdf = await loadingTask.promise;
        console.log(`[leerPdfTasaCero] PDF cargado. Total de páginas: ${pdf.numPages}`);

        const todasLasFilas = [];

        // Procesar todas las páginas
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const items = content.items;

            console.log(`[leerPdfTasaCero] Página ${pageNum}: ${items.length} items de texto`);

            // Agrupar items por línea (coordenada Y)
            const toleranciaY = 5;
            const filasMap = new Map();

            items.forEach(item => {
                const y = item.transform[5]; // Coordenada Y

                // Buscar si ya existe una fila con coordenada Y similar
                let yExistente = [...filasMap.keys()].find(key => Math.abs(y - key) <= toleranciaY);

                if (yExistente) {
                    filasMap.get(yExistente).push(item);
                } else {
                    filasMap.set(y, [item]);
                }
            });

            // Ordenar filas por coordenada Y (de arriba hacia abajo)
            const filasOrdenadas = [...filasMap.entries()]
                .sort((a, b) => b[0] - a[0])
                .map(([y, items]) => ({
                    y,
                    items: items.sort((a, b) => a.transform[4] - b.transform[4]) // Ordenar por X dentro de cada fila
                }));

            // Agregar las filas de esta página al array total
            todasLasFilas.push(...filasOrdenadas);
        }

        console.log(`[leerPdfTasaCero] Total de filas extraídas: ${todasLasFilas.length}`);

        return {
            exito: true,
            allFilas: todasLasFilas
        };

    } catch (error) {
        console.error(`[leerPdfTasaCero] Error al leer PDF:`, error);
        return {
            exito: false,
            error: error.message,
            allFilas: []
        };
    }
}

// --- Helper para detectar el estado de la solicitud en el PDF ---
/**
 * Busca en el PDF si la solicitud fue RECHAZADA o ACEPTADA
 * @param {Object} datosPdf - Datos extraídos del PDF por procesarPdfConFallback
 * @returns {string} 'RECHAZADA' si encuentra el string específico, 'ACEPTADA' si no
 */
function encontrarEstadoSolicitud(datosPdf) {
    // Verificar que tengamos los datos crudos del PDF
    if (!datosPdf || !datosPdf.allFilas || !Array.isArray(datosPdf.allFilas)) {
        console.warn('[encontrarEstadoSolicitud] Datos PDF inválidos, asumiendo ACEPTADA');
        return 'ACEPTADA';
    }

    const stringRechazada = "SOLICITUD DE TASA CERO RECHAZADA";

    // Buscar dentro de los items crudos devueltos por el orquestador
    for (const fila of datosPdf.allFilas) {
        if (!fila.items || !Array.isArray(fila.items)) continue;

        for (const item of fila.items) {
            // Comparación exacta
            if (item.str === stringRechazada) {
                console.log('[encontrarEstadoSolicitud] String "SOLICITUD DE TASA CERO RECHAZADA" encontrado');
                return 'RECHAZADA';
            }
        }
    }

    return 'ACEPTADA';
}

/**
 * Obtiene el nombre del mes actual en español abreviado (para nombre de archivo)
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
 * Ejecuta el flujo completo de descarga de comprobante Tasa Cero para un cliente
 * El periodo se selecciona automáticamente (último disponible en el formulario)
 *
 * @param {Object} opciones - Opciones de configuración
 * @param {Object} opciones.credenciales - Credenciales del cliente {cuit, clave}
 * @param {string} opciones.nombreCliente - Nombre del cliente (para logs)
 * @param {string} opciones.clienteId - ID del cliente (para nombre de archivo)
 * @param {string} opciones.downloadsPath - Ruta base de descargas (app.getPath('downloads'))
 * @param {string} opciones.nombreUsuario - Nombre del usuario (para construir ruta)
 * @param {Function} opciones.enviarProgreso - Callback para reportar progreso
 * @param {Object} opciones.constants - Constantes de configuración (opcional)
 *
 * @returns {Promise<Object>} - Resultado del flujo {exito, rutaArchivo?, periodo?, caso?, mensaje?}
 */
async function ejecutarFlujoPuppeteerTasaCero(opciones) {
    const {
        credenciales,
        nombreCliente,
        clienteId,
        downloadsPath,
        nombreUsuario,
        enviarProgreso
    } = opciones;

    let navegador;
    let paginaLogin;
    let paginaTasaCero;
    let tempDir = null;

    try {
        // ========================================================================
        // PASO 0: Construir ruta de destino final
        // ========================================================================
        const carpetaDestino = getDownloadPath(downloadsPath, nombreUsuario, 'archivos_atm');
        console.log(`[Flujo Tasa Cero] Carpeta de destino: ${carpetaDestino}`);

        // ========================================================================
        // PASO 1: Iniciar navegador
        // ========================================================================
        enviarProgreso('info', 'Iniciando navegador...');
        navegador = await launchBrowser({
            headless: false // Modo visible para debugging
        });

        // Usar createBrowserContext (compatible con todas las versiones)
        const contextoIncognito = await navegador.createBrowserContext();

        // Crear la página dentro del nuevo contexto
        paginaLogin = await contextoIncognito.newPage();

        console.log(`[Flujo Tasa Cero - ${nombreCliente}] Navegador iniciado con contexto aislado`);

        // AHORA sí cerrar la página en blanco inicial que crea Puppeteer
        const paginasIniciales = await navegador.pages();
        if (paginasIniciales.length > 0 && paginasIniciales[0].url() === 'about:blank') {
            await paginasIniciales[0].close(); // Cerrar "about:blank"
            console.log(`[Flujo Tasa Cero - ${nombreCliente}] Página en blanco inicial cerrada`);
        }

        // ========================================================================
        // PASO 2: Login en ATM
        // ========================================================================
        enviarProgreso('info', 'Navegando a la página de login de ATM...');
        const urlLoginATM = 'https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp';
        await paginaLogin.goto(urlLoginATM, { waitUntil: 'networkidle2' });

        enviarProgreso('info', 'Iniciando sesión en ATM...');
        const resultadoLogin = await loginATM(paginaLogin, credenciales);

        if (!resultadoLogin.success) {
            // Login falló
            const mensajesError = {
                'INVALID_CREDENTIALS': 'Credenciales inválidas. Verifique el CUIT y la clave.',
                'UPDATE_PASSWORD_REQUIRED': 'Se requiere actualización de contraseña.',
                'EMAIL_UPDATE_MODAL_ERROR': 'No se pudo cerrar el modal de actualización de email.'
            };

            const mensajeError = mensajesError[resultadoLogin.error] || resultadoLogin.message || 'Error desconocido en el login';

            enviarProgreso('error', mensajeError);
            return {
                exito: false,
                mensaje: mensajeError
            };
        }

        console.log(`[Flujo Tasa Cero - ${nombreCliente}] Login exitoso`);
        enviarProgreso('info', 'Login exitoso. Navegando al servicio de Tasa Cero...');

        // ========================================================================
        // PASO 3: Navegar al servicio de Tasa Cero
        // ========================================================================
        try {
            paginaTasaCero = await navegarATasaCero(paginaLogin, navegador);
            console.log(`[Flujo Tasa Cero - ${nombreCliente}] Navegación a Tasa Cero exitosa`);
            enviarProgreso('info', 'Acceso al formulario de Tasa Cero exitoso.');
        } catch (error) {
            enviarProgreso('error', `No se pudo acceder al servicio de Tasa Cero: ${error.message}`);
            return {
                exito: false,
                mensaje: `Error en navegación: ${error.message}`
            };
        }

        // ========================================================================
        // PASO 4: Crear directorio temporal para la descarga
        // ========================================================================
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tasacero-'));
        console.log(`[Flujo Tasa Cero] Directorio temporal creado: ${tempDir}`);

        // ========================================================================
        // PASO 5: Configurar descarga en el directorio temporal
        // ========================================================================
        enviarProgreso('info', 'Configurando descarga...');

        const client = await paginaTasaCero.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: tempDir
        });

        console.log(`[Flujo Tasa Cero] Descarga configurada en: ${tempDir}`);

        // ========================================================================
        // PASO 6: Ejecutar flujo completo de Tasa Cero
        // ========================================================================
        enviarProgreso('info', 'Procesando solicitud de Tasa Cero...');

        const resultado = await ejecutarFlujoTasaCero(
            paginaTasaCero,
            navegador,
            tempDir, // Descarga al directorio temporal
            nombreCliente,
            credenciales.cuit
        );

        // ========================================================================
        // PASO 7: Verificar que el flujo fue exitoso
        // ========================================================================
        if (!resultado.exito) {
            enviarProgreso('error', resultado.mensaje || 'Error desconocido al procesar la solicitud');
            return {
                exito: false,
                mensaje: resultado.mensaje || 'Error desconocido'
            };
        }

        // ========================================================================
        // PASO 8: Procesar el PDF descargado para detectar el estado real
        // ========================================================================
        enviarProgreso('info', 'Analizando PDF descargado...');

        const archivos = await fs.readdir(tempDir);
        const archivosPdf = archivos.filter(f => f.endsWith('.pdf'));

        if (archivosPdf.length === 0) {
            enviarProgreso('error', 'No se encontró archivo PDF en el directorio temporal.');
            return {
                exito: false,
                mensaje: 'No se encontró archivo PDF descargado'
            };
        }

        const tempFilePath = path.join(tempDir, archivosPdf[0]);
        console.log(`[Flujo Tasa Cero] Procesando PDF: ${archivosPdf[0]}`);

        // Procesar el PDF para extraer los datos usando lectura genérica
        const datosPdf = await leerPdfTasaCero(tempFilePath);

        // Detectar el estado real leyendo el contenido del PDF
        const estadoReal = encontrarEstadoSolicitud(datosPdf);
        console.log(`[Flujo Tasa Cero] Estado detectado: ${estadoReal}`);

        // ========================================================================
        // PASO 9: Generar nombre correcto y mover al destino final
        // ========================================================================
        const nombreArchivoFinal = generarNombreArchivo(nombreCliente, credenciales.cuit, estadoReal);
        const rutaDestino = path.join(carpetaDestino, `${nombreArchivoFinal}.pdf`);

        enviarProgreso('info', 'Moviendo archivo a carpeta de destino...');
        await fs.rename(tempFilePath, rutaDestino);

        console.log(`[Flujo Tasa Cero] Archivo guardado: ${rutaDestino}`);

        const mensajeEstado = estadoReal === 'ACEPTADA' ? '✅ ACEPTADA' : '❌ RECHAZADA';
        enviarProgreso('exito', `Solicitud ${mensajeEstado}. PDF descargado: ${nombreArchivoFinal}.pdf`);

        return {
            exito: true,
            success: true,
            estado: estadoReal,
            rutaArchivo: rutaDestino,
            mensaje: `Solicitud de Tasa Cero procesada: ${estadoReal}`
        };

    } catch (error) {
        console.error(`❌ [Flujo Tasa Cero - ${nombreCliente}] Error crítico:`, error);
        enviarProgreso('error', `Error crítico: ${error.message}`);
        return {
            exito: false,
            mensaje: `Error crítico en el flujo: ${error.message}`
        };

    } finally {
        // ========================================================================
        // LIMPIEZA: Cerrar navegador y eliminar directorio temporal
        // ========================================================================

        // Este código controla si el navegador se cierra automáticamente o se deja abierto
        // Para debugging: comentar el if y descomentar los console.log de abajo
        // Para producción: dejar el if descomentado (cierra el navegador)
        if (navegador) {
            await navegador.close();
            console.log(`[Flujo Tasa Cero - ${nombreCliente}] Navegador cerrado`);
            enviarProgreso('info', 'Navegador cerrado.');
        }

        // Limpieza del directorio temporal
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true })
                .catch(err => console.error(`Error al eliminar directorio temporal: ${err.message}`));
            console.log(`[Flujo Tasa Cero] Directorio temporal eliminado: ${tempDir}`);
        }
    }
}

module.exports = {
    ejecutarFlujoPuppeteerTasaCero
};
