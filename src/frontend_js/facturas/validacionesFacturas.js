export function validarDatosMasivos(datos) {
    const errores = [];
    datos.forEach(({ fecha, monto }, i) => {
        // Validar formato de fecha DD/MM/YYYY
        const regexFecha = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!regexFecha.test(fecha)) {
            errores.push(`La fecha en la línea ${i + 1} no tiene el formato válido (DD/MM/YYYY).`);
        }
        // Validar que monto sea número válido
        if (isNaN(parseFloat(monto)) || !isFinite(monto)) {
            errores.push(`El monto en la línea ${i + 1} no es un número válido.`);
        }
    });
    return errores;
}

export function validarFormularioFacturaManual(data) {
    const errores = [];
    //if (!data.tipoContribuyente) errores.push("Debe seleccionar un tipo de contribuyente.");
    if (!data.Actividad) errores.push("Debe seleccionar un tipo de Actividad.");
    if (!data.mes) errores.push("Debe seleccionar un mes.");
    if (!data.anio) errores.push("Debe seleccionar un año.");

    // Validación CONDICIONAL para fechas y montos (MODIFICADO)
    if (data.periodoFacturacion === 'manual') {
        if (!data.fechasFacturas) {
            errores.push("Debe ingresar las fechas de facturación.");
        }

        if (!data.tipoMonto) { 
            errores.push("Debe seleccionar un tipo de monto.");
        } else if (data.tipoMonto === 'montoTotal' && !data.montoTotalInput) {
            errores.push("Debe ingresar un monto total.");
        } else if (data.tipoMonto === 'montoManual' && !data.montoManual) {
            errores.push("Debe ingresar montos manuales.");
        }
    } else { // Para "total" y "habiles"
        // Validación OBLIGATORIA del monto para "total" y "habiles"
        if (!data.tipoMonto) {
            errores.push("Debe seleccionar un tipo de monto.");
        } else if (data.tipoMonto === 'montoTotal' && !data.montoTotalInput) {
            errores.push("Debe ingresar un monto total.");
        } else if (data.tipoMonto === 'montoManual' && !data.montoManual) {
            errores.push("Debe ingresar montos manuales.");
        }
    }

    return errores;
}