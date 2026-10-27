// afip/planesDePago/estadoPlan.js
// Situación de un plan según la lista de AFIP ("Vigente", "Plan Caduco",
// "Plan Cancelado", ...). SIN lista cerrada de estados: lo que no es "Vigente"
// es "no vigente", diga lo que diga AFIP. Así una bandera nueva no se pierde.
// De la situación salen la subcarpeta (Vigentes / No_Vigentes) y el tag del
// nombre de archivo (CADUCO), para que vigentes y no vigentes no se mezclen.
// También el rango por fecha de presentación, que filtra solo a los no vigentes.

const path = require('path');
const fs = require('fs');
const { getDownloadPathContribuyente } = require('../../cliente/carpetaContribuyente.js');

const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function esVigente(plan) {
    return sinAcentos(plan && plan.estado).trim().toLowerCase() === 'vigente';
}

// "Plan Caduco" → "Caduco"; "Vigente" → "Vigente"; vacío → "SinEstado"
function etiquetaEstado(plan) {
    const palabras = sinAcentos(plan && plan.estado)
        .replace(/^\s*plan\s+/i, '')
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean);
    if (palabras.length === 0) return 'SinEstado';
    return palabras.map(p => p[0].toUpperCase() + p.slice(1).toLowerCase()).join('');
}

// Tag para el nombre del archivo: "CADUCO", "VIGENTE", ...
function tagArchivo(plan) {
    return etiquetaEstado(plan).toUpperCase();
}

// Fecha para el NOMBRE de los archivos del plan: la de presentación del plan
// ("22/08/2025" → "2025-08-22"), no la de descarga. Así se ve de qué plan es
// sin abrirlo y se ordena bien. Re-descargar el mismo plan pisa el archivo:
// queda la última foto. Fecha ilegible → "SinFecha".
function fechaArchivo(plan) {
    const m = String((plan && plan.presentacion) || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : 'SinFecha';
}

// Nombre de los archivos de un plan, con la regla común (comun/nombreArchivo.js):
//   <CUIT>_PlanPago_<N° plan>[_<sección>]_<SITUACIÓN>_<fecha de presentación>.<ext>
// El PDF propio y el oficial de AFIP de una sección dan el mismo nombre: uno reemplaza al otro.
function nombreArchivoPlan(cuit, plan, { numero, seccion, extension }) {
    const partes = [
        String(cuit).replace(/\D/g, ''), 'PlanPago', numero || (plan && plan.numero) || 'SinNumero',
        seccion, tagArchivo(plan), fechaArchivo(plan)
    ].filter(Boolean);
    return `${partes.join('_')}.${extension}`;
}

// <cliente>/archivos_afip/Planes_de_Pago/ : todo lo del servicio (resumen incluido)
async function carpetaPlanesDePago(downloadsPath, cuit) {
    const base = await getDownloadPathContribuyente(downloadsPath, cuit, '', 'archivos_afip');
    const dir = path.join(base, 'Planes_de_Pago');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// Planes_de_Pago/Vigentes/ o Planes_de_Pago/No_Vigentes/ (la crea si no existe).
// La situación exacta (CADUCO, CANCELADO...) queda en el nombre del archivo.
async function carpetaPlan(downloadsPath, cuit, plan) {
    const base = await carpetaPlanesDePago(downloadsPath, cuit);
    const dir = path.join(base, esVigente(plan) ? 'Vigentes' : 'No_Vigentes');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// ─── Rango de presentación (solo para no vigentes) ───
// El rango llega del <input type="month"> como { desde: 'AAAA-MM', hasta: 'AAAA-MM' };
// cualquiera de los dos puede faltar (= sin límite). Se compara por mes:
// "hasta 06/2025" incluye todo junio.

const aMes = (aaaaMm) => {
    const m = String(aaaaMm || '').match(/^(\d{4})-(\d{2})$/);
    return m ? Number(m[1]) * 12 + Number(m[2]) : null;
};

/**
 * ¿La fecha de presentación ("dd/mm/aaaa") cae dentro del rango?
 * Sin rango → true. Fecha rota o vacía → null (el que llama decide; se incluye).
 */
function dentroDelRango(presentacion, rango) {
    const desde = aMes(rango && rango.desde);
    const hasta = aMes(rango && rango.hasta);
    if (desde === null && hasta === null) return true;
    const m = String(presentacion || '').trim().match(/^\d{2}\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const mes = Number(m[2]) * 12 + Number(m[1]);
    return (desde === null || mes >= desde) && (hasta === null || mes <= hasta);
}

// "03/2024 – 06/2025" | "desde 03/2024" | "hasta 06/2025" | null (sin rango)
function describirRango(rango) {
    const fmt = (v) => { const m = String(v || '').match(/^(\d{4})-(\d{2})$/); return m ? `${m[2]}/${m[1]}` : null; };
    const d = fmt(rango && rango.desde);
    const h = fmt(rango && rango.hasta);
    if (d && h) return `${d} – ${h}`;
    if (d) return `desde ${d}`;
    if (h) return `hasta ${h}`;
    return null;
}

module.exports = { esVigente, etiquetaEstado, tagArchivo, fechaArchivo, nombreArchivoPlan, carpetaPlanesDePago, carpetaPlan, dentroDelRango, describirRango };
