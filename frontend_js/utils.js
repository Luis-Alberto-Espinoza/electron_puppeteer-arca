export function validarFecha(fecha) {
    return /^\d{2}\/\d{2}\/\d{4}$/.test(fecha); 
}

export function esNumeroValido(valor) {
    return !isNaN(parseFloat(valor));
}