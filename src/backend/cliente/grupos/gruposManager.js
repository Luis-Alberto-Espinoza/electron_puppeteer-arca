// gruposManager.js
// Reglas del registro de estudios/grupos: crear / renombrar / eliminar, con las
// validaciones (nombre no vacío, único case-insensitive) y la generación de id.
//
// El id es estable y NO es el nombre: el contribuyente guarda `grupoId`, así
// renombrar un estudio no toca ninguna ficha. Ver plan_grupos_estudios.
//
// El manager NO conoce el cascade de borrado (limpiar grupoId de los clientes):
// eso vive en el contribuyenteRepo y lo orquesta el handler. Este manager solo
// administra grupos.json.

const { gruposStore } = require('./gruposStore.js');

// Paleta para el badge de la lista. Se asigna rotando al crear; el usuario podrá
// cambiarla más adelante desde la UI de gestión.
const COLORES = ['#4f8cff', '#22a06b', '#e8590c', '#9c36b5', '#0c8599', '#e03131'];

function normalizarNombre(n) {
    return String(n || '').replace(/\s+/g, ' ').trim();
}

/** Clave de comparación para unicidad: sin acentos ni mayúsculas. */
function claveNombre(n) {
    return normalizarNombre(n)
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');   // saca marcas de acento
}

function nuevoId() {
    return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function gruposError(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
}

const gruposManager = {
    listar() {
        return gruposStore.cargar();
    },

    crear({ nombre, color } = {}) {
        const limpio = normalizarNombre(nombre);
        if (!limpio) throw gruposError('NOMBRE_VACIO', 'El estudio necesita un nombre.');

        const lista = gruposStore.cargar();
        if (lista.some(g => claveNombre(g.nombre) === claveNombre(limpio))) {
            throw gruposError('NOMBRE_DUPLICADO', `Ya existe un estudio "${limpio}".`);
        }

        const grupo = {
            id: nuevoId(),
            nombre: limpio,
            color: color || COLORES[lista.length % COLORES.length],
            fechaCreacion: new Date().toISOString()
        };
        lista.push(grupo);
        gruposStore.guardar(lista);
        return grupo;
    },

    renombrar({ id, nombre, color } = {}) {
        const lista = gruposStore.cargar();
        const idx = lista.findIndex(g => g.id === id);
        if (idx === -1) throw gruposError('NO_ENCONTRADO', 'No existe ese estudio.');

        if (nombre !== undefined) {
            const limpio = normalizarNombre(nombre);
            if (!limpio) throw gruposError('NOMBRE_VACIO', 'El estudio necesita un nombre.');
            // Único, ignorándose a sí mismo.
            const choca = lista.some(g => g.id !== id && claveNombre(g.nombre) === claveNombre(limpio));
            if (choca) throw gruposError('NOMBRE_DUPLICADO', `Ya existe un estudio "${limpio}".`);
            lista[idx].nombre = limpio;
        }
        if (color !== undefined) lista[idx].color = color;

        gruposStore.guardar(lista);
        return lista[idx];
    },

    // Busca un estudio por nombre (ignorando mayúsculas/acentos) y, si no existe,
    // lo crea. Lo usa la carga masiva: el Excel trae el NOMBRE del estudio en una
    // columna y acá lo resolvemos a un id (creándolo la primera vez que aparece).
    // Devuelve el grupo, o null si el nombre viene vacío.
    obtenerOCrearPorNombre(nombre) {
        const limpio = normalizarNombre(nombre);
        if (!limpio) return null;
        const lista = gruposStore.cargar();
        const existente = lista.find(g => claveNombre(g.nombre) === claveNombre(limpio));
        if (existente) return existente;
        return this.crear({ nombre: limpio });
    },

    // Saca el grupo del registro. El cascade (limpiar grupoId de los clientes) NO
    // se hace acá: lo orquesta el handler con el contribuyenteRepo. Devuelve el
    // grupo eliminado (o null si no estaba).
    eliminar(id) {
        const lista = gruposStore.cargar();
        const idx = lista.findIndex(g => g.id === id);
        if (idx === -1) return null;
        const [eliminado] = lista.splice(idx, 1);
        gruposStore.guardar(lista);
        return eliminado;
    }
};

module.exports = { gruposManager };
