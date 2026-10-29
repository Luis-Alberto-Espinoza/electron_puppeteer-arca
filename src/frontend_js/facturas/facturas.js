import { validarFormularioFacturaManual } from './validacionesFacturas.js';

// Aviso con el modal de la app (con el tono del servicio), en lugar del alert() nativo.
export function avisar(mensaje, titulo = 'Revisá el formulario') {
    return showConfirmModal({ title: titulo, icon: '⚠️', message: mensaje, confirmText: 'Entendido', confirmBtnClass: 'tono', soloAceptar: true });
}

// Arma los datos para factura:calcular; null si el formulario tiene errores (ya avisó).
export function procesarFormularioFactura(event, facturasForm, datosMasivos, datosValidados) {
    event.preventDefault();
    console.log("Procesando formulario de factura...");

    console.log("Datos masivos:", datosMasivos);
    console.log("Datos validados:", datosValidados);

    // Obtiene los datos del formulario
    const formData = new FormData(facturasForm);
    const data = Object.fromEntries(formData.entries());
    let errores = [];
    const usuarioSeleccionado = window.usuarioSeleccionado || null;
    const empresaElegida = window.empresaElegida || null;
    // El select de PDV se llena al cambiar la empresa (configurarEmpresasDisponibles).
    // formData ya lo trae bajo el name="puntoDeVenta" del <select>.
    const puntoVenta = (data.puntoDeVenta || '').trim() || null;
    // El backend guarda en el cliente el tipo elegido; se refleja acá también
    // (mismo objeto que cachea el selector) para que la próxima vez venga elegido.
    if (usuarioSeleccionado && data.tipoContribuyenteElegido) {
        usuarioSeleccionado.tipoContribuyente = data.tipoContribuyenteElegido;
    }
    if (data.metodoIngreso === 'masivo') {
        if (!datosValidados || datosMasivos.length === 0) {
            avisar('Debe procesar los datos antes de enviarlos.');
            return null;
        }
        if (!data.tipoContribuyenteElegido) errores.push("Debe seleccionar un tipo de contribuyente.");
        if (!data.Actividad) errores.push("Debe seleccionar un tipo de Actividad.");
        if (errores.length > 0) {
            avisar(errores.join('\n'));
            return null;
        }
        const datosMasivosParaEnviar = {
            servicio: 'factura', // agrega el titulo del formulario
            metodoIngreso: 'masivo',
            tipoContribuyente: usuarioSeleccionado.tipoContribuyente,
            tipoContribuyenteElegido: data.tipoContribuyenteElegido,
            Actividad: data.Actividad,
            fechaComprobante: data.fechaComprobante,
            datos: datosMasivos,
            usuario: usuarioSeleccionado,
            empresaElegida,
            puntoVenta
        };
        console.log("Datos masivos para enviar:", datosMasivosParaEnviar);
        return datosMasivosParaEnviar;
    }

    errores = validarFormularioFacturaManual(data);

    if (errores.length > 0) {
        avisar(errores.join('\n'));
        return null;
    }

    let validador = false;
    const datosParaEnviar = { ...data };
    datosParaEnviar.monto = datosParaEnviar.montoTotalInput;
    if (datosParaEnviar.periodoFacturacion === "habiles"
        || datosParaEnviar.periodoFacturacion === "total")
        delete datosParaEnviar.fechasFacturas;
    datosParaEnviar.usuario = usuarioSeleccionado;
    datosParaEnviar.empresaElegida = empresaElegida;
    datosParaEnviar.puntoVenta = puntoVenta;

    delete datosParaEnviar.montoTotalInput;

    datosParaEnviar.servicio = 'factura';
    console.log("Datos finales para enviar:", datosParaEnviar);
    return datosParaEnviar;
}
