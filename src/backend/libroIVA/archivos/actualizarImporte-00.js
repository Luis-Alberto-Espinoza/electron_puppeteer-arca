const { info } = require('console');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

function mostrarEstructura(objeto) {
    return Object.keys(objeto);
}

function actualizarImporte(informe) {
    console.log("Llegue a modificar segun informe");
    console.log("llegue al metodo esto tiene archivos ", informe.informe.libroActualizado);
    console.log("\n\n\n\n\n\n\n\n\n\n");
    const { archivos, libroActualizado: lineasModificadas } = informe.informe;
console.log("mira el libro actualizado ", lineasModificadas);
    const rutaArchivoComprobante = path.join(__dirname, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_CBTE 30717267024-2025010-Modificado.txt');
    const rutaArchivoAlicuotas = path.join(__dirname, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025010-Modificado.txt');
    const rutaArchivoResultados = path.join(__dirname, 'copias', 'pascu.txt');
    let lineasModificadasString = "";

    try {
        // Recorrer el arreglo de lineas modificadas
        Object.values(lineasModificadas).forEach((linea, indice) => {
            lineasModificadasString += linea + '\n';
        });

        // Convertir el contenido a la codificación deseada (por ejemplo, ISO-8859-1)
        const contenidoCodificado = iconv.encode(lineasModificadasString, 'ISO-8859-1');

        // Escribir el archivo con la codificación especificada
        fs.writeFileSync(rutaArchivoResultados, contenidoCodificado);

    } catch (error) {
        console.error('Error al procesar archivos:', error);
        console.log('Error al procesar archivos. Consulta la consola para más detalles.');
    }
}

module.exports = { actualizarImporte };