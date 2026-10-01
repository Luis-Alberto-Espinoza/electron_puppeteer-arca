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
 * El binding al archivo real (`contribuyentes.json`) vive en contribuyenteStore.js.
 * Acá la lógica se prueba con stores en memoria (ver contribuyenteRepo.test.js).
 */

const { resolverAcceso, nombreDe } = require('./resolverAcceso.js');
const { normalizarPuntoDeVenta } = require('./model.js');

// 'no_verificado': no se pudo comprobar la clave (ej. AFIP interpuso captcha por
// bloqueo temporal de IP). NO es 'invalido' — la clave puede ser buena; hay que reintentar.
const ESTADOS = new Set(['no_aplica', 'pendiente', 'validado', 'invalido', 'requiere_actualizacion', 'no_verificado']);
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

    const cuitNorm = raw.cuit != null ? String(raw.cuit) : null;
    let representante = (raw.representanteAfipCuit != null && String(raw.representanteAfipCuit).trim() !== '')
        ? String(raw.representanteAfipCuit)
        : null;
    // Un contribuyente NO puede representarse a sí mismo (dato corrupto típico:
    // elegirse en el propio dropdown). Si pasa, se anula → vuelve a "opera solo".
    if (representante && representante === cuitNorm) representante = null;

    // Invariante del modelo: un representado entra a AFIP POR su representante →
    // NO tiene clave AFIP propia. Si hay representante, se ignora cualquier
    // claveAFIP cargada (si no, el resolver usaría la propia —aunque sea inválida—
    // y nunca caería al representante: ese era el footgun del CRUD).
    const claveAFIP = representante ? null : (raw.claveAFIP || null);
    const estadoAfip = representante ? 'no_aplica' : (estadoValido(raw.estado_afip) || 'no_aplica');
    const errorAfip = representante ? null : (raw.errorAfip || null);

    return {
        // Handle de transición que el frontend usa para editar/borrar (user:update
        // y user:delete resuelven con getById). Versiones viejas del barrido crearon
        // filas de representadas SIN id, y el CRUD las rechazaba con "Usuario no
        // encontrado" — imposible de arreglar salvo borrando y re-barriendo, que se
        // lleva puesto grupoId, claveATM y todo lo cargado a mano.
        //
        // Se rellena con el CUIT (que ya es la PK) y NO con un valor random: esto
        // corre en CADA lectura, así que tiene que ser determinista. Un id nuevo por
        // carga dejaría al frontend con un handle vencido apenas se recargue la lista
        // — peor que no tener id, porque fallaría de manera intermitente.
        id: raw.id != null ? raw.id : cuitNorm,
        cuit: cuitNorm,
        tipo,
        razonSocial: String(raw.razonSocial || '').trim(),
        nombre: esJuridica ? null : (raw.nombre || null),
        apellido: esJuridica ? null : (raw.apellido || null),
        cuil: raw.cuil || null,
        tipoContribuyente: TIPOS_CONTRIB.has(raw.tipoContribuyente) ? raw.tipoContribuyente : null,

        claveAFIP,
        estado_afip: estadoAfip,
        errorAfip,
        fechaVerificacionAfip: raw.fechaVerificacionAfip || null,

        claveATM: raw.claveATM || null,
        estado_atm: estadoValido(raw.estado_atm) || 'no_aplica',
        errorAtm: raw.errorAtm || null,
        fechaVerificacionAtm: raw.fechaVerificacionAtm || null,

        representanteAfipCuit: representante,

        // Estudio/grupo al que pertenece (FK blanda al registro grupos.json). Es una
        // etiqueta ORGANIZATIVA ("quién administra"), independiente del representante
        // AFIP (login). null = sin estudio. Ver docs/modelo_cliente/plan_grupos_estudios.
        grupoId: (raw.grupoId != null && String(raw.grupoId).trim() !== '')
            ? String(raw.grupoId).trim()
            : null,

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
        const motivo = ok ? null
            : (c.estado_afip === 'invalido' ? 'clave AFIP incorrecta' : 'clave AFIP sin validar');
        return { hay: true, validado: ok, motivo };
    }
    if (c.representanteAfipCuit) {
        const rep = lista.find(x => x.cuit === String(c.representanteAfipCuit));
        if (!rep || !rep.claveAFIP) {
            return { hay: false, validado: false, motivo: 'representante sin acceso AFIP' };
        }
        const ok = rep.estado_afip === 'validado';
        const motivo = ok ? null
            : (rep.estado_afip === 'invalido' ? 'clave del representante incorrecta' : 'representante sin validar');
        return { hay: true, validado: ok, motivo };
    }
    return { hay: false, validado: false, motivo: 'sin acceso AFIP' };
}

/**
 * Computa puedeOperar/motivoNoOpera para un servicio dado (§2 listar).
 * `tieneAcceso`: hay una clave con la que intentar entrar, aunque no esté validada.
 * Lo usa el lanzador: abrir el navegador ES la forma de validarla.
 */
function evaluarOperabilidad(c, servicio, lista) {
    if (!servicio) return { puedeOperar: true, motivoNoOpera: null, tieneAcceso: true };

    if (servicio === 'atm') {
        if (!c.claveATM) return { puedeOperar: false, motivoNoOpera: 'sin clave ATM', tieneAcceso: false };
        if (c.estado_atm !== 'validado') {
            const motivo = c.estado_atm === 'invalido' ? 'clave ATM incorrecta' : 'clave ATM sin validar';
            return { puedeOperar: false, motivoNoOpera: motivo, tieneAcceso: true };
        }
        return { puedeOperar: true, motivoNoOpera: null, tieneAcceso: true };
    }

    // 'afip' | 'facturacion'
    const a = accesoAfip(c, lista);
    if (!a.hay || !a.validado) return { puedeOperar: false, motivoNoOpera: a.motivo, tieneAcceso: a.hay };
    if (servicio === 'facturacion' && !(Array.isArray(c.puntosDeVenta) && c.puntosDeVenta.length > 0)) {
        return { puedeOperar: false, motivoNoOpera: 'sin facturación habilitada (sin puntos de venta)', tieneAcceso: true };
    }
    return { puedeOperar: true, motivoNoOpera: null, tieneAcceso: true };
}

/**
 * ¿De quién es la clave con la que se entra a este contribuyente por este canal?
 * ATM: siempre la propia. AFIP: la del representante si lo tiene (invariante: un
 * representado no tiene clave AFIP propia), si no la propia.
 * @returns {{ titular: Object|null, esRepresentante: boolean }}
 */
function titularDeClave(c, canal, lista) {
    if (canal === 'afip' && c.representanteAfipCuit) {
        const rep = lista.find(x => x.cuit === String(c.representanteAfipCuit)) || null;
        return { titular: rep, esRepresentante: true };
    }
    return { titular: c, esRepresentante: false };
}

function aListItem(c, servicio, lista) {
    const op = evaluarOperabilidad(c, servicio, lista);
    return {
        id: c.id,
        cuit: c.cuit,
        nombreMostrado: nombreDe(c),
        // Campos crudos para que el buscador del selector matchee por el apodo que
        // cargó el usuario (nombre/apellido) además de la razón social canónica.
        // El nombre canónico para operar en AFIP sigue saliendo de nombreDe() (razón
        // social); estos son solo para mostrar/buscar en el frontend.
        nombre: c.nombre || null,
        apellido: c.apellido || null,
        razonSocial: c.razonSocial || null,
        tipo: c.tipo,
        tipoContribuyente: c.tipoContribuyente,
        puedeOperar: op.puedeOperar,
        motivoNoOpera: op.motivoNoOpera,
        tieneAcceso: op.tieneAcceso,
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

        // Lista COMPLETA normalizada (con claves) — backend-only. La usa el CRUD
        // para la proyección legacy en memoria. NUNCA cruza al renderer.
        async obtenerTodos() {
            return cargarNormalizado();
        },

        async getById(id) {
            // Sin id no se busca: String(undefined)==='undefined' matchearía al
            // primer contribuyente sin id (footgun de borrar/editar el equivocado).
            if (id == null || String(id) === 'undefined') return null;
            return cargarNormalizado().find(c => c.id != null && String(c.id) === String(id)) || null;
        },

        async resolverAcceso(cuit, canal) {
            // Le inyecta su propio getByCuit al resolver (la costura).
            return resolverAcceso(cuit, canal, { buscarPorCuit: (c) => repo.getByCuit(c) });
        },

        /**
         * Datos para el diálogo de actualizar clave (SIN la clave): a quién pertenece.
         * @returns {Promise<{objetivo:{cuit,nombre}, titular:{cuit,nombre}, esRepresentante:boolean}|null>}
         */
        async titularClave(cuit, canal) {
            const lista = cargarNormalizado();
            const c = lista.find(x => x.cuit === String(cuit));
            if (!c) return null;
            const { titular, esRepresentante } = titularDeClave(c, canal, lista);
            if (!titular) throw repoError('REPRESENTANTE_NO_ENCONTRADO', `No se encontró al representante ${c.representanteAfipCuit}`);
            return {
                objetivo: { cuit: c.cuit, nombre: nombreDe(c) },
                titular: { cuit: titular.cuit, nombre: nombreDe(titular) },
                esRepresentante
            };
        },

        /**
         * Guarda una clave nueva en el TITULAR (no en el objetivo si es representado).
         * Pasa por actualizar(): el estado vuelve a 'pendiente' hasta que un login la confirme.
         */
        async actualizarClave(cuit, canal, clave) {
            if (canal !== 'afip' && canal !== 'atm') throw repoError('CANAL_INVALIDO', `Canal desconocido: ${canal}`);
            if (!clave || !String(clave).trim()) throw repoError('CLAVE_VACIA', 'La clave no puede estar vacía');
            const info = await repo.titularClave(cuit, canal);
            if (!info) throw repoError('NO_ENCONTRADO', `No existe el contribuyente ${cuit}`);
            const campo = canal === 'afip' ? 'claveAFIP' : 'claveATM';
            await repo.actualizar(info.titular.cuit, { [campo]: String(clave) });
            return info;
        },

        /**
         * Registra el resultado de un login real (lo usa el lanzador) en el titular de la clave.
         * Solo para resultados concluyentes: 'validado' o 'invalido'. Un captcha o un corte de
         * red no dicen nada de la clave y NO se registran.
         */
        async registrarVerificacion(cuitTitular, canal, estado, error = null) {
            const ahora = new Date().toISOString();
            const cambios = canal === 'afip'
                ? { estado_afip: estado, errorAfip: error, fechaVerificacionAfip: ahora }
                : { estado_atm: estado, errorAtm: error, fechaVerificacionAtm: ahora };
            return repo.actualizar(cuitTitular, cambios);
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
            // El id ya lo garantiza normalizarContribuyente (cae al CUIT si el creador
            // no trajo uno), así que acá no hace falta generarlo. Se respeta el que
            // venga: el CRUD manda su propio timestamp para las altas manuales.
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
        },

        // Limpia el grupo de TODOS sus miembros (una pasada, un solo persistir).
        // Lo usa el borrado de un estudio: los clientes quedan "sin grupo", nunca
        // se borran (decisión de diseño).
        async desasignarGrupo(grupoId) {
            const objetivo = String(grupoId);
            const lista = cargarNormalizado();
            let cambiados = 0;
            for (const c of lista) {
                if (c.grupoId === objetivo) { c.grupoId = null; cambiados++; }
            }
            if (cambiados > 0) persistir(lista);
            return { cambiados };
        }
    };

    return repo;
}

module.exports = { crearContribuyenteRepo, normalizarContribuyente, evaluarOperabilidad };
