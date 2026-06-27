// historial/historialRepo.js
// Logica del historial: registrar acciones y listarlas/filtrarlas.
//
// El resto de la app (los handlers de VEP, consultaDeuda, etc.) NUNCA toca el
// archivo: solo llama a `historial.registrar(...)`. Asi, el dia que migremos a
// SQLite, cambia solo el store y nadie mas se entera.
//
// Forma de una entrada (ver docs/historial_app/investigar_paraImplementar_HistorialDeApp.md §4):
//   { id, ts, dominio, accion, estado, cliente:{id,nombre,cuit}, resumen, detalle, error }
// Campos fijos (la vista siempre los usa): id, ts, dominio, accion, estado, resumen.
// Flexibles por dominio: cliente, detalle, error.

const { historialStore } = require('./historialStore.js');

// Mismo esquema de id que el resto del proyecto (storage.js): timestamp + random.
function generarId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ESTADOS_VALIDOS = new Set(['exito', 'error', 'parcial', 'sinDeuda']);

const historialRepo = {
    /**
     * Construye el objeto `cliente` del historial a partir del usuario que manejan
     * los handlers (id, nombre, cuit). Centralizado acá para no repetirlo en cada
     * dominio: si cambia la forma de `cliente`, se toca un solo lugar.
     * @param {Object} usuario - { id, nombre, cuit }
     * @returns {Object|null}
     */
    clienteDesdeUsuario(usuario) {
        if (!usuario) return null;
        return {
            id: usuario.id,
            nombre: usuario.nombre,
            cuit: usuario.cuit != null ? String(usuario.cuit) : null
        };
    },

    /**
     * Registra una accion en el historial. Append-only.
     * Es defensivo a proposito: loguear NUNCA debe tirar abajo el flujo real.
     * Si algo falla, lo avisa por consola y devuelve false, pero no lanza.
     *
     * @param {Object} datos
     * @param {string} datos.dominio   - 'vep' | 'consultaDeuda' | 'factura' | ...
     * @param {string} datos.accion    - verbo dentro del dominio (ej: 'generar')
     * @param {string} datos.estado    - exito | error | parcial | sinDeuda
     * @param {string} datos.resumen   - texto corto para la lista
     * @param {Object} [datos.cliente] - { id, nombre, cuit } a quien afecta
     * @param {Object} [datos.detalle] - libre por dominio (periodo, archivo, etc.)
     * @param {string} [datos.error]   - mensaje si estado === 'error'
     * @returns {Object|null} la entrada registrada, o null si no se pudo.
     */
    registrar(datos) {
        try {
            if (!datos || !datos.dominio || !datos.accion) {
                console.warn('[historialRepo] registro ignorado: falta dominio/accion');
                return null;
            }

            const estado = ESTADOS_VALIDOS.has(datos.estado) ? datos.estado : 'exito';

            const entrada = {
                id: generarId(),
                ts: new Date().toISOString(),
                dominio: datos.dominio,
                accion: datos.accion,
                estado,
                cliente: datos.cliente || null,
                resumen: datos.resumen || '',
                detalle: datos.detalle || null,
                error: datos.error || null
            };

            const ok = historialStore.append(entrada);
            return ok ? entrada : null;
        } catch (e) {
            // Defensivo: el historial es secundario, nunca debe romper el flujo principal.
            console.error('[historialRepo] error registrando (ignorado):', e.message);
            return null;
        }
    },

    /**
     * Lista entradas ordenadas de mas nueva a mas vieja, con filtros opcionales.
     * @param {Object} [filtros]
     * @param {string} [filtros.dominio]
     * @param {string} [filtros.estado]
     * @param {string|number} [filtros.clienteId]
     * @param {string} [filtros.cuit]
     * @param {string} [filtros.desde] - ISO; incluye entradas con ts >= desde
     * @param {string} [filtros.hasta] - ISO; incluye entradas con ts <= hasta
     * @param {number} [filtros.limite] - cantidad maxima a devolver
     * @returns {Array<Object>}
     */
    listar(filtros = {}) {
        let entradas = historialStore.leerTodo();

        if (filtros.dominio) {
            entradas = entradas.filter(e => e.dominio === filtros.dominio);
        }
        if (filtros.estado) {
            entradas = entradas.filter(e => e.estado === filtros.estado);
        }
        if (filtros.clienteId != null) {
            entradas = entradas.filter(e => e.cliente && String(e.cliente.id) === String(filtros.clienteId));
        }
        if (filtros.cuit) {
            entradas = entradas.filter(e => e.cliente && e.cliente.cuit === filtros.cuit);
        }
        if (filtros.desde) {
            entradas = entradas.filter(e => e.ts >= filtros.desde);
        }
        if (filtros.hasta) {
            entradas = entradas.filter(e => e.ts <= filtros.hasta);
        }

        // Mas nuevas primero. ts es ISO en UTC -> orden lexicografico = cronologico.
        // Desempate: orden de aparicion en el archivo (mas abajo = mas nuevo). Esto
        // importa cuando varias entradas caen en el mismo ms (ej: el loop de VEP).
        entradas = entradas
            .map((e, i) => ({ e, i }))
            .sort((a, b) => (a.e.ts < b.e.ts ? 1 : a.e.ts > b.e.ts ? -1 : b.i - a.i))
            .map(x => x.e);

        if (filtros.limite && filtros.limite > 0) {
            entradas = entradas.slice(0, filtros.limite);
        }
        return entradas;
    },

    /**
     * Busqueda por texto libre sobre resumen, nombre/cuit del cliente y dominio.
     * @param {string} texto
     * @param {Object} [filtros] - mismos filtros que listar(), aplicados antes.
     * @returns {Array<Object>}
     */
    buscar(texto, filtros = {}) {
        const base = this.listar(filtros);
        if (!texto || !texto.trim()) return base;

        const q = texto.trim().toLowerCase();
        return base.filter(e => {
            const campos = [
                e.resumen,
                e.dominio,
                e.accion,
                e.cliente && e.cliente.nombre,
                e.cliente && e.cliente.cuit
            ];
            return campos.some(c => c && String(c).toLowerCase().includes(q));
        });
    }
};

module.exports = { historialRepo };
