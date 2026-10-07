// plantillasExcel/service/anomalias.js
// Detección de posibles errores de carga humana en ventas diarias. Lógica pura.
//
// Criterio acordado (calibrado con los Excel de Landes de agosto, donde había dos
// errores confirmados: 115.000 por 11.500 y 229.100 por 22.910):
//  - Ticket sospechoso: más de 10 veces la mediana de los tickets del MES (no del
//    día: la del día es inestable y marcaba ventas reales). Es lo que atrapa un
//    cero de más; en el total del día ese error es apenas un 5%.
//  - Día con total de más de 3 veces la mediana diaria: grave. Menos de un tercio:
//    aviso. Es una red para errores groseros (columna duplicada, monto gigante).
//  - Días de lunes a sábado sin ventas: informativo (feriado u olvido de carga).
// El programa NUNCA cambia un monto: marca y sugiere; corrige el humano.

const { DIAS_TEXTO, diaDeLaSemana, claveFecha, textoFecha } = require('./fechas.js');

const FACTOR_TICKET = 10;
const FACTOR_DIA_ALTO = 3;
const FACTOR_DIA_BAJO = 1 / 3;

function mediana(valores) {
    if (!valores.length) return null;
    const v = [...valores].sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function pesos(n) {
    return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
}

/**
 * Tickets que superan FACTOR_TICKET veces la mediana del mes.
 * @param {Array<{ monto: number, celda: string, fecha: object }>} tickets
 * @returns {Array<{ monto, celda, fecha, veces: number, sugerido: number|null }>}
 *   sugerido: el monto con un cero menos, si termina en 0 (el error típico).
 */
function ticketsSospechosos(tickets, factor = FACTOR_TICKET) {
    const med = mediana(tickets.map(t => t.monto).filter(m => m > 0));
    if (!med) return [];
    return tickets
        .filter(t => t.monto > factor * med)
        .map(t => ({
            ...t,
            veces: t.monto / med,
            sugerido: t.monto % 10 === 0 ? t.monto / 10 : null
        }));
}

/**
 * Días cuyo total se aleja mucho de la mediana diaria.
 * @param {Array<{ fecha: object, total: number }>} dias
 * @returns {Array<{ fecha, total, nivel: 'error'|'aviso', veces: number }>}
 */
function diasFueraDeRango(dias, alto = FACTOR_DIA_ALTO, bajo = FACTOR_DIA_BAJO) {
    const med = mediana(dias.map(d => d.total));
    if (!med || med <= 0) return [];
    const fuera = [];
    for (const d of dias) {
        const veces = d.total / med;
        if (veces > alto) fuera.push({ ...d, nivel: 'error', veces });
        else if (veces < bajo) fuera.push({ ...d, nivel: 'aviso', veces });
    }
    return fuera;
}

/**
 * Días de lunes a sábado del mes que no tienen ventas.
 * @param {number} anio
 * @param {number} mes  1-12
 * @param {Set<string>} conDatos  claves 'aaaa-mm-dd' (ver claveFecha)
 * @returns {object[]}  fechas { anio, mes, dia }
 */
function diasSinDatos(anio, mes, conDatos) {
    const faltan = [];
    const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    for (let dia = 1; dia <= ultimo; dia++) {
        const f = { anio, mes, dia };
        if (diaDeLaSemana(f) !== 0 && !conDatos.has(claveFecha(f))) faltan.push(f);
    }
    return faltan;
}

/**
 * Arma la lista de avisos de anomalías (el formato común de avisos de la plantilla).
 * @param {{ anio, mes, dias: Array<{fecha,total}>, tickets: Array<{monto,celda,fecha}> }} datos
 * @returns {Array<{ nivel: 'error'|'aviso'|'info', tipo: string, fecha?: object, celda?: string, mensaje: string }>}
 */
function detectarAnomalias({ anio, mes, dias, tickets }) {
    const avisos = [];
    const medTicket = mediana(tickets.map(t => t.monto).filter(m => m > 0));

    for (const t of ticketsSospechosos(tickets)) {
        avisos.push({
            nivel: 'error',
            tipo: 'ticket',
            fecha: t.fecha,
            celda: t.celda,
            mensaje: `Monto ${pesos(t.monto)} en ${t.celda}: es ${Math.round(t.veces)} veces el ticket típico `
                + `del mes (${pesos(medTicket)}).`
                + (t.sugerido !== null ? ` Posible cero de más: ${pesos(t.sugerido)}.` : '')
                + ' Si es un error, corregilo en el Excel y volvé a procesar.'
        });
    }

    const medDia = mediana(dias.map(d => d.total));
    for (const d of diasFueraDeRango(dias)) {
        avisos.push({
            nivel: d.nivel,
            tipo: 'dia',
            fecha: d.fecha,
            mensaje: d.nivel === 'error'
                ? `El total del día (${pesos(d.total)}) es ${d.veces.toFixed(1)} veces la mediana diaria (${pesos(medDia)}).`
                : `El total del día (${pesos(d.total)}) es menos de un tercio de la mediana diaria (${pesos(medDia)}).`
        });
    }

    const conDatos = new Set(dias.map(d => claveFecha(d.fecha)));
    for (const f of diasSinDatos(anio, mes, conDatos)) {
        avisos.push({
            nivel: 'info',
            tipo: 'sinDatos',
            fecha: f,
            mensaje: `${DIAS_TEXTO[diaDeLaSemana(f)]} ${textoFecha(f)} sin ventas (¿feriado o falta cargar?).`
        });
    }
    return avisos;
}

module.exports = {
    FACTOR_TICKET,
    FACTOR_DIA_ALTO,
    FACTOR_DIA_BAJO,
    mediana,
    ticketsSospechosos,
    diasFueraDeRango,
    diasSinDatos,
    detectarAnomalias
};
