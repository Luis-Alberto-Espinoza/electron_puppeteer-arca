let elementos = document.querySelectorAll("#contenido > div.jig_borde > div > table > tbody > tr > td:nth-child(7)");

let montos = [];

elementos.forEach(elemento => {
    let monto = parseFloat(elemento.textContent.trim());
    if (!isNaN(monto)) {
        montos.push(monto);
    }
});

let suma = montos.reduce((acumulador, monto) => acumulador + monto, 0);

console.log("La suma total de los montos es:", suma);
console.log("La cantidad de facturas es:", montos.length);