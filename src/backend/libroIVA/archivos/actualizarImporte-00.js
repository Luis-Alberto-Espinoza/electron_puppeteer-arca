const fs = require('fs');
const path = require('path');

function actualizarImporte(informe) {
    console.log('\n\t ###############', informe);
    const { archivos, libroActualizado: lineasModificadas } = informe;

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