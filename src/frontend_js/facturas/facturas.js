import { validarFormularioFacturaManual } from './validacionesFacturas.js';

export function realizarAccionFacturacion() {
    console.log("Se ha hecho clic en el botón de Facturas. Mostrando formulario.");
}

export function procesarFormularioFactura(event, facturasForm, datosMasivos, datosValidados) {
    event.preventDefault();
    console.log("Procesando formulario de facturas...");
    // mostrar todo lo que viene por parametro 
    console.log("Datos del formulario:", facturasForm);
    console.log("Datos masivos:", datosMasivos);
    console.log("Datos validados:", datosValidados);

    const formData = new FormData(facturasForm);
    const data = Object.fromEntries(formData.entries());
    let errores = [];

    // Obtener usuario seleccionado del selector global
    const usuarioSeleccionado = window.usuarioSeleccionado || null;
    console.log("Usuario seleccionado:", usuarioSeleccionado);

    //con saltos de linea para separar mostrar el contenido de data
    console.log("\n\tDatos del formulario procesados:", data);

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
    console.log("Datos para enviar:", datosParaEnviar);
    if (datosParaEnviar.tipoMonto !== 'montoManual')
        datosParaEnviar.monto = datosParaEnviar.montoTotalInput;
    if (datosParaEnviar.periodoFacturacion === "habiles"
        || datosParaEnviar.periodoFacturacion === "total")
        delete datosParaEnviar.fechasFacturas;
    if (datosParaEnviar.tipoMonto !== 'montoTotal')
        datosParaEnviar.monto = datosParaEnviar.montoManual;
    datosParaEnviar.usuario = usuarioSeleccionado; // <-- Agrega el usuario seleccionado

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
