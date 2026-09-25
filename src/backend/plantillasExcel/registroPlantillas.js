// plantillasExcel/registroPlantillas.js
// Registro de plantillas disponibles. Cada plantilla es un MÓDULO en código (no
// configuración) con: { id, nombre, descripcion, color?, icono?, reconocer(libro), transformar(libro) }.
//
// Para sumar una plantilla nueva: crear su módulo en ./plantillas/ y agregarlo acá.
// El frontend arma un botón por cada una (en este orden).

const PLANTILLAS = [
    require('./plantillas/resumenConceptosFacturados.js')
];

// Si una plantilla no define su identidad visual, se usa esta.
const COLOR_POR_DEFECTO = '#6b7280';
const ICONO_POR_DEFECTO = '📄';

/** Datos de una plantilla para el frontend (sin funciones). */
function fichaPlantilla(p) {
    return {
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion,
        color: p.color || COLOR_POR_DEFECTO,
        icono: p.icono || ICONO_POR_DEFECTO
    };
}

/** Lista para el frontend (sin funciones). */
function listarPlantillas() {
    return PLANTILLAS.map(fichaPlantilla);
}

/** Devuelve el módulo de la plantilla o null. */
function obtenerPlantilla(id) {
    return PLANTILLAS.find(p => p.id === id) || null;
}

/** Los módulos completos, en orden (para el orquestador). */
function todasLasPlantillas() {
    return PLANTILLAS;
}

module.exports = { listarPlantillas, obtenerPlantilla, todasLasPlantillas, fichaPlantilla };
