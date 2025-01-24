const { validarDatosFacturaBackend, validarDatos } = require('./validacionesFacturaBackend');
const { procesarDatos } = require('./estructuradorDeDatos');
const { getDiasHabiles, getDiasXmes, limpiarMontos,
    convertirStringAArrayDeFechasString, generarMontosAleatorios, combinarFechasMontosConMap } = require('../utils');

function procesarDatosFactura(data) {
    let facturas = {};
    let montoFechas = [];
    
    facturas.tipoActividad = data.Actividad;
    facturas.tipoContribuyente = data.tipoContribuyente;
    
    let respuesta = {} ;
    if (data.metodoIngreso === "manual") {
        facturas.periodoFacturacion = data.periodoFacturacion;

        facturas.mes = data.mes;
        facturas.anio = data.anio;

        if (data.periodoFacturacion === "habiles") {
            facturas.fechas = (getDiasHabiles(data.mes, data.anio));
        }
        if (data.periodoFacturacion === "total") {
            facturas.fechas = (getDiasXmes(data.mes, data.anio));
        }
        if (data.periodoFacturacion === "manual") {
            facturas.fechas = convertirStringAArrayDeFechasString(data.fechasFacturas);
        }
        /*
        console.log("Fechas obtenidas:", facturas.fechas);
        console.log("Tipo de dato de facturas.fechas:", typeof facturas.fechas);
        console.log("Es un array?:", Array.isArray(facturas.fechas));
        */

        //if ("montoManual") || montoTotalInput)
        if (data.tipoMonto === "montoManual") {
            facturas.monto = limpiarMontos(data.monto)
        }

        if (data.tipoMonto === "montoTotal") {
            facturas.monto = limpiarMontos(data.monto);
            const montosGenerados = generarMontosAleatorios(facturas.monto.montos[0], facturas.fechas);
            if (montosGenerados.error) {
                console.error("Error al generar montos", montosGenerados.error)
                return
            }
            facturas.arrayResultante = combinarFechasMontosConMap(facturas.fechas, montosGenerados.montos);
        }
        respuesta = procesarDatos(facturas.arrayResultante);
        let ojeto = Object.entries(respuesta);
        let conkeys = Object.keys(respuesta);

        // console.log("conkeys " + conkeys);

        // conkeys tiene: facturasGeneradas,resultadoFinal,sumaOriginal,sumador,facturasCorrectas,facturasIncorrectas,resultadoFacturas

        //console.log("ojeto "+ ojeto );
        facturas.arrayResultante = respuesta.resultadoFacturas;
        //console.log("\n\n elementos inicio \n")
        // facturas.arrayResultante.forEach(element => {
        //  //   console.log(element)
        // });
        //console.log("\n elementos fin\n\n")
    }
    /**
     * 
            facturas.arrayResultante = procesarDatos(facturas.arrayResultante);
            facturas.arrayResultante.forEach(element => {
                console.log(element)
            });
    
     */

    if (data.metodoIngreso === "masivo") {
        data.datos.forEach(element => {
            montoFechas.push([element.fecha, element.monto]);
        });

        respuesta = procesarDatos(montoFechas);
        let conkeys = Object.keys(respuesta);
      //  console.log("conkeys " + conkeys);
        facturas.arrayResultante = respuesta.resultadoFacturas;
    }
    //console.log("\n\ninicio\n", facturas, "\nfin\n\n")
    facturas.montoResultados = respuesta;
    return facturas;
}


module.exports = {
    procesarDatosFactura
};