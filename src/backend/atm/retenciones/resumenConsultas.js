// retenciones/resumenConsultas.js
// Cuenta final de un cliente de Retenciones: qué bajó, qué faltó y qué FALLÓ.
// Separado del flujo para poder probarlo sin ATM.
//
// Dos maneras de que algo salga mal, y las dos tienen que verse:
//   - archivos faltantes: ATM informó registros y no entregó los 2 archivos (Excel + DIU).
//   - consultas fallidas: la consulta ni siquiera terminó (ej. se cerró el navegador).
//     Esas quedan con 0 registros, así que NO pueden confundirse con "no había nada".

/**
 * @param {Array} detalles  Un item por tipo+período: { tipo, periodo, registros, archivosDescargados, success, error }
 * @param {number} cantidadArchivos  Archivos que bajaron en total
 * @param {string} rangoTexto  Ej. "2026-08 a 2026-09 (2 periodos)"
 */
function resumirConsultas(detalles, cantidadArchivos, rangoTexto) {
    const totalRegistros = detalles.reduce((suma, d) => suma + (d.registros || 0), 0);
    const totalExitosas = detalles.filter(d => d.success && !d.error).length;

    // ATM entrega SIEMPRE 2 archivos por cada consulta que informó registros.
    const consultasConRegistros = detalles.filter(d => d.registros > 0);
    const archivosEsperados = consultasConRegistros.length * 2;
    const archivosFaltantes = Math.max(archivosEsperados - cantidadArchivos, 0);
    const incompletas = consultasConRegistros
        .filter(d => (d.archivosDescargados || 0) < 2)
        .map(d => `${d.tipo} ${d.periodo} (${d.archivosDescargados || 0} de 2)`);
    const consultasFallidas = detalles.filter(d => d.error).map(d => `${d.tipo} ${d.periodo}`);

    const problemas = [];
    if (archivosFaltantes > 0) {
        problemas.push(`Faltan ${archivosFaltantes} de ${archivosEsperados} archivo(s)${incompletas.length ? ': ' + incompletas.join('; ') : ''}`);
    }
    if (consultasFallidas.length > 0) {
        problemas.push(`${consultasFallidas.length} consulta(s) fallaron: ${consultasFallidas.join('; ')}`);
    }
    const descargaIncompleta = problemas.length > 0;

    let mensaje;
    if (descargaIncompleta) {
        mensaje = `Descarga INCOMPLETA (${cantidadArchivos} archivo(s) descargado(s)). ${problemas.join('. ')}.`;
    } else if (cantidadArchivos > 0) {
        mensaje = `Retenciones procesadas: ${totalExitosas} consulta(s) exitosa(s). ${cantidadArchivos} archivo(s) descargado(s).`;
    } else {
        mensaje = `Sin registros: ATM no informó retenciones en ningún sub-servicio (${rangoTexto}).`;
    }

    return {
        descargaIncompleta,
        mensaje,
        totalRegistros,
        archivosEsperados,
        archivosFaltantes,
        incompletas,
        consultasFallidas
    };
}

module.exports = { resumirConsultas };
