// carpetaContribuyente.js
// Helper de carpeta canónica por contribuyente.
//
// Igual que fileManager.getDownloadPath, pero el segmento de NOMBRE sale de la
// razón social canónica del contribuyente (buscado por CUIT en el repo), usando
// la MISMA función `nombreDe` que el resolver. Así AFIP y ATM caen en la MISMA
// carpeta `${cuit}_${nombreCanonico}/` y los datos del mismo contribuyente se
// cruzan en disco.
//
// Vive en el dominio `cliente` (no en utils) porque conoce el repo: mantiene a
// fileManager genérico, sin dependencia hacia el modelo.

const { getDownloadPath } = require('../utils/fileManager.js');
const { getContribuyenteRepo } = require('./contribuyenteStore.js');
const { nombreDe } = require('./resolverAcceso.js');

/**
 * @param {string} downloadsPath  ruta base de descargas
 * @param {string} cuit           CUIT del contribuyente (identidad/carpeta)
 * @param {string} nombreFallback nombre a usar si el cuit no está en el repo
 * @param {string} serviceType    'archivos_afip' | 'archivos_atm/...' etc.
 * @returns {Promise<string>}      ruta absoluta a la carpeta (creada si no existe)
 */
async function getDownloadPathContribuyente(downloadsPath, cuit, nombreFallback, serviceType) {
    let nombre = nombreFallback;
    try {
        const c = await getContribuyenteRepo().getByCuit(String(cuit));
        if (c) nombre = nombreDe(c);   // misma lógica que AFIP (objetivoNombre)
    } catch (_) {
        // Si el repo todavía no tiene el contribuyente, caemos al nombre provisto.
    }
    return getDownloadPath(downloadsPath, { cuit: String(cuit), nombre }, serviceType);
}

module.exports = { getDownloadPathContribuyente };
