// comun/nombreArchivo.js
// REGLA ÚNICA para nombrar los archivos que genera la app (acordada 2026-10-23):
//
//   <CUIT>_<Servicio>_<detalle…>_<período o fecha>.<ext>
//
// - CUIT primero, sin guiones: fuera de la carpeta del cliente (mail, carpeta compartida) dice de quién
//   es y ordena por cliente; adentro de la carpeta (todos el mismo CUIT) igual agrupa por servicio.
//   El nombre del cliente NO va (ya está en la carpeta, y trae espacios/tildes).
// - Servicio en CamelCase (TasaCero, PlanPago, Retenciones, Constancia, Deuda, Apremios).
// - Detalle propio del servicio (estado, tipo, impuesto, boleto…), sin espacios ni tildes.
// - Fechas SIEMPRE con año: AAAA-MM (período) o AAAA-MM-DD (día). Nunca "nov".
// Se va aplicando a cada servicio cuando se lo toca; los archivos viejos quedan como están.

/** "Agentes de Retención y Percepción IIBB" → "AgentesDeRetencionYPercepcionIIBB" */
function aCamelCase(texto) {
    return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^A-Za-z0-9 ]/g, ' ').trim()
        .split(/\s+/).filter(Boolean)
        .map(p => p[0].toUpperCase() + p.slice(1)).join('');
}

/** "11/2025" o "2025-11" → "2025-11" (null si no se entiende) */
function periodoAAAAMM(periodo) {
    const texto = String(periodo || '').trim();
    let m = texto.match(/^(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[2]}-${m[1].padStart(2, '0')}`;
    m = texto.match(/^(\d{4})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    return null;
}

/** Date → "2026-10-23" (fecha local, no UTC). */
function fechaAAAAMMDD(fecha = new Date()) {
    const d = fecha;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param {Object} partes
 * @param {string} partes.servicio - ej. 'TasaCero'
 * @param {string|number} partes.cuit
 * @param {string[]} [partes.detalle] - ej. ['Aceptado'] (se pasan a CamelCase)
 * @param {string} [partes.fecha] - 'AAAA-MM' o 'AAAA-MM-DD' (por defecto, hoy)
 * @param {string} [partes.extension] - 'pdf', 'xlsx'… (sin extensión si no se pasa)
 */
function nombreArchivo({ servicio, cuit, detalle = [], fecha, extension }) {
    if (!servicio || !cuit) throw new Error('nombreArchivo: faltan servicio o CUIT');
    const partes = [String(cuit).replace(/\D/g, ''), aCamelCase(servicio), ...detalle.map(aCamelCase).filter(Boolean), fecha || fechaAAAAMMDD()];
    return partes.join('_') + (extension ? `.${extension.replace(/^\./, '')}` : '');
}

module.exports = { nombreArchivo, periodoAAAAMM, fechaAAAAMMDD, aCamelCase };
