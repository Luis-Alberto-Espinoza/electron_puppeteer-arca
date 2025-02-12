export function enviarDatosFacturaAlBackend(data) {
    console.log("Datos a enviar al backend:", data);
    window.electronAPI.sendFormData(data);
}