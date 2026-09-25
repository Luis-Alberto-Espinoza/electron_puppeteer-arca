// plantillasExcel/plantillasExcelManager.js
// Orquesta una plantilla sobre un archivo: valida la extensión, abre el Excel,
// reconoce, transforma y escribe un archivo NUEVO al lado del original.
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
const { obtenerPlantilla } = require('./registroPlantillas.js');

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

module.exports = { procesarArchivo, rutaSalidaLibre };
