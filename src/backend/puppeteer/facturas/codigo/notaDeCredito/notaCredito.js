/** extraer datos de facturacion para nota de credito  */
// se ejecuta desde la consola en la pagina de busqueda de comprobantes de afip
//cdigo para tomar los numeros de facturas y los montos 
//àra `pder hacer un array de datos
let elementosColumna7 = document.querySelectorAll("#contenido > div.jig_borde > div > table > tbody > tr > td:nth-child(7)");
let elementosColumna3 = document.querySelectorAll("#contenido > div.jig_borde > div > table > tbody > tr > td:nth-child(3)");

let suma = 0;
let montos = [];
let stringi = "";

elementosColumna7.forEach((elemento, index) => {
    let monto = parseFloat(elemento.textContent.trim());
    let textoTerceraColumna = elementosColumna3[index].textContent.trim();

    if (!isNaN(monto)) {
        stringi = monto + ", " + textoTerceraColumna + "\n" + stringi; // Añadir al inicio del string
        montos.push(monto);
    }
});

suma = montos.reduce((acumulador, monto) => acumulador + monto, 0);

console.log("La suma total de los montos es:", suma);
console.log("La cantidad de facturas es:", montos.length);
console.log(stringi);
