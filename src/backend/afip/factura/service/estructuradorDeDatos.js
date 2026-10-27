
// "27/10/2026" o "2026-10-27" → 20261027 (para comparar); otra cosa → null.
function claveFecha(fecha) {
    const t = String(fecha || '').trim();
    let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
    m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
    return null;
}

// AFIP no deja emitir un comprobante con fecha anterior al último del mismo PDV:
// las facturas salen de la más vieja a la más nueva, se hayan elegido en el orden
// que sea (el calendario las manda en el orden de los clics). Si alguna fecha no se
// entiende, se deja el orden como vino (mejor eso que mover facturas a ciegas).
function ordenarPorFecha(pares) {
    if (!Array.isArray(pares) || !pares.every(Array.isArray)) return pares;
    const claves = pares.map(par => claveFecha(par[0]));
    if (claves.some(c => c === null)) {
        console.warn('[Facturas] Hay fechas que no se entienden: se factura en el orden en que vinieron.');
        return pares;
    }
    return pares
        .map((par, i) => ({ par, clave: claves[i] }))
        .sort((a, b) => a.clave - b.clave)   // estable: mismo día, mismo orden
        .map(x => x.par);
}

function procesarDatos(montoFactura) {
    let ProcesarDatos = {};
    montoFactura = ordenarPorFecha(montoFactura);
    const configuracion = {
        montoMaximo: 10000000,
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
        let resultadoFinal = "";
        let errorFactras = "";

        for (let i = 0; i < arrayResultado.length; i++) {
            resultadoFinal += `[${arrayResultado[i][0]}, ${arrayResultado[i][1]}],\n`;
            if (arrayResultado[i][1] > configuracion.montoMaximo) {
                errorFactras += `Factura ${i + 1} monto => ${arrayResultado[i][1]} Corresponde a la fecha => ${arrayResultado[i][0]}\n`;
            }
        }
        ProcesarDatos.resultadoFinal = resultadoFinal;
        ProcesarDatos.sumaOriginal = sumaOriginal; //"Suma original =";
        ProcesarDatos.sumador = sumador; //"Suma final =";
        ProcesarDatos.facturasCorrectas = arrayResultado.length; //"Facturas correctas =";
        ProcesarDatos.facturasIncorrectas = arrayResultado.filter(item => item[1] > configuracion.montoMaximo).length; //"Facturas incorrectas =";
        if (errorFactras != "") {
            ProcesarDatos.errorFactraslímiteSuperado = errorFactras;
        }

    }

    function realizarPruebas(arrayResultado) {
        return arrayResultado.reduce((sum, factura) => sum + factura[1], 0);
    }
    generarSubFacturas(montoFactura);
    ProcesarDatos.facturasGeneradas = arrayFacturasGeneradas;

    agregarFechas(arrayFacturasGeneradas);

    let sumadorFinal = realizarPruebas(resultadoFacturas);
    presentarResultados(resultadoFacturas, suma, sumadorFinal);
    ProcesarDatos.resultadoFacturas = resultadoFacturas
    return ProcesarDatos;
}

module.exports = {
    procesarDatos
};