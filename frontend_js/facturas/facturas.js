import { validarFormularioFacturaManual } from './validacionesFacturas.js';
import { enviarDatosFacturaAlBackend } from '../api.js'

export function realizarAccionFacturacion() {
    console.log("Se ha hecho clic en el botón de Facturas. Mostrando formulario.");
    // Aquí puedes agregar la lógica para inicializar el formulario de facturas,
    // precargar datos, etc., si es necesario.
}

export function procesarFormularioFactura(event, facturasForm, datosMasivos, datosValidados) {
    event.preventDefault();

    const formData = new FormData(facturasForm);
    const data = Object.fromEntries(formData.entries());
    let errores = [];

    if (data.metodoIngreso === 'masivo') {
        if (!datosValidados || datosMasivos.length === 0) {
            alert('Debe procesar los datos antes de enviarlos.');
            return;
        }
        if (!data.tipoContribuyente) errores.push("Debe seleccionar un tipo de contribuyente.");
        if (!data.Actividad) errores.push("Debe seleccionar un tipo de Actividad.");
        if (errores.length > 0) {
            alert(errores.join('\n'));
            return;
        }
        const datosMasivosParaEnviar = {
            tipo: 'masivo',
            tipoContribuyente: data.tipoContribuyente,
            Actividad: data.Actividad,
            datos: datosMasivos
        };
        enviarDatosFacturaAlBackend(datosMasivosParaEnviar);
        return;
    }

    errores = validarFormularioFacturaManual(data);

    if (errores.length > 0) {
        alert(errores.join('\n'));
        return;
    }

    let validador = false;
    const datosParaEnviar = { ...data };
    console.dir(data);
    if (datosParaEnviar.tipoMonto !== 'montoManual') delete datosParaEnviar.montoManual;
    // if (datosParaEnviar.tipoMonto !== 'montoManual' && radioSeleccionado.value === "habiles") console.log(datosParaEnviar +" soy el validador") //delete datosParaEnviar.montoManual;
    if (datosParaEnviar.periodoFacturacion === "habiles" 
        || datosParaEnviar.periodoFacturacion === "total" )delete datosParaEnviar.fechasFacturas;
    
    if (datosParaEnviar.tipoMonto !== 'montoTotal') delete datosParaEnviar.montoTotalInput;
  
    datosParaEnviar.servicio = 'factura'; // agrega el titulo del formulario 

    enviarDatosFacturaAlBackend(datosParaEnviar);
}