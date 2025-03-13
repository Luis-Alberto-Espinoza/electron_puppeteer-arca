const { info } = require('console');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

function mostrarEstructura(objeto) {
    return Object.keys(objeto);
}

function actualizarImporte(informe) {
    const { archivos, libroActualizado: lineasModificadas } = informe.informe;

    const rutaArchivoComprobante = path.join(__dirname, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_CBTE 30717267024-2025010.txt');
    const rutaArchivoAlicuotas = path.join(__dirname, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025010.txt');
    const rutaArchivoResultados = path.join(__dirname, 'copias', 'resultadosDEComparar.txt');
    let lineasModificadasString = "";

    try {
        // Recorrer el arreglo de lineas modificadas
        Object.values(lineasModificadas).forEach((linea, indice) => {
            lineasModificadasString += linea + '\n';
            // if(indice === 634 || indice === 1058 || indice === 5447 ){ 
            //     console.log('linea:', indice, 'linea:', linea);
            // }
        });


        // Pasar al archivo rutaArchivoResultados el contenido de lineasModificadasString
        fs.writeFileSync(rutaArchivoResultados, lineasModificadasString);

    } catch (error) {
        console.error('Error al procesar archivos:', error);
        console.log('Error al procesar archivos. Consulta la consola para más detalles.');
    }
}

module.exports = { actualizarImporte };