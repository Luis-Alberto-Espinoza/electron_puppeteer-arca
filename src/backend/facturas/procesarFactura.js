// src/backend/facturas/procesarFactura.js

const { procesarDatos } = require('./estructuradorDeDatos');
const { getDiasHabiles, getDiasXmes, limpiarMontos, convertirStringAArrayDeFechasString, generarMontosAleatorios, combinarFechasMontosConMap } = require('../utils');


function procesarDatosFactura(data) {
    // Inicializamos con las propiedades base que siempre necesitamos
    let facturas = {
        tipoActividad: data.Actividad,
        tipoContribuyente: data.tipoContribuyente
    };

    let montoFechas = [];
    let respuesta = {};

    if (data.metodoIngreso === "manual") {
        // Obtener las fechas según el tipo de periodo
        let fechas;
        switch (data.periodoFacturacion) {
            case "habiles":
                fechas = getDiasHabiles(data.mes, data.anio);
                break;
            case "total":
                fechas = getDiasXmes(data.mes, data.anio);
                break;
            case "manual":
                fechas = convertirStringAArrayDeFechasString(data.fechasFacturas);
                break;
        }

        // Procesar los montos
        if (data.tipoMonto === "montoManual") {
            const monto = limpiarMontos(data.monto);
            respuesta = procesarDatos(monto);
        } else if (data.tipoMonto === "montoTotal") {
            const monto = limpiarMontos(data.monto);
            const montosGenerados = generarMontosAleatorios(monto.montos[0], fechas);

            if (montosGenerados.error) {
                console.error("Error al generar montos", montosGenerados.error);
                return;
            }

            const arrayResultante = combinarFechasMontosConMap(fechas, montosGenerados.montos);
            respuesta = procesarDatos(arrayResultante);
        }

        // Añadir propiedades específicas del método manual
        Object.assign(facturas, {
            periodoFacturacion: data.periodoFacturacion,
            mes: data.mes,
            anio: data.anio
        });

    } else if (data.metodoIngreso === "masivo") {
        montoFechas = data.datos.map(element => [element.fecha, element.monto]);
        respuesta = procesarDatos(montoFechas);
    }

    // Filtrar solo las propiedades que necesitamos de la respuesta
    const { resultadoFinal, resultadoFacturas, ...restoPropiedades } = respuesta;

    // Añadir los resultados procesados
    facturas.montoResultados = restoPropiedades;

    return facturas;
}


module.exports = {
    procesarDatosFactura
};