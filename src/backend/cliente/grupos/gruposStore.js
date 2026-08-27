// gruposStore.js
// Ata el registro de estudios/grupos al archivo real `grupos.json` (en userData),
// al lado de `contribuyentes.json`. Calcado de contribuyenteStore.js.
//
// COUPLING (ver docs/modelo_cliente/plan_grupos_estudios): usa la MISMA resolución
// de ruta que contribuyenteStore.js. Los dos pasan por comun/rutasDatos.rutaDato(),
// así grupos.json viaja SIEMPRE junto a contribuyentes.json — si no, en el portable
// los contribuyentes salen del pendrive y los estudios de %APPDATA%, y todos los
// `grupoId` quedan colgando contra un registro que en esa máquina no existe.

const fs = require('fs');
const { rutaDato, escribirAtomico } = require('../../comun/rutasDatos.js');

function rutaArchivo() {
    return rutaDato('grupos.json');
}

const gruposStore = {
    cargar() {
        try {
            const parsed = JSON.parse(fs.readFileSync(rutaArchivo(), 'utf8'));
            return Array.isArray(parsed.grupos) ? parsed.grupos : [];
        } catch (e) {
            // ENOENT = todavía no se creó ningún grupo: lista vacía (no es error fatal).
            if (e.code !== 'ENOENT') console.error('[gruposStore] error leyendo:', e.message);
            return [];
        }
    },
    guardar(lista) {
        // Atómico como contribuyenteStore: en un pendrive, sacarlo a mitad de la
        // escritura dejaría el .json cortado (o queda el viejo entero, o el nuevo).
        escribirAtomico(rutaArchivo(), JSON.stringify({ grupos: lista }, null, 2));
        return true;
    }
};

module.exports = { gruposStore };
