let elementos = document.querySelectorAll("#contenido > div.jig_borde > div > table > tbody > tr > td:nth-child(7)");
let suma = 0;
let montos = [];
let stringi = "";

elementos.forEach((elemento, index) => {
    let monto = parseFloat(elemento.textContent.trim());
    let fila = elemento.closest("tr"); // Selecciona la fila actual
    let celdaTerceraColumna = fila.querySelector("td:nth-child(3)"); // Selecciona la tercera columna dentro de la fila actual
    
    if (celdaTerceraColumna && !isNaN(monto)) {
        let textoTerceraColumna = celdaTerceraColumna.textContent.trim();
        stringi += textoTerceraColumna + ", " + monto + "\n";
        montos.push(monto);
    }
});

// Sumar los montos
suma = montos.reduce((acumulador, monto) => acumulador + monto, 0);

console.log("La suma total de los montos es:", suma);
console.log("La cantidad de facturas es:", montos.length);
//console.log(stringi);
