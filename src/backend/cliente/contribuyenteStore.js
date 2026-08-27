// contribuyenteStore.js
// Ata el contribuyenteRepo al archivo real `contribuyentes.json` (en userData),
// generado por tools/migrar_contribuyentes.js (Tarea 6).
//
// Es el binding del repo a JSON. El día de SQLite, se cambia SOLO este archivo:
// los handlers y el front siguen hablando con el mismo repo.

const fs = require('fs');
const { crearContribuyenteRepo } = require('./contribuyenteRepo.js');
const { rutaDato, escribirAtomico } = require('../comun/rutasDatos.js');

function rutaArchivo() {
    return rutaDato('contribuyentes.json');
}

const contribuyenteStore = {
    cargar() {
        try {
            const parsed = JSON.parse(fs.readFileSync(rutaArchivo(), 'utf8'));
            return Array.isArray(parsed.contribuyentes) ? parsed.contribuyentes : [];
        } catch (e) {
            // ENOENT = todavía no se corrió la migración: lista vacía (no es error fatal).
            if (e.code !== 'ENOENT') console.error('[contribuyenteStore] error leyendo:', e.message);
            return [];
        }
    },
    guardar(lista) {
        escribirAtomico(rutaArchivo(), JSON.stringify({ contribuyentes: lista }, null, 2));
        return true;
    }
};

let repoSingleton = null;
/** Repo singleton atado al store JSON. Lazy: app.getPath se resuelve al primer uso. */
function getContribuyenteRepo() {
    if (!repoSingleton) repoSingleton = crearContribuyenteRepo(contribuyenteStore);
    return repoSingleton;
}

module.exports = { getContribuyenteRepo, contribuyenteStore };
