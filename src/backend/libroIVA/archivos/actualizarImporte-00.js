const fs = require('fs');
const path = require('path');

function actualizarImporte(lineasModificadas) {
    const rutaArchivoComprobante = path.join(__dirname, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_CBTE 30717267024-2025010.txt');
    const rutaArchivoAlicuotas = path.join(__dirname, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025010.txt');
    const rutaArchivoResultados = path.join(__dirname, 'copias', 'resultadosDEComparar.txt');

    try {

        if (Array.isArray(lineasModificadas)) {
            fs.writeFileSync(rutaArchivoResultados, lineasModificadas.join('\n'), 'utf8');
        } else {
            console.error('lineasModificadas no es un arreglo:', lineasModificadas);
        }

    } catch (error) {
        console.error('Error al procesar archivos:', error);
        console.log('Error al procesar archivos. Consulta la consola para más detalles.');
    }
}


actualizarImporte();