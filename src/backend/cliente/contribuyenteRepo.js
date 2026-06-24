/**
 * contribuyenteRepo — implementación del contrato de la costura.
 *
 * Contrato: docs/modelo_cliente/contrato_contribuyente_repo.md
 * Modelo:   docs/modelo_cliente/plan_contribuyente_plano.md
 *
 * Construido con inyección de dependencias (`cargar`/`guardar`): la lógica no
 * sabe si por dentro hay un JSON o SQLite. Hoy se ata a un store JSON; mañana a
 * SQLite, sin tocar consumidores. Todos los métodos son async (firmas estables
 * aunque el store sea síncrono).
 *
 * NOTA: el binding al `users.json` real + la migración de datos es la Tarea 6.
 * Acá la lógica se prueba con stores en memoria (ver contribuyenteRepo.test.js).
 */

const { resolverAcceso, nombreDe } = require('./resolverAcceso.js');
const { normalizarPuntoDeVenta } = require('./model.js');

const ESTADOS = new Set(['no_aplica', 'pendiente', 'validado', 'invalido', 'requiere_actualizacion']);
const TIPOS_CONTRIB = new Set(['A', 'B', 'C', 'M']);

/** Error tipado: lleva `.code` legible en vez de un string suelto. */
function repoError(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
}

function estadoValido(v) {
    return ESTADOS.has(v) ? v : null;
}

/**
 * Normaliza una fila de contribuyente al shape canónico (§4.1 del plan).
 * IDEMPOTENTE y con LISTA BLANCA: conoce TODOS los campos válidos; cualquier
 * otro se descarta. (Peligro 2: si no conociera un campo, lo borraría al guardar.)
 */
function normalizarContribuyente(raw) {
    if (!raw || typeof raw !== 'object') return raw;

    const tipo = (raw.tipo === 'fisica' || raw.tipo === 'juridica')
        ? raw.tipo
        : ((raw.nombre || raw.apellido) ? 'fisica' : 'juridica');
    // Invariante: una jurídica no tiene nombre/apellido (su identidad es la razón
    // social). Evita que un `nombre` colgado le gane a la razón social en la carpeta.
    const esJuridica = tipo === 'juridica';

    const representante = (raw.representanteAfipCuit != null && String(raw.representanteAfipCuit).trim() !== '')
        ? String(raw.representanteAfipCuit)
        : null;

    return {
        id: raw.id,                                   // handle de transición
        cuit: raw.cuit != null ? String(raw.cuit) : null,
        tipo,
        razonSocial: String(raw.razonSocial || '').trim(),
        nombre: esJuridica ? null : (raw.nombre || null),
        apellido: esJuridica ? null : (raw.apellido || null),
        cuil: raw.cuil || null,
        tipoContribuyente: TIPOS_CONTRIB.has(raw.tipoContribuyente) ? raw.tipoContribuyente : null,

        claveAFIP: raw.claveAFIP || null,
        estado_afip: estadoValido(raw.estado_afip) || 'no_aplica',
        errorAfip: raw.errorAfip || null,
        fechaVerificacionAfip: raw.fechaVerificacionAfip || null,

        claveATM: raw.claveATM || null,
        estado_atm: estadoValido(raw.estado_atm) || 'no_aplica',
        errorAtm: raw.errorAtm || null,
        fechaVerificacionAtm: raw.fechaVerificacionAtm || null,

        representanteAfipCuit: representante,

        puntosDeVenta: Array.isArray(raw.puntosDeVenta)
            ? raw.puntosDeVenta.map(normalizarPuntoDeVenta).filter(Boolean)
            : [],
        puntosDeVentaActualizados: raw.puntosDeVentaActualizados || null,

        fechaCreacion: raw.fechaCreacion || null,
        fechaModificacion: raw.fechaModificacion || null
    };
}

/**
 * Acceso AFIP (propio o por representante) y si está validado.
 * @returns {{ hay: boolean, validado: boolean, motivo: string|null }}
 */
function accesoAfip(c, lista) {
    if (c.claveAFIP) {
        const ok = c.estado_afip === 'validado';
        return { hay: true, validado: ok, motivo: ok ? null : 'clave AFIP sin validar' };
    }
    if (c.representanteAfipCuit) {
        const rep = lista.find(x => x.cuit === String(c.representanteAfipCuit));
        if (!rep || !rep.claveAFIP) {
            return { hay: false, validado: false, motivo: 'representante sin acceso AFIP' };
        }
        const ok = rep.estado_afip === 'validado';
        return { hay: true, validado: ok, motivo: ok ? null : 'representante sin validar' };
    }
    return { hay: false, validado: false, motivo: 'sin acceso AFIP' };
}

/** Computa puedeOperar/motivoNoOpera para un servicio dado (§2 listar). */
function evaluarOperabilidad(c, servicio, lista) {
    if (!servicio) return { puedeOperar: true, motivoNoOpera: null };

    if (servicio === 'atm') {
        if (!c.claveATM) return { puedeOperar: false, motivoNoOpera: 'sin clave ATM' };
        if (c.estado_atm !== 'validado') return { puedeOperar: false, motivoNoOpera: 'clave ATM sin validar' };
        return { puedeOperar: true, motivoNoOpera: null };
    }

    // 'afip' | 'facturacion'
    const a = accesoAfip(c, lista);
    if (!a.hay || !a.validado) return { puedeOperar: false, motivoNoOpera: a.motivo };
    if (servicio === 'facturacion' && !(Array.isArray(c.puntosDeVenta) && c.puntosDeVenta.length > 0)) {
        return { puedeOperar: false, motivoNoOpera: 'sin facturación habilitada (sin puntos de venta)' };
    }
    return { puedeOperar: true, motivoNoOpera: null };
}

function aListItem(c, servicio, lista) {
    const op = evaluarOperabilidad(c, servicio, lista);
    return {
        id: c.id,
        cuit: c.cuit,
        nombreMostrado: nombreDe(c),
        tipo: c.tipo,
        tipoContribuyente: c.tipoContribuyente,
        puedeOperar: op.puedeOperar,
        motivoNoOpera: op.motivoNoOpera,
        esRepresentado: !c.claveAFIP && !!c.representanteAfipCuit
    };
}

/**
 * Crea el repo. `store` debe exponer `cargar(): rawArray` y `guardar(rawArray)`.
 * @param {{ cargar: Function, guardar: Function }} store
 */
function crearContribuyenteRepo(store) {
    // Carga + normaliza la lista completa (fuente para resolver y listar).
    function cargarNormalizado() {
        const arr = store.cargar();
        return (Array.isArray(arr) ? arr : []).map(normalizarContribuyente);
    }

    function persistir(lista) {
        store.guardar(lista.map(normalizarContribuyente));
    }

    const repo = {
        async listar({ servicio } = {}) {
            const lista = cargarNormalizado();
            return lista.map(c => aListItem(c, servicio, lista));
        },

        async getByCuit(cuit) {
            const objetivo = String(cuit);
            return cargarNormalizado().find(c => c.cuit === objetivo) || null;
        },

        async getById(id) {
            return cargarNormalizado().find(c => String(c.id) === String(id)) || null;
        },

        async resolverAcceso(cuit, canal) {
            // Le inyecta su propio getByCuit al resolver (la costura).
            return resolverAcceso(cuit, canal, { buscarPorCuit: (c) => repo.getByCuit(c) });
        },

        async crear(datos) {
            const lista = cargarNormalizado();
            const nuevo = normalizarContribuyente(datos);
            if (!nuevo.cuit || !/^\d{11}$/.test(nuevo.cuit)) {
                throw repoError('CUIT_INVALIDO', 'El CUIT debe tener 11 dígitos');
            }
            if (lista.some(c => c.cuit === nuevo.cuit)) {
                throw repoError('CUIT_DUPLICADO', `Ya existe un contribuyente con CUIT ${nuevo.cuit}`);
            }
            nuevo.fechaCreacion = nuevo.fechaCreacion || new Date().toISOString();
            lista.push(nuevo);
            persistir(lista);
            return nuevo;
        },

        async actualizar(cuit, cambios) {
            const lista = cargarNormalizado();
            const objetivo = String(cuit);
            const idx = lista.findIndex(c => c.cuit === objetivo);
            if (idx === -1) throw repoError('NO_ENCONTRADO', `No existe el contribuyente ${objetivo}`);

            const previo = lista[idx];
            const fusionado = { ...previo, ...cambios, cuit: previo.cuit };

            // Si cambió una clave, su estado vuelve a pendiente (no_aplica si quedó vacía).
            if ('claveAFIP' in cambios && cambios.claveAFIP !== previo.claveAFIP) {
                fusionado.estado_afip = cambios.claveAFIP ? 'pendiente' : 'no_aplica';
                fusionado.claveAfipValida = undefined;
            }
            if ('claveATM' in cambios && cambios.claveATM !== previo.claveATM) {
                fusionado.estado_atm = cambios.claveATM ? 'pendiente' : 'no_aplica';
            }
            fusionado.fechaModificacion = new Date().toISOString();

            lista[idx] = normalizarContribuyente(fusionado);
            persistir(lista);
            return lista[idx];
        },

        async borrar(cuit) {
            const lista = cargarNormalizado();
            const objetivo = String(cuit);
            const idx = lista.findIndex(c => c.cuit === objetivo);
            if (idx === -1) throw repoError('NO_ENCONTRADO', `No existe el contribuyente ${objetivo}`);

            // Integridad referencial: no borrar si representa a otros en AFIP.
            const dependientes = lista
                .filter(c => c.representanteAfipCuit === objetivo)
                .map(c => c.cuit);
            if (dependientes.length > 0) {
                return { ok: false, dependientes };
            }

            lista.splice(idx, 1);
            persistir(lista);
            return { ok: true };
        }
    };

    return repo;
}

module.exports = { crearContribuyenteRepo, normalizarContribuyente, evaluarOperabilidad };
