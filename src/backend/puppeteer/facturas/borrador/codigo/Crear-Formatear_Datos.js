
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