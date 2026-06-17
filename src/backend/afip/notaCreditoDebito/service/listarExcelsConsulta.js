/**
 * Lista los Excel de Consulta de Comprobantes disponibles para un emisor.
 *
 * Es el primer eslabón del flujo de Notas de Crédito/Débito: la NC se arma a
 * partir de estos Excel (ver docs/AFIP_DOC/notaCreditoDebito.md). Si la lista
 * vuelve vacía, el frontend bloquea la generación de notas con un mensaje claro
 * ("primero corré la consulta de comprobantes").
 *
 * Los Excel los genera `generarExcelComprobantes` en:
 *   <basePath>/gestor_afip_atm/<cuit_Nombre_Apellido>/archivos_afip/
 * con nombre `consulta_comprobantes_<cuit>_<desde>_a_<hasta>_<stamp>.xlsx`.
 * Como la carpeta ya está scopeada por cliente (vía CUIT), todo lo que hay ahí
 * es de este emisor; igual filtramos por el prefijo del nombre por las dudas.
 */

const fs = require('fs/promises');
const path = require('path');
const { getDownloadPath } = require('../../../utils/fileManager.js');

// Prefijo con el que `generarExcelComprobantes` nombra sus archivos. Si ese
// naming cambia, actualizar acá también.
const PREFIJO_CONSULTA = 'consulta_comprobantes_';

/**
 * @param {string} basePath - Ruta base de descargas (app.getPath('downloads')).
 * @param {{cuit: string, nombre?: string, apellido?: string}} cliente
 * @returns {Promise<Array<{nombre: string, ruta: string, fecha: Date, fechaLegible: string}>>}
 *          Excels del emisor, más reciente primero. Vacío si no hay ninguno.
 */
async function listarExcelsConsulta(basePath, cliente) {
    // getDownloadPath crea la carpeta si no existe, así que siempre podemos
    // readdir sin reventar (devuelve [] la primera vez).
    const dir = getDownloadPath(basePath, cliente, 'archivos_afip');

    const nombres = await fs.readdir(dir);

    const candidatos = nombres.filter(n =>
        n.startsWith(PREFIJO_CONSULTA) &&
        n.toLowerCase().endsWith('.xlsx') &&
        !n.startsWith('~$') // archivos de bloqueo temporales de Excel
    );

    // Tomamos mtime real del archivo (no la fecha del nombre): refleja la última
    // vez que se escribió, que es lo que querés para "el más reciente".
    const conFecha = await Promise.all(candidatos.map(async (nombre) => {
        const ruta = path.join(dir, nombre);
        const stat = await fs.stat(ruta);
        return {
            nombre,
            ruta,
            fecha: stat.mtime,
            fechaLegible: stat.mtime.toLocaleString('es-AR')
        };
    }));

    conFecha.sort((a, b) => b.fecha - a.fecha);
    return conFecha;
}

module.exports = { listarExcelsConsulta };
