// afip/libroIVA/libroIvaManager.js
// Manager para el servicio de Libro IVA

const generarInforme = require('./service/generarInforme.js');
const { compararComprobantes } = require('./service/eliminarAnteriores.js');
const { actualizarImporte } = require('./service/actualizarImporte.js');

let informeActual = {};

/**
 * Manager principal de Libro IVA
 * Procesa las diferentes operaciones relacionadas con el Libro IVA digital
 * @param {Object} data - Datos de la operación
 * @param {string} data.case - Tipo de operación: 'informe', 'modificarSegunInforme', 'eliminarAnteriores', 'todoAnterior'
 * @param {Array} data.archivos - Rutas de los archivos a procesar
 * @returns {Object} Resultado de la operación
 */
function procesarLibroIva(data) {
    console.log("[LibroIVA Manager] Datos recibidos:", data);

    const casosValidos = ['informe', 'modificarSegunInforme', 'eliminarAnteriores', 'todoAnterior'];

    if (!casosValidos.includes(data.case)) {
        throw new Error('Debe seleccionar una opción válida: ' + casosValidos.join(', '));
    }

    switch (data.case) {
        case 'informe':
            return generarInformeLibroIva(data.archivos);

        case 'modificarSegunInforme':
            return modificarSegunInforme();

        case 'eliminarAnteriores':
            return eliminarAnteriores(data);

        case 'todoAnterior':
            return mostrarInforme(data.archivos);

        default:
            throw new Error('Caso no reconocido: ' + data.case);
    }
}

/**
 * Analiza los archivos del Libro IVA y genera un informe de diferencias
 * @param {Array} archivos - Rutas de archivos [comprobantes, alicuotas]
 * @returns {Object} Informe con diferencias encontradas
 */
function generarInformeLibroIva(archivos) {
    informeActual = generarInforme(archivos);

    const lineasCorregidas = informeActual.libroActualizado;
    const mensajeRetorno = informeActual.mensaje;

    return {
        message: 'Archivos analizados correctamente',
        archivos,
        informe: informeActual
    };
}

/**
 * Actualiza los archivos según el informe previamente generado
 * @returns {Object} Resultado de la actualización
 */
function modificarSegunInforme() {
    if (!informeActual || !informeActual.libroActualizado) {
        throw new Error('No hay informe previo. Primero debe generar un informe.');
    }

    actualizarImporte({ informe: informeActual });

    return {
        message: 'Archivos actualizados correctamente',
        archivos: informeActual.archivos
    };
}

/**
 * Elimina las líneas anteriores al número especificado
 * @param {Object} data - Datos con el número a eliminar
 * @returns {Object} Resultado de la eliminación
 */
function eliminarAnteriores(data) {
    console.log("[LibroIVA Manager] Eliminando anteriores...");
    compararComprobantes(data);
    return { message: 'Archivos anteriores eliminados correctamente' };
}

/**
 * Muestra el informe de los archivos
 * @param {Array} archivos - Rutas de archivos
 * @returns {Object} Informe generado
 */
function mostrarInforme(archivos) {
    return { message: 'Informe generado correctamente', archivos };
}

module.exports = {
    procesarLibroIva,
    generarInformeLibroIva,
    modificarSegunInforme,
    eliminarAnteriores
};
