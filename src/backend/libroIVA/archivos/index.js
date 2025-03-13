const fs = require('fs');
const path = require('path');
const generarInforme = require('./generarInforme-00.js');
const { actualizarImporte } = require('./actualizarImporte-00.js');
let informe ={};
function libroIVAManager(data) {
      // console.log("Datos recibidos en libroIVAManager:", data);
    const validCases = ['informe', 'modificarSegunInforme', 'eliminarAnteriores', 'todoAnterior'];
    if (!validCases.includes(data.case)) {
        throw new Error('Debe seleccionar una y solo una opción válida.');
    }


    switch (data.case) {
        case 'informe':
            informe = analizarArchivos(data.archivos);
            return informe;
        case 'modificarSegunInforme':
           // console.log("$$$$$$ ", rutasArchivos)
            return actualizarArchivos(informe);
        case 'eliminarAnteriores':
            return eliminarArchivosAnteriores(data.archivos);
        case 'todoAnterior':
            return mostrarInforme(data.archivos);
        default:
            throw new Error('Caso no reconocido: ' + data.case);
    }
}


function mostrarEstructura(objeto) {
    return Object.keys(objeto);
}




function analizarArchivos(archivos) {
    informe = generarInforme(archivos);
    //console.dir(informe, {depth: null})
    // console.dir(informe)
    let resultado //= mostrarEstructura(informe)
    resultado = mostrarEstructura(informe)
    //console.log(resultado);
    //console.log(informe.diferencias[2].importeAlicuota);
    const lineasCorregidas = informe.libroActualizado;
    const mesajeRetorno = informe.mensaje;
    // console.log("que es archivo ", Object.keys(archivos));
    // console.log("que es archivo ", archivos);
    return { message: 'Archivos analizados correctamente', archivos, informe };
}

function actualizarArchivos(informe) {
   // console.log("Llegue a modificar segun informe");
   // console.log("llegue al metodo esto tiene archivos ", informe);

    actualizarImporte(informe);

    return { message: 'Archivos actualizados correctamente', archivos: informe.archivos };
}

function eliminarArchivosAnteriores(archivos) {
    return { message: 'Archivos anteriores eliminados correctamente', archivos };
}

function mostrarInforme(archivos) {
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
let consulta = {
    case: 'informe',
    archivos: [

        '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_CBTE 30717267024-2025010.TXT',
        '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025010.txt'
        // '/home/pinchechita/Descargas/20-31747354-1_2022-6_1_Compras__rg3685_comprobantes.txt',
        // '/home/pinchechita/Descargas/20-31747354-1_2022-6_2_Compras__rg3685_alicuotas.txt'
    ]

}


//let retorno = libroIVAManager(consulta);
// console.log(retorno);
// console.dir(retorno, { depth: null });


//  '/home/pinchechita/Descargas/20-31747354-1_2022-6_1_Compras__rg3685_comprobantes.txt',
// '/home/pinchechita/Descargas/20-31747354-1_2022-6_2_Compras__rg3685_alicuotas.txt'
