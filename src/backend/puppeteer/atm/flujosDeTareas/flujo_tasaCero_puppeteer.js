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
const { launchBrowser } = require('../../archivos_comunes/navegador/browserLauncher.js');
const { loginATM } = require('../codigoXpagina/login_atm.js');
const { navegarATasaCero } = require('../codigoXpagina/aplicativos-tasaCero.js');
const {
    ejecutarFlujoTasaCero,
    ejecutarFlujoReimpresion
} = require('../codigoXpagina/tasaCero-formulario.js');
const { getDownloadPath } = require('../../../utils/fileManager.js');

/**
 * Extrae el mes en español abreviado de un periodo en formato MM/YYYY
 * @param {string} periodo - Periodo en formato "MM/YYYY" (ej: "12/2025")
 * @returns {string} Nombre del mes (ene, feb, mar, etc.)
 */
function obtenerMesDePeriodo(periodo) {
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    // Extraer el mes del periodo "12/2025" → "12"
    const partes = periodo.split('/');
    if (partes.length === 2) {
        const mesNumero = parseInt(partes[0], 10); // "12" → 12
        if (mesNumero >= 1 && mesNumero <= 12) {
            return meses[mesNumero - 1]; // 12 → índice 11 → "dic"
        }
    }

    // Fallback: mes actual si el formato es inválido
    console.warn(`[obtenerMesDePeriodo] Formato de periodo inválido: ${periodo}, usando mes actual`);
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
 * @param {string} periodo - Periodo en formato "MM/YYYY" (ej: "12/2025")
 * @returns {string} Nombre del archivo sin extensión
 */
function generarNombreArchivo(nombreEmpresa, cuit, estado, periodo) {
    const empresaSanitizada = sanitizarNombre(nombreEmpresa);
    const mes = obtenerMesDePeriodo(periodo);
    const estadoTexto = estado === 'ACEPTADA' ? 'tasaCero_Aceptado' : 'tasaCero_Rechazado';

    return `${empresaSanitizada}_${cuit}_${mes}_${estadoTexto}`;
}

/**
 * Ejecuta el flujo completo de descarga de comprobante Tasa Cero para un cliente
 *
 * @param {Object} opciones - Opciones de configuración
 * @param {Object} opciones.credenciales - Credenciales del cliente {cuit, clave}
 * @param {string} opciones.nombreCliente - Nombre del cliente (para logs)
 * @param {string} opciones.clienteId - ID del cliente (para nombre de archivo)
 * @param {string} opciones.downloadsPath - Ruta base de descargas (app.getPath('downloads'))
 * @param {string} opciones.nombreUsuario - Nombre del usuario (para construir ruta)
 * @param {string} opciones.periodo - Periodo a procesar en formato YYYY-MM (ej: "2025-12")
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
        periodo,
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
        const carpetaDestino = getDownloadPath(downloadsPath, nombreUsuario, 'archivos_atm/tasa_cero');
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
        enviarProgreso('info', `Procesando solicitud de Tasa Cero para periodo ${periodo}...`);

        const resultado = await ejecutarFlujoTasaCero(
            paginaTasaCero,
            navegador,
            tempDir, // Descarga al directorio temporal
            nombreCliente,
            credenciales.cuit,
            periodo // Pasar el periodo seleccionado
        );

        // ========================================================================
        // PASO 7: Verificar el resultado del flujo
        // ========================================================================

        // CASO ESPECIAL: Solicitud ya aprobada - requiere reimpresión
        if (resultado.necesitaReimpresion) {
            console.log('🔄 [Flujo Tasa Cero] Solicitud ya fue aprobada. Ejecutando flujo de reimpresión...');
            enviarProgreso('info', 'Su Solicitud ya fue aprobada. Reimprimiendo comprobante...');

            // Ejecutar flujo de reimpresión
            const resultadoReimpresion = await ejecutarFlujoReimpresion(
                paginaTasaCero,
                navegador,
                tempDir, // Descarga al directorio temporal
                nombreCliente,
                credenciales.cuit,
                periodo // Pasar el periodo para buscar en la tabla
            );

            // Verificar resultado de reimpresión
            if (!resultadoReimpresion.exito) {
                enviarProgreso('error', resultadoReimpresion.mensaje || 'Error al reimprimir la solicitud');
                return {
                    exito: false,
                    mensaje: resultadoReimpresion.mensaje || 'Error en reimpresión'
                };
            }

            // Mover el archivo reimpreso a la carpeta destino
            const archivosReimpresos = await fs.readdir(tempDir);
            const archivoPdfReimpreso = archivosReimpresos.find(f => f.endsWith('.pdf'));

            if (!archivoPdfReimpreso) {
                enviarProgreso('error', 'No se encontró archivo PDF reimpreso.');
                return {
                    exito: false,
                    mensaje: 'No se encontró archivo PDF reimpreso'
                };
            }

            const rutaOrigenReimpreso = path.join(tempDir, archivoPdfReimpreso);
            const rutaDestinoReimpreso = path.join(carpetaDestino, archivoPdfReimpreso);

            enviarProgreso('info', 'Moviendo archivo reimpreso a carpeta de destino...');
            await fs.rename(rutaOrigenReimpreso, rutaDestinoReimpreso);

            console.log(`[Flujo Tasa Cero] Archivo reimpreso guardado: ${rutaDestinoReimpreso}`);
            enviarProgreso('exito', `✅ Solicitud reimpresa. PDF descargado: ${archivoPdfReimpreso}`);

            return {
                exito: true,
                success: true,
                estado: 'ACEPTADA',
                rutaArchivo: rutaDestinoReimpreso,
                carpetaDestino: carpetaDestino, // Para botón "Abrir Carpeta" en frontend
                mensaje: 'Solicitud ya estaba aprobada. PDF reimpreso exitosamente.',
                reimpresion: true
            };
        }

        // CASO NORMAL: Error en el flujo
        if (!resultado.exito) {
            enviarProgreso('error', resultado.mensaje || 'Error desconocido al procesar la solicitud');
            return {
                exito: false,
                mensaje: resultado.mensaje || 'Error desconocido'
            };
        }

        // ========================================================================
        // PASO 8: Obtener el archivo PDF descargado y el estado ya detectado
        // ========================================================================
        // El estado ya fue detectado correctamente en ejecutarFlujoTasaCero
        // buscando el botón "Imprimir Solicitud Rechazada" en la página.
        // No releer el PDF para detectar estado (pdfjs divide el texto en pequeños
        // items, por lo que una comparación exacta del string completo nunca coincide).
        const estadoReal = resultado.estado || 'ACEPTADA';
        console.log(`[Flujo Tasa Cero] Estado detectado por flujo: ${estadoReal}`);

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
        console.log(`[Flujo Tasa Cero] PDF encontrado: ${archivosPdf[0]}`);

        // ========================================================================
        // PASO 9: Generar nombre correcto y mover al destino final
        // ========================================================================
        const nombreArchivoFinal = generarNombreArchivo(nombreCliente, credenciales.cuit, estadoReal, periodo);
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
            carpetaDestino: carpetaDestino, // Para botón "Abrir Carpeta" en frontend
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
