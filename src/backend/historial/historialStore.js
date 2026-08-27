// historial/historialStore.js
// Binding del historial a un archivo NDJSON (un JSON por linea) en userData.
//
// Es el UNICO archivo que toca `fs`. El dia de SQLite, se cambia SOLO este
// archivo: el repo y el front siguen hablando con la misma interfaz
// (append / leerTodo). Misma jugada que `cliente/contribuyenteStore.js`.
//
// Por que NDJSON y no un JSON unico: el historial escribe MUCHO (una linea por
// accion). `appendFile` agrega al final en O(1), no reescribe todo el archivo,
// y si una linea se corrompe se pierde esa sola, no el historial entero.

const fs = require('fs');
const { rutaDato } = require('../comun/rutasDatos.js');

// NDJSON con append O(1): NO usa escribirAtomico (eso reescribiría todo el archivo).
// El diseño ya es robusto: cada línea es independiente; una corrupta se ignora al leer.
function rutaArchivo() {
    return rutaDato('historial.ndjson');
}

const historialStore = {
    /**
     * Agrega una entrada al final del archivo. O(1): no reescribe nada.
     * @param {Object} entrada - objeto ya armado/validado por el repo.
     * @returns {boolean} true si se escribio.
     */
    append(entrada) {
        try {
            fs.appendFileSync(rutaArchivo(), JSON.stringify(entrada) + '\n', 'utf8');
            return true;
        } catch (e) {
            console.error('[historialStore] error escribiendo:', e.message);
            return false;
        }
    },

    /**
     * Lee todas las entradas. Una linea corrupta se ignora (no rompe el resto).
     * @returns {Array<Object>} entradas en orden de escritura (mas viejas primero).
     */
    leerTodo() {
        let raw;
        try {
            raw = fs.readFileSync(rutaArchivo(), 'utf8');
        } catch (e) {
            // ENOENT = todavia no se registro nada: historial vacio (no es error).
            if (e.code !== 'ENOENT') console.error('[historialStore] error leyendo:', e.message);
            return [];
        }

        const entradas = [];
        for (const linea of raw.split('\n')) {
            if (!linea.trim()) continue;
            try {
                entradas.push(JSON.parse(linea));
            } catch (e) {
                // Linea corrupta: la salteamos, no tiramos todo el historial.
                console.warn('[historialStore] linea corrupta ignorada');
            }
        }
        return entradas;
    }
};

module.exports = { historialStore };
