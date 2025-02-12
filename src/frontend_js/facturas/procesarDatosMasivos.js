import { validarDatosMasivos } from './validacionesFacturas.js';

export function procesarDatosTextareas(textareaFechas, textareaMontos) {
    if (!textareaFechas || !textareaMontos) {
        return { errores: ["Faltan elementos del DOM"], datos: [] };
    }

    const fechas = textareaFechas.value.split('\n').map(linea => linea.trim()).filter(linea => linea !== '');
    const montos = textareaMontos.value.split('\n').map(linea => linea.trim()).filter(linea => linea !== '');

    if (fechas.length !== montos.length) {
        return { errores: ['El número de fechas no coincide con el número de montos.'], datos: [] };
    }

    const datos = fechas.map((fecha, index) => {
        const [day, month, year] = fecha.split('/').map(Number); 
        const fechaDate = new Date(year, month - 1, day);
        return { fecha, monto: montos[index], fechaDate }; 
    });
    const errores = validarDatosMasivos(datos);
    if (errores.length > 0) {
        return { errores, datos: [] };
    }

    return { errores: [], datos: datos.map(item => ({...item, monto: parseFloat(item.monto)})) };
}