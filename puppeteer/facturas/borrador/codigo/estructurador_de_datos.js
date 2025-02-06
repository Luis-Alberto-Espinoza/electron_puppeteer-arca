const configuracion = {
    montoMaximo: 344000,
  
};

// Ahora aceptamos fechas en formato DD/MM/YYYY
let montoFactura = [
    ["01/11/2024", 859226.94],
["02/11/2024", 917413.99],
["03/11/2024", 793179.54],
["04/11/2024", 700444.36],
    
];

let suma = montoFactura.reduce((acumulador, subarray) => acumulador + subarray[1], 0);

let resultadoFacturas = [];
let arrayFacturasGeneradas = [];

function generarSubFacturas(montoFactura) {
    for (const factura of montoFactura) {
        const [fecha, monto] = factura;
        
        if (monto > configuracion.montoMaximo) {
            let resto = monto;
            let subFacturas = [fecha];

            while (resto > configuracion.montoMaximo) {
                let nuevaFactura = Math.random() * (0.2 * configuracion.montoMaximo) + 0.8 * configuracion.montoMaximo;
                nuevaFactura = Math.round(nuevaFactura / 5) * 5;
                subFacturas.push(nuevaFactura);
                resto -= nuevaFactura;
            }

            if (resto > 0) {
                subFacturas.push(Math.round(resto / 5) * 5);
            }

            arrayFacturasGeneradas.push(subFacturas);
        } else {
            arrayFacturasGeneradas.push([fecha, Math.round(monto / 5) * 5]);
        }
    }
}

function agregarFechas(arrayMonto) {
    let contador = 0;
    for (let i = 0; i < arrayMonto.length; i++) {
        for (let j = 1; j < arrayMonto[i].length; j++) {
            if (!resultadoFacturas[contador]) {
                resultadoFacturas[contador] = [];
            }
            resultadoFacturas[contador][0] = `"${arrayMonto[i][0]}"`; // Ya no necesitamos agregar mes y año
            resultadoFacturas[contador][1] = arrayMonto[i][j];
            contador++;
        }
    }
}

function presentarResultados(arrayResultado, sumaOriginal, sumador) {
    let resltadoFinal = "";
    let errorFactras = "";

    for (let i = 0; i < arrayResultado.length; i++) {
        resltadoFinal += `[${arrayResultado[i][0]}, ${arrayResultado[i][1]}],\n`;
        if (arrayResultado[i][1] > configuracion.montoMaximo) {
            errorFactras += `Factura ${i + 1} monto => ${arrayResultado[i][1]} Corresponde a la fecha => ${arrayResultado[i][0]}\n`;
        }
    }
    console.log("\n#####################\n");
    console.log(resltadoFinal);
    console.log("\n#####################\n");
    console.log("Inicio test");
    console.log("Suma original =", sumaOriginal);
    console.log("Suma final =", sumador);
    console.log("Facturas correctas =", arrayResultado.length);
    console.log("Facturas incorrectas =", arrayResultado.filter(item => item[1] > configuracion.montoMaximo).length);
    if (errorFactras != "") {
        console.log("\n\t¡¡¡Atención!!! Límite Superado!!\n", errorFactras);
    }
    console.log("Fin test");
}

function realizarPruebas(arrayResultado) {
    return arrayResultado.reduce((sum, factura) => sum + factura[1], 0);
}

generarSubFacturas(montoFactura);
console.log("Facturas generadas:", arrayFacturasGeneradas);
agregarFechas(arrayFacturasGeneradas);

let sumadorFinal = realizarPruebas(resultadoFacturas);
presentarResultados(resultadoFacturas, suma, sumadorFinal);