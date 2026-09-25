// plantillasExcel/service/cabeceras.js
// Utilidades compartidas por todas las plantillas: leer celdas de exceljs como
// valores planos y encontrar columnas por NOMBRE de cabecera (nunca por posición).
//
// Lección de la DDJJ: los clientes mueven las columnas de lugar. Por eso cada
// plantilla declara qué cabeceras necesita y acá se buscan por nombre normalizado.

/**
 * Normaliza un texto de cabecera para compararlo: minúsculas, sin tildes, sin
 * espacios de más (ojo: "Tasa IVA " viene con un espacio al final) y sin espacios
 * alrededor de "-" y "/" ("Año - mes" == "Año-mes").
 * @param {*} texto
 * @returns {string}
 */
function normalizarCabecera(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // saca tildes (ñ -> n)
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\s*([-/])\s*/g, '$1')
        .trim();
}

/**
 * Devuelve el valor "plano" de una celda de exceljs: si es fórmula, su resultado
 * cacheado; si es texto enriquecido, el texto; si es hipervínculo, el texto.
 * Los errores de Excel (#VALUE!, etc.) vuelven como null.
 * @param {import('exceljs').Cell} celda
 */
function valorPlano(celda) {
    const v = celda ? celda.value : null;
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v;
    if (typeof v !== 'object') return v;
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
    if ('formula' in v || 'sharedFormula' in v) {
        const r = v.result;
        if (r === undefined || r === null) return null;
        if (typeof r === 'object' && !(r instanceof Date)) return null; // {error: '#VALUE!'}
        return r;
    }
    if ('text' in v) return v.text;   // hipervínculo
    if ('error' in v) return null;
    return null;
}

/** true si la celda es una fórmula (normal o compartida). */
function esFormula(celda) {
    const v = celda ? celda.value : null;
    return !!(v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v));
}

/**
 * Busca en las primeras filas de una hoja la fila de cabeceras que contenga TODAS
 * las cabeceras pedidas. Devuelve la mejor coincidencia (la que más encontró),
 * para poder decir exactamente cuáles faltan.
 *
 * @param {import('exceljs').Worksheet} hoja
 * @param {Object<string,string>} requeridas  clave interna -> texto de la cabecera
 * @param {number} [filasARevisar=20]
 * @returns {{ filaCabecera: number|null, columnas: Object<string,number>, faltantes: string[] }}
 *   columnas: clave interna -> número de columna (1 = A). faltantes: textos originales.
 */
function buscarCabeceras(hoja, requeridas, filasARevisar = 20) {
    const buscadas = Object.entries(requeridas).map(([clave, texto]) => ({
        clave, texto, norm: normalizarCabecera(texto)
    }));
    let mejor = { filaCabecera: null, columnas: {}, faltantes: buscadas.map(b => b.texto) };

    const tope = Math.min(hoja.rowCount || 0, filasARevisar);
    for (let r = 1; r <= tope; r++) {
        const fila = hoja.getRow(r);
        const porNombre = new Map(); // nombre normalizado -> primera columna donde aparece
        fila.eachCell({ includeEmpty: false }, (celda, col) => {
            const n = normalizarCabecera(valorPlano(celda));
            if (n && !porNombre.has(n)) porNombre.set(n, col);
        });
        const columnas = {};
        const faltantes = [];
        for (const b of buscadas) {
            if (porNombre.has(b.norm)) columnas[b.clave] = porNombre.get(b.norm);
            else faltantes.push(b.texto);
        }
        if (faltantes.length < mejor.faltantes.length) {
            mejor = { filaCabecera: r, columnas, faltantes };
            if (!faltantes.length) break;
        }
    }
    return mejor;
}

/**
 * Puntaje de parecido de un archivo con una plantilla: cabeceras obligatorias
 * encontradas / total de obligatorias (0 a 1). Todas las plantillas lo calculan con
 * esta MISMA regla, así el orquestador puede comparar puntajes entre plantillas.
 * 1 = están todas (la plantilla puede transformar el archivo).
 *
 * @param {Object<string,string>} obligatorias  clave interna -> texto de la cabecera
 * @param {string[]} faltantes  textos de las obligatorias que no se encontraron
 * @returns {number}
 */
function calcularPuntaje(obligatorias, faltantes) {
    const total = Object.keys(obligatorias).length;
    if (!total) return 0;
    return (total - faltantes.length) / total;
}

/** Número de columna (1-based) -> letra de Excel (1 -> A, 28 -> AB). */
function letraColumna(n) {
    let s = '';
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

/** Nombre de hoja listo para usar en una fórmula: Datos! o 'Mi hoja'! */
function refHoja(nombre) {
    if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(nombre)) return `${nombre}!`;
    return `'${String(nombre).replace(/'/g, "''")}'!`;
}

module.exports = {
    normalizarCabecera,
    valorPlano,
    esFormula,
    buscarCabeceras,
    calcularPuntaje,
    letraColumna,
    refHoja
};
