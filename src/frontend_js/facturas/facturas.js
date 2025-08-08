import { validarFormularioFacturaManual } from './validacionesFacturas.js';

export function procesarFormularioFactura(event, facturasForm, datosMasivos, datosValidados) {
    event.preventDefault();
console.log ("Procesando formulario de factura...");
  
    console.log("Datos masivos:", datosMasivos);
    console.log("Datos validados:", datosValidados);

    // Obtiene los datos del formulario
    const formData = new FormData(facturasForm);
    const data = Object.fromEntries(formData.entries());
    let errores = [];
    const usuarioSeleccionado = window.usuarioSeleccionado || null;

    if (data.metodoIngreso === 'masivo') {
        if (!datosValidados || datosMasivos.length === 0) {
            alert('Debe procesar los datos antes de enviarlos.');
            return;
        }
        //if (!data.tipoContribuyente) errores.push("Debe seleccionar un tipo de contribuyente.");
        if (!data.Actividad) errores.push("Debe seleccionar un tipo de Actividad.");
        if (errores.length > 0) {
            alert(errores.join('\n'));
            return;
        }
        const datosMasivosParaEnviar = {
            servicio: 'factura', // agrega el titulo del formulario 
            metodoIngreso: 'masivo',
            tipoContribuyente: usuarioSeleccionado.tipoContribuyente,
            Actividad: data.Actividad,
            fechaComprobante: data.fechaComprobante,
            datos: datosMasivos,
            usuario: usuarioSeleccionado // <-- Agrega el usuario seleccionado
        };
        console.log("Datos masivos para enviar:", datosMasivosParaEnviar);
        window.electronAPI.sendFormData(datosMasivosParaEnviar);
        return;
    }

    errores = validarFormularioFacturaManual(data);

    if (errores.length > 0) {
        alert(errores.join('\n'));
        return;
    }

    let validador = false;
    const datosParaEnviar = { ...data };
    if (datosParaEnviar.tipoMonto !== 'montoManual')
        datosParaEnviar.monto = datosParaEnviar.montoTotalInput;
    if (datosParaEnviar.periodoFacturacion === "habiles"
        || datosParaEnviar.periodoFacturacion === "total")
        delete datosParaEnviar.fechasFacturas;
    if (datosParaEnviar.tipoMonto !== 'montoTotal')
        datosParaEnviar.monto = datosParaEnviar.montoManual;
    datosParaEnviar.usuario = usuarioSeleccionado; 

    delete datosParaEnviar.montoManual;
    delete datosParaEnviar.montoTotalInput;

    datosParaEnviar.servicio = 'factura';
    console.log("Datos finales para enviar:", datosParaEnviar);
    window.electronAPI.sendFormData(datosParaEnviar);
}


//crear una funcion mercadoPagoFacturas

export function mercadoPagoFacturas(datosMasivosParaEnviar) {
    window.electronAPI.sendFormData(datosMasivosParaEnviar);
}
