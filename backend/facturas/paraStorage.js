function pStorage(){


let arrayDatos = [
    ["25/06/2024", 5000],
    // otros elementos...
    ["25/06/2024", 10000],
];

//descomentar segun se requiera 

let datosDeEmision = 'producto';
//let datosDeEmision = 'servicio';


//let datosDeOperacion = 'Factura_B';
let datosDeOperacion = 'Factura_C';


// Convertir el array a una cadena JSON y guardarlo en el localStorage
localStorage.setItem('arrayDatos', JSON.stringify(arrayDatos));
localStorage.setItem('datosDeEmision', datosDeEmision);
localStorage.setItem('datosDeOperacion', datosDeOperacion);
if (localStorage.getItem('iterador') === null || localStorage.getItem('iterador') !== '0') {
    // Si no existe o tiene un valor distinto a 0, crea o la formatea con el valor cero
    localStorage.setItem('iterador', 0);
};
}
module.exports = {
    pStorage
}


function generarCodigoLocalStorage(factura) {
    if (!factura) {
        return { error: "El objeto factura es requerido." };
    }
    if (!factura.datosMasivos && !factura.fechas) {
        return { error: "El objeto factura debe tener datosMasivos o fechas." };
    }

    let arrayDatos = [];
    if (factura.datosMasivos) {
        arrayDatos = factura.datosMasivos.map(item => [item.fecha, item.monto]);
    } else if (factura.fechas) {
        arrayDatos = factura.fechas.map(fecha => [fecha, factura.montoTotal ? factura.montoTotal : 0]); //monto 0 por defecto si no existe monto total

    }


    const datosDeEmision = factura.tipoActividad;
    const datosDeOperacion = `Factura_${factura.tipoContribuyente}`;
    let iterador = localStorage.getItem('iterador');

    if (iterador === null || isNaN(parseInt(iterador))) {
        iterador = 0;
    } else {
        iterador = parseInt(iterador)
    }


    const codigoLocalStorage = `
localStorage.setItem('arrayDatos', JSON.stringify(${JSON.stringify(arrayDatos)}));
localStorage.setItem('datosDeEmision', '${datosDeEmision}');
localStorage.setItem('datosDeOperacion', '${datosDeOperacion}');
if (localStorage.getItem('iterador') === null || localStorage.getItem('iterador') !== '0') {
    localStorage.setItem('iterador', 0);
};
`;

    return { codigo: codigoLocalStorage };
}

module.exports = {
    generarCodigoLocalStorage
};