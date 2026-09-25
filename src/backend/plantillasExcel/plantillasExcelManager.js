// plantillasExcel/plantillasExcelManager.js
// Orquestador del servicio: detecta qué plantilla corresponde a un archivo
// (detectarPlantilla) y procesa un archivo con una plantilla (procesarArchivo):
// valida la extensión, abre el Excel, reconoce, transforma y escribe un archivo
// NUEVO al lado del original.
//
// Reglas (ver docs/herramientas_archivos/plantillas_excel.md):
//  - El original nunca se modifica: se lee, se le agregan hojas EN MEMORIA y se
//    guarda con otro nombre.
//  - Si un control no da 0, no se escribe nada.
//  - Si el nombre de salida ya existe, se agrega " (2)", " (3)"...; nunca se pisa.
//  - Solo .xlsx (exceljs no abre .xls).

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { obtenerPlantilla, todasLasPlantillas, fichaPlantilla } = require('./registroPlantillas.js');

// Caracteres que Windows no admite en un nombre de archivo.
function limpiarParaArchivo(texto) {
    return String(texto).replace(/[\\/:*?"<>|]/g, '-');
}

/**
 * Arma "<carpeta>/<nombre original> - <sufijo>.xlsx" sin pisar nada existente.
 * @param {string} rutaOriginal
 * @param {string} sufijo  ej. "Resumen 2026-08"
 */
function rutaSalidaLibre(rutaOriginal, sufijo) {
    const dir = path.dirname(rutaOriginal);
    const base = path.basename(rutaOriginal, path.extname(rutaOriginal));
    const raiz = `${base} - ${limpiarParaArchivo(sufijo)}`;
    let candidata = path.join(dir, `${raiz}.xlsx`);
    for (let n = 2; fs.existsSync(candidata); n++) {
        candidata = path.join(dir, `${raiz} (${n}).xlsx`);
    }
    return candidata;
}

/**
 * Valida la extensión y abre el Excel en memoria. Lo usan el orquestador y el
 * procesamiento, así las dos puertas dan los mismos mensajes.
 * Nunca lanza.
 *
 * @param {string} rutaArchivo
 * @returns {Promise<{ success: true, libro: import('exceljs').Workbook }
 *                 | { success: false, mensaje: string }>}
 */
async function abrirLibro(rutaArchivo) {
    if (!rutaArchivo) return { success: false, mensaje: 'No se eligió ningún archivo.' };

    const ext = path.extname(rutaArchivo).toLowerCase();
    if (ext === '.xls') {
        return {
            success: false,
            mensaje: 'El archivo es .xls (formato viejo de Excel) y no se puede leer. '
                + 'Abrilo en Excel y usá "Guardar como" → "Libro de Excel (.xlsx)", y después elegí ese.'
        };
    }
    if (ext !== '.xlsx') {
        return { success: false, mensaje: `Solo se admiten archivos .xlsx (llegó "${ext || 'sin extensión'}").` };
    }
    if (!fs.existsSync(rutaArchivo)) {
        return { success: false, mensaje: `No se encontró el archivo: ${rutaArchivo}` };
    }

    const libro = new ExcelJS.Workbook();
    try {
        await libro.xlsx.readFile(rutaArchivo);
    } catch (e) {
        return {
            success: false,
            mensaje: `No se pudo abrir el Excel (¿está dañado o protegido con contraseña?). Detalle: ${e.message}`
        };
    }
    return { success: true, libro };
}

/**
 * Procesa un archivo con una plantilla.
 * Nunca lanza: siempre devuelve { success, ... } con un mensaje para mostrar.
 *
 * @param {string} idPlantilla
 * @param {string} rutaArchivo
 * @returns {Promise<{ success: boolean, mensaje: string, archivoGenerado?: string,
 *   hojas?: string[], meses?: string[], controles?: object[], faltantes?: string[] }>}
 */
async function procesarArchivo(idPlantilla, rutaArchivo) {
    const plantilla = obtenerPlantilla(idPlantilla);
    if (!plantilla) return { success: false, mensaje: `No existe la plantilla "${idPlantilla}".` };
    const abierto = await abrirLibro(rutaArchivo);
    if (!abierto.success) return abierto;
    const { libro } = abierto;

    let resultado;
    try {
        resultado = plantilla.transformar(libro);
    } catch (e) {
        console.error(`[plantillasExcel:${idPlantilla}] error inesperado:`, e);
        return { success: false, mensaje: `Error inesperado al transformar: ${e.message}` };
    }
    if (!resultado.ok) {
        return {
            success: false,
            mensaje: resultado.mensaje,
            faltantes: resultado.faltantes,
            controles: resultado.controles
        };
    }

    const archivoGenerado = rutaSalidaLibre(rutaArchivo, resultado.sufijoNombre);
    try {
        await libro.xlsx.writeFile(archivoGenerado);
    } catch (e) {
        return { success: false, mensaje: `No se pudo guardar el archivo nuevo (${archivoGenerado}): ${e.message}` };
    }

    return {
        success: true,
        mensaje: resultado.mensaje,
        archivoGenerado,
        hojas: resultado.hojas,
        meses: resultado.meses,
        controles: resultado.controles
    };
}

/**
 * Orquestador: le pregunta a cada plantilla del registro cuánto se parece el
 * archivo a lo que ella espera (puntaje 0 a 1, ver calcularPuntaje) y devuelve
 * las candidatas ordenadas de mayor a menor. El archivo se abre UNA vez y todas
 * reconocen sobre el mismo libro (reconocer no lo modifica).
 *
 *  - `coincidencias`: las de puntaje 1 (pueden transformar el archivo).
 *    Una sola → el frontend la ejecuta directo. Varias → el usuario elige.
 *    Ninguna → el frontend muestra la primera candidata (la más parecida) y
 *    sus faltantes.
 *
 * No se elige "la que más suma" entre varias en 1: la plantilla se define por la
 * SALIDA que se quiere, y el mismo archivo puede servir para salidas distintas.
 * Nunca lanza.
 *
 * @param {string} rutaArchivo
 * @param {object[]} [plantillas]  por defecto, todas las del registro (los tests
 *                                 pasan plantillas de prueba)
 * @returns {Promise<{ success: boolean, mensaje?: string,
 *   candidatas?: Array<{ id, nombre, descripcion, color, icono, puntaje, faltantes, mensaje }>,
 *   coincidencias?: string[] }>}
 */
async function detectarPlantilla(rutaArchivo, plantillas = todasLasPlantillas()) {
    const abierto = await abrirLibro(rutaArchivo);
    if (!abierto.success) return abierto;
    const { libro } = abierto;

    const candidatas = [];
    for (const p of plantillas) {
        try {
            const r = p.reconocer(libro);
            candidatas.push({
                ...fichaPlantilla(p),
                puntaje: r.puntaje ?? 0,
                faltantes: r.faltantes || [],
                mensaje: r.mensaje
            });
        } catch (e) {
            // Una plantilla rota no tiene que tumbar la detección de las demás.
            console.error(`[plantillasExcel:${p.id}] error al reconocer:`, e);
        }
    }
    // sort es estable: ante empate queda el orden del registro.
    candidatas.sort((a, b) => b.puntaje - a.puntaje);

    return {
        success: true,
        candidatas,
        coincidencias: candidatas.filter(c => c.puntaje === 1).map(c => c.id)
    };
}

module.exports = { procesarArchivo, detectarPlantilla, rutaSalidaLibre };
