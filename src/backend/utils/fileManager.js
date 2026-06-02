const fs = require('fs');
const path = require('path');

/**
 * Normaliza un texto para usarlo como segmento de nombre de carpeta:
 * trim → quita tildes (NFD) → lowercase → no-alfanuméricos a `_` → colapsa `_`.
 * Determinista: misma entrada → misma salida, sin importar capitalización ni acentos.
 */
function normalizarTexto(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * Capitaliza cada palabra de un texto (para guardar nombres canónicos).
 * "  juAN  pErEz " → "Juan Perez". No toca tildes.
 */
function capitalizarTexto(s) {
    return String(s || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(/(^|\s)\S/g, c => c.toUpperCase());
}

/**
 * Capitaliza para uso como segmento de carpeta: quita tildes, separa palabras
 * por `_` y deja cada palabra en TitleCase. "  juAN pÉrEz " → "Juan_Perez".
 * Usado por `nombreCarpetaCliente` para apellido y nombre.
 */
function capitalizarParaCarpeta(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .trim()
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('_');
}

/**
 * Construye el segmento de carpeta canónico para un cliente, con identidad
 * basada en el CUIT (siempre estable, no varía aunque cambien capitalización
 * u orden del nombre). Formato: `${cuit}_${Nombre}_${Apellido}` con nombre
 * y apellido en TitleCase (sin apellido si no está disponible).
 *
 * @param {{cuit: string, nombre?: string, apellido?: string}} cliente
 * @returns {string}
 */
function nombreCarpetaCliente({ cuit, nombre, apellido } = {}) {
    const cuitLimpio = String(cuit || '').replace(/\D/g, '') || 'sinCuit';
    const nombreCap = capitalizarParaCarpeta(nombre);
    const apellidoCap = capitalizarParaCarpeta(apellido);
    const partes = [cuitLimpio, nombreCap, apellidoCap].filter(Boolean);
    return partes.join('_');
}

/**
 * Asegura que el directorio de descargas exista y devuelve la ruta completa.
 *
 * Acepta dos formas de identificar al cliente:
 *  - **Recomendado:** objeto `{ cuit, nombre, apellido? }` → carpeta canónica
 *    `${cuit}_${apellido}_${nombre}` (identidad por CUIT, evita duplicados por
 *    capitalización u orden).
 *  - **Legacy:** string con el nombre suelto → comportamiento histórico
 *    (sanitización vieja). Loguea un warning para detectar callsites pendientes
 *    de migrar.
 *
 * @param {string} basePath - La ruta base de descargas (ej: app.getPath('downloads')).
 * @param {string|{cuit: string, nombre?: string, apellido?: string}} clienteOrName
 * @param {string} serviceType - 'archivos_afip' o 'archivos_atm'.
 * @returns {string} La ruta absoluta al directorio de descargas específico.
 */
function getDownloadPath(basePath, clienteOrName, serviceType) {
    let segmento;
    if (clienteOrName && typeof clienteOrName === 'object') {
        segmento = nombreCarpetaCliente(clienteOrName);
    } else {
        // Fallback legacy: el callsite todavía pasa un string. La carpeta no
        // tendrá CUIT y puede colisionar con variantes (paTriCio vs Patricio).
        // Migrar a `{cuit, nombre, apellido}` cuanto antes.
        console.warn('[fileManager] getDownloadPath recibió un string en vez de {cuit,nombre,apellido} — carpeta sin CUIT, riesgo de duplicados');
        segmento = String(clienteOrName || '').replace(/[^a-zA-Z0-9]/g, '_');
    }

    const downloadDir = path.join(basePath, 'gestor_afip_atm', segmento, serviceType);

    if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
    }

    return downloadDir;
}

/**
 * Genera un nombre de archivo estandarizado y único.
 * @param {string} serviceType - 'constancia_fiscal', 'plan_pago', etc.
 * @param {string} cuit - CUIT del contribuyente.
 * @param {string} type - 'pdf' o 'csv'.
 * @returns {string} El nombre de archivo generado.
 */
function getFilename(serviceType, cuit, type) {
    const date = new Date();
    const timestamp = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}` +
                      `_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}${date.getSeconds().toString().padStart(2, '0')}`;
    return `${serviceType}_${cuit}_${timestamp}.${type}`;
}

/**
 * Espera a que un archivo se descargue y lo renombra.
 * @param {string} downloadPath - La ruta donde se espera el archivo.
 * @param {string} originalFilename - El nombre original del archivo descargado.
 * @param {string} newFilename - El nuevo nombre para el archivo.
 * @param {number} timeout - Tiempo máximo de espera en milisegundos.
 * @returns {Promise<string>} La nueva ruta del archivo.
 */
function waitForFile(downloadPath, originalFilename, newFilename, timeout = 60000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            const originalFilePath = path.join(downloadPath, originalFilename);
            const newFilePath = path.join(downloadPath, newFilename);

            if (fs.existsSync(originalFilePath)) {
                clearInterval(interval);
                fs.rename(originalFilePath, newFilePath, (err) => {
                    if (err) {
                        reject(new Error(`Error al renombrar el archivo: ${err.message}`));
                    } else {
                        resolve(newFilePath);
                    }
                });
            } else if (Date.now() - startTime > timeout) {
                clearInterval(interval);
                reject(new Error(`Tiempo de espera agotado para el archivo: ${originalFilename}`));
            }
        }, 1000);
    });
}

/**
 * Mueve un archivo de `origen` a `destino` de forma segura entre discos.
 *
 * `fs.rename` solo funciona dentro del mismo volumen: si el origen está en el
 * temp del sistema (C:) y el destino en otra unidad (D:), Windows tira
 * `EXDEV: cross-device link not permitted`. En ese caso copiamos y borramos el
 * original. Por eso a veces "funcionaba": cuando temp y destino caían en el
 * mismo disco el rename andaba; al cambiar la carpeta de descargas a otra
 * unidad, fallaba.
 *
 * @param {string} origen - Ruta del archivo a mover.
 * @param {string} destino - Ruta destino (incluye nombre de archivo).
 * @returns {Promise<void>}
 */
async function moverArchivo(origen, destino) {
    const fsp = fs.promises;
    try {
        await fsp.rename(origen, destino);
    } catch (err) {
        if (err.code === 'EXDEV') {
            await fsp.copyFile(origen, destino);
            await fsp.unlink(origen);
        } else {
            throw err;
        }
    }
}

/**
 * Genera un nombre de archivo estandarizado para retenciones/percepciones ATM.
 * Formato: CUIT_SubServiceName_YYYY-MM_YYYY-MM-DD.extension
 * Ejemplo: 20123456789_Retenciones_SIRTAC_IB_2025-01_2025-01-28.xlsx
 *
 * @param {string} cuit - CUIT del contribuyente.
 * @param {string} subServiceName - Nombre del subservicio (ej: "Retenciones SIRTAC I.B.").
 * @param {string} periodo - Periodo en formato YYYY-MM (ej: "2025-01").
 * @param {string} extension - Extensión del archivo sin punto (ej: "xlsx", "txt").
 * @returns {string} El nombre de archivo generado.
 */
function getFilenameRetenciones(cuit, subServiceName, periodo, extension) {
    // Sanitizar nombre del subservicio (reemplazar espacios con guiones bajos)
    const sanitizedSubServiceName = subServiceName.replace(/\s+/g, '_').replace(/\./g, '');

    // Obtener fecha actual en formato YYYY-MM-DD
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const fechaDescarga = `${year}-${month}-${day}`;

    // Formato: CUIT_SubServiceName_periodo_fechaDescarga.extension
    return `${cuit}_${sanitizedSubServiceName}_${periodo}_${fechaDescarga}.${extension}`;
}

/**
 * Devuelve la ruta de consolidados AFIP (compartida entre representantes),
 * creándola si no existe. Estructura:
 *   basePath/gestor_afip_atm/consolidados_afip/<subServicio>/
 *
 * @param {string} basePath - Ruta base de descargas (app.getPath('downloads')).
 * @param {string} subServicio - Subservicio, ej: 'planes_de_pago'.
 * @returns {string} Ruta absoluta al directorio.
 */
function getConsolidadoAfipPath(basePath, subServicio) {
    const sub = String(subServicio || 'general').replace(/[^a-zA-Z0-9_]/g, '_');
    const dir = path.join(basePath, 'gestor_afip_atm', 'consolidados_afip', sub);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

module.exports = {
    getDownloadPath,
    getConsolidadoAfipPath,
    moverArchivo,
    getFilename,
    getFilenameRetenciones,
    waitForFile,
    nombreCarpetaCliente,
    normalizarTexto,
    capitalizarTexto,
};
