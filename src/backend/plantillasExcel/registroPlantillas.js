// plantillasExcel/registroPlantillas.js
// Registro de plantillas disponibles. Cada plantilla es un MÓDULO en código (no
// configuración) con: { id, nombre, descripcion, reconocer(libro), transformar(libro) }.
//
// Para sumar una plantilla nueva: crear su módulo en ./plantillas/ y agregarlo acá.
// El frontend arma un botón por cada una (en este orden).

const PLANTILLAS = [
    require('./plantillas/resumenConceptosFacturados.js')
];

/** Lista para el frontend (sin funciones). */
function listarPlantillas() {
    return PLANTILLAS.map(({ id, nombre, descripcion }) => ({ id, nombre, descripcion }));
}

/** Devuelve el módulo de la plantilla o null. */
function obtenerPlantilla(id) {
    return PLANTILLAS.find(p => p.id === id) || null;
}

module.exports = { listarPlantillas, obtenerPlantilla };
