import { validarFecha, esNumeroValido } from '../utils.js';

export function validarDatosMasivos(datos) {
    const errores = [];
    datos.forEach(({ fecha, monto }, i) => {
        if (!validarFecha(fecha)) {
            errores.push(`La fecha en la línea ${i + 1} no tiene el formato válido (YYYY-MM-DD).`);
        }
        if (!esNumeroValido(monto)) {
            errores.push(`El monto en la línea ${i + 1} no es un número válido.`);
        }
    });
    return errores;
}

export function validarFormularioFacturaManual(data) {
    const errores = [];
    console.log("Validando formulario manual con datos:", data);
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