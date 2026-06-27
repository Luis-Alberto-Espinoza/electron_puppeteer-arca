/**
 * guardarReporte — registra el resultado de una prueba en UN solo lugar.
 * ---------------------------------------------------------------------
 * Idea: cada corrida de una prueba E2E (ej: "afip-vep") agrega UNA línea
 * al final de pruebas/reportes/historial.jsonl. Un archivo por línea (JSONL)
 * para que se pueda APPENDear sin reescribir todo y sin corromperse si una
 * prueba revienta a la mitad.
 *
 * No tiene dependencias: solo fs y path. Pensado para llamarse desde los
 * scripts de automatización (los que llenan el formulario con puppeteer).
 *
 * Ver la idea completa en docs/test/esqueleto_ideaInicial.md
 */
const fs = require('fs');
const path = require('path');

// Carpeta de SALIDA (artefactos). Está gitignored: son resultados, no código.
const DIR_REPORTES = path.join(__dirname, 'reportes');
const ARCHIVO_HISTORIAL = path.join(DIR_REPORTES, 'historial.jsonl');

const RESULTADOS_VALIDOS = ['ok', 'fallo'];

/**
 * Agrega una línea al historial con el resultado de una prueba.
 *
 * @param {object} datos
 * @param {string}  datos.servicio    Clave del servicio probado. Ej: 'afip-vep', 'atm-constancias'.
 * @param {string}  datos.resultado   'ok' | 'fallo'.
 * @param {string} [datos.cliente]    Nombre/identificador del cliente usado en la prueba.
 * @param {Error|string} [datos.error] Error capturado (si falló). Se guarda solo el mensaje.
 * @param {number} [datos.duracionMs] Cuánto tardó la prueba, en milisegundos.
 * @param {object} [datos.extra]      Campos libres extra (ej: { capturaPath: '...' }).
 * @returns {object} La línea que se escribió (ya parseada).
 */
function guardarReporte({ servicio, resultado, cliente = null, error = null, duracionMs = null, extra = {} } = {}) {
    if (!servicio) {
        throw new Error('guardarReporte: falta "servicio" (ej: "afip-vep").');
    }
    if (!RESULTADOS_VALIDOS.includes(resultado)) {
        throw new Error(`guardarReporte: "resultado" debe ser ${RESULTADOS_VALIDOS.join(' | ')}, llegó "${resultado}".`);
    }

    const linea = {
        fecha: new Date().toISOString(),
        servicio,
        cliente,
        resultado,
        // Guardamos solo el mensaje del error, no el stack entero (eso va al detalle por servicio).
        error: error ? String(error.message || error) : null,
        duracionMs,
        ...extra,
    };

    // recursive: true → crea pruebas/reportes/ si todavía no existe, sin romper si ya está.
    fs.mkdirSync(DIR_REPORTES, { recursive: true });
    fs.appendFileSync(ARCHIVO_HISTORIAL, JSON.stringify(linea) + '\n', 'utf8');

    return linea;
}

/**
 * Lee el historial completo y lo devuelve como array de objetos.
 * Útil para revisar o filtrar (ej: ver solo los 'fallo'). Si no hay archivo, [].
 */
function leerHistorial() {
    if (!fs.existsSync(ARCHIVO_HISTORIAL)) return [];
    return fs.readFileSync(ARCHIVO_HISTORIAL, 'utf8')
        .split('\n')
        .filter(l => l.trim() !== '')
        .map(l => JSON.parse(l));
}

module.exports = { guardarReporte, leerHistorial, ARCHIVO_HISTORIAL, DIR_REPORTES };
