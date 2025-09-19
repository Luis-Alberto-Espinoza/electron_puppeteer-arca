const fs = require('fs');
const path = require('path');

/**
 * Asegura que el directorio de descargas exista y devuelve la ruta completa.
 * @param {string} basePath - La ruta base de descargas (ej: app.getPath('downloads')).
 * @param {string} userName - Nombre de usuario (se sanitizará).
 * @param {string} serviceType - 'archivos_afip' o 'archivos_atm'.
 * @returns {string} La ruta absoluta al directorio de descargas específico.
 */
function getDownloadPath(basePath, userName, serviceType) {
    const sanitizedUserName = userName.replace(/[^a-zA-Z0-9]/g, '_');
    const downloadDir = path.join(basePath, 'gestor_afip_atm', sanitizedUserName, serviceType);

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

module.exports = {
    getDownloadPath,
    getFilename,
    waitForFile,
};
