//const actualizadorDeArchivos = require("./actualizarImporte-00.js");
const generadorDeInforme = require('./generarInforme-00.js');
//const eliminadorDeAnteriores = require('./eliminarAteriores_00.js');

function libroIVAManager(data) {
    switch (data.case) {
        case 1:
            return analizarArchivos(data.archivos);
        case 2:
            return actualizarArchivos(data.archivos);
        case 3:
            return eliminarArchivosAnteriores(data.archivos);
        case 4:
            return mostrarInforme(data.archivos);
        default:
            throw new Error('Caso no reconocido');
    }
}

function analizarArchivos(archivos) {
    // Implementar lógica para analizar los archivos de libro IVA
    // Revisar que sean CUIT válidos, la sumatoria, etc.
const lineasCorregidas = generadorDeInforme().lineasCorregidas;
const mesajeRetorno = generadorDeInforme().message;
console.log('lineasCorregidas',lineasCorregidas);M
console.log('mesajeRetorno',mesajeRetorno);




    return { message: 'Archivos analizados correctamente', archivos };
}

function actualizarArchivos(archivos) {
    // Implementar lógica para actualizar los archivos con datos limpios
   // return { message: 'Archivos actualizados correctamente', archivos };
}

function eliminarArchivosAnteriores(archivos) {
    // Implementar lógica para eliminar archivos anteriores
    return { message: 'Archivos anteriores eliminados correctamente', archivos };
}

function mostrarInforme(archivos) {
    // Implementar lógica para mostrar un informe de los archivos
    return { message: 'Informe generado correctamente', archivos };
}

module.exports = { libroIVAManager };

/*
Manejamos lo relacionado a los LIBRO IVA
Crear una solucion para procesar la estructura para 
1- analizar los archivos de libro iva (revisar que sean cuit validos, la sumatoria,)
2- actualizar los archivos (datos limpios,)
3- eliminar anteriores 
4- mostrar informe


*/