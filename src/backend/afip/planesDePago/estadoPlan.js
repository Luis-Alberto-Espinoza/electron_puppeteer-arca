// afip/planesDePago/estadoPlan.js
// Situación de un plan según la lista de AFIP ("Vigente", "Plan Caduco",
// "Plan Cancelado", ...). SIN lista cerrada de estados: lo que no es "Vigente"
// es "no vigente", diga lo que diga AFIP. Así una bandera nueva no se pierde.
// De la situación salen la subcarpeta (Planes_Caduco) y el tag del nombre de
// archivo (CADUCO), para que vigentes y no vigentes no se mezclen.

const path = require('path');
const fs = require('fs');
const { getDownloadPathContribuyente } = require('../../cliente/carpetaContribuyente.js');

const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

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

// <cliente>/archivos_afip/Planes_<Estado>/ (la crea si no existe)
async function carpetaPlan(downloadsPath, cuit, plan) {
    const base = await getDownloadPathContribuyente(downloadsPath, cuit, '', 'archivos_afip');
    const dir = path.join(base, `Planes_${etiquetaEstado(plan)}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

module.exports = { esVigente, etiquetaEstado, tagArchivo, carpetaPlan };
