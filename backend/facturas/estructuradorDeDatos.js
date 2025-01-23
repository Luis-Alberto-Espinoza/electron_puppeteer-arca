
function procesarDatos(montoFactura) {

    const configuracion = {
        montoMaximo: 344000,
    };

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
                resultadoFacturas[contador][0] = `${arrayMonto[i][0]}`; 
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
        if (errorFactras != "") {
        }
    }

    function realizarPruebas(arrayResultado) {
        return arrayResultado.reduce((sum, factura) => sum + factura[1], 0);
    }
    generarSubFacturas(montoFactura);
    agregarFechas(arrayFacturasGeneradas);

    let sumadorFinal = realizarPruebas(resultadoFacturas);
    presentarResultados(resultadoFacturas, suma, sumadorFinal);

return resultadoFacturas;
}

module.exports = {
    procesarDatos
};