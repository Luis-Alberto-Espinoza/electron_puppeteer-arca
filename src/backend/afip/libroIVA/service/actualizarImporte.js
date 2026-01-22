// afip/libroIVA/service/actualizarImporte.js
// Actualiza los importes en los archivos del Libro IVA

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// Ruta a la carpeta de datos
const DATA_PATH = path.join(__dirname, '..', 'data');

/**
 * Actualiza los importes en el archivo de comprobantes segun el informe generado
 * @param {Object} informe - Objeto con el informe que contiene libroActualizado
 */
function actualizarImporte(informe) {
    console.log("[Actualizar Importe] Modificando segun informe...");

    const { libroActualizado: lineasModificadas } = informe.informe;

    if (!lineasModificadas || lineasModificadas.length === 0) {
        throw new Error('No hay lineas modificadas para actualizar');
    }

    console.log("[Actualizar Importe] Lineas a procesar:", lineasModificadas.length);

    const rutaArchivoResultados = path.join(DATA_PATH, 'copias', 'resultado_modificado.txt');
    let lineasModificadasString = "";

    try {
        // Recorrer el arreglo de lineas modificadas
        Object.values(lineasModificadas).forEach((linea) => {
            lineasModificadasString += linea + '\n';
        });

        // Convertir el contenido a la codificacion deseada
        const contenidoCodificado = iconv.encode(lineasModificadasString, 'ISO-8859-1');

        // Asegurar que existe el directorio
        const dirPath = path.dirname(rutaArchivoResultados);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // Escribir el archivo con la codificacion especificada
        fs.writeFileSync(rutaArchivoResultados, contenidoCodificado);

        console.log("[Actualizar Importe] Archivo guardado en:", rutaArchivoResultados);

    } catch (error) {
        console.error('Error al procesar archivos:', error);
        throw error;
    }
}

module.exports = { actualizarImporte };
