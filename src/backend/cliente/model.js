/**
 * Modelo del Cliente / Empresa / Punto de Venta.
 *
 * Fuente única de verdad sobre la forma de un cliente en el JSON.
 * Diseñado para ser idempotente: aplicar `normalizarCliente` N veces da
 * exactamente el mismo resultado.
 *
 * Ver docs/modelo_cliente/fase0_modelo_empresa_puntosDeVenta.md
 */

/**
 * @typedef {Object} PuntoDeVenta
 * @property {string} numero            "00001", "00002"… siempre string con leading zeros
 * @property {string|null} descripcion  descripción AFIP si la hay
 * @property {string|null} sistema      ej "RECE para aplicativo y web services" (col 2 del ABM)
 * @property {string|null} domicilio    ej "LOCALES Y ESTABLECIMIENTOS - 0001 - SEVERO..." (col 4 del ABM)
 * @property {boolean|null} activo      true si hay check.png en el ABM; null si no se sabe (ej: solo lite)
 */

/**
 * @typedef {Object} Empresa
 * @property {string|null} cuit                       CUIT de la empresa (puede no conocerse aún)
 * @property {string} razonSocial                     razón social tal como aparece en AFIP
 * @property {'B'|'C'|null} tipoContribuyente         tipo DE LA EMPRESA (puede diferir del cliente)
 * @property {PuntoDeVenta[]} puntosDeVenta           lista de pdv numéricos habilitados
 * @property {string|null} puntosDeVentaActualizados  ISO timestamp; null si nunca se trajeron
 */

/**
 * @typedef {Object} Cliente
 * @property {number} id
 * @property {string} cuit
 * @property {string} nombre
 * @property {string} apellido
 * @property {string} claveAFIP
 * @property {string} [claveATM]
 * @property {Empresa[]} empresas
 * @property {boolean} analizado_afip          true si ya se hizo el scraping detallado del ABM
 * @property {'B'|'C'|null} tipoContribuyente  LEGACY a nivel cliente (pendiente de mover a empresa)
 */

/**
 * Normaliza un número de punto de venta a string con 5 dígitos.
 * Acepta number o string; trim opcional.
 * @param {string|number} n
 * @returns {string}
 */
function normalizarNumeroPdv(n) {
    if (n === null || n === undefined) return '';
    const limpio = String(n).trim();
    // Si ya es todo dígitos, padLeft a 5. Si tiene otros caracteres (raro), dejarlo.
    if (/^\d+$/.test(limpio)) return limpio.padStart(5, '0');
    return limpio;
}

/**
 * Construye una Empresa nueva con valores por defecto.
 * @param {Partial<Empresa>} parcial
 * @returns {Empresa}
 */
function crearEmpresa(parcial = {}) {
    return {
        cuit: parcial.cuit != null ? String(parcial.cuit) : null,
        razonSocial: String(parcial.razonSocial || '').trim(),
        tipoContribuyente: parcial.tipoContribuyente || null,
        puntosDeVenta: Array.isArray(parcial.puntosDeVenta)
            ? parcial.puntosDeVenta.map(normalizarPuntoDeVenta).filter(Boolean)
            : [],
        puntosDeVentaActualizados: parcial.puntosDeVentaActualizados || null
    };
}

/**
 * Normaliza un punto de venta — acepta string ("00001"), number (1) u objeto.
 * @param {string|number|Object} raw
 * @returns {PuntoDeVenta|null}
 */
function normalizarPuntoDeVenta(raw) {
    if (raw === null || raw === undefined) return null;

    if (typeof raw === 'string' || typeof raw === 'number') {
        const numero = normalizarNumeroPdv(raw);
        if (!numero) return null;
        return { numero, descripcion: null, sistema: null, domicilio: null, activo: null };
    }

    if (typeof raw === 'object') {
        const numero = normalizarNumeroPdv(raw.numero);
        if (!numero) return null;
        const descripcion = raw.descripcion != null ? String(raw.descripcion).trim() : null;
        const sistema = raw.sistema != null ? String(raw.sistema).trim() : null;
        const domicilio = raw.domicilio != null ? String(raw.domicilio).trim() : null;
        const activo = typeof raw.activo === 'boolean' ? raw.activo : null;
        return {
            numero,
            descripcion: descripcion || null,
            sistema: sistema || null,
            domicilio: domicilio || null,
            activo
        };
    }

    return null;
}

/**
 * Determina si una entrada de empresa ya está en el formato rico.
 * @param {*} e
 * @returns {boolean}
 */
function esEmpresaObjeto(e) {
    return e && typeof e === 'object' && !Array.isArray(e) && typeof e.razonSocial === 'string';
}

/**
 * Normaliza un cliente leído del JSON:
 *  - `cuit` → string
 *  - construye `empresas[]` si no existe (desde el legacy `puntosDeVenta[]` de strings)
 *  - asegura `analizado_afip` boolean (default false si falta)
 *  - borra del JSON los alias mal nombrados: `puntosDeVenta` y `empresasDisponible` (raíz)
 *  - borra `cuil` cuando viene vacío
 *
 * Idempotente: aplicar dos veces da el mismo resultado.
 * NO toca `nombre`/`apellido` (eso lo hace `normalizarUsuario` en storage.js).
 *
 * @param {Object} raw
 * @returns {Cliente}
 */
function normalizarCliente(raw) {
    if (!raw || typeof raw !== 'object') return raw;

    // 1. cuit siempre string
    if (raw.cuit !== undefined && raw.cuit !== null) {
        raw.cuit = String(raw.cuit);
    }

    // 2. analizado_afip: boolean. Clientes preexistentes vienen sin este campo,
    //    los marcamos como NO analizados aunque tengan empresas viejas, porque
    //    no podemos garantizar que esas empresas tengan PDV detallados del ABM.
    if (typeof raw.analizado_afip !== 'boolean') {
        raw.analizado_afip = false;
    }

    // 3. Asegurar empresas[]
    if (!Array.isArray(raw.empresas)) {
        // Construir desde el legacy `puntosDeVenta` si es array de strings
        const legacy = Array.isArray(raw.puntosDeVenta) ? raw.puntosDeVenta : [];
        raw.empresas = legacy
            .filter(x => typeof x === 'string' && x.trim().length > 0)
            .map(razonSocial => crearEmpresa({ razonSocial }));
    } else {
        // Si ya hay empresas[], normalizar cada una (idempotente)
        raw.empresas = raw.empresas
            .filter(esEmpresaObjeto)
            .map(e => crearEmpresa(e));
    }

    // 4. Eliminar alias mal nombrados a nivel cliente:
    //    - puntosDeVenta[] guardaba razones sociales (no PDV reales). Los PDV
    //      reales viven en cliente.empresas[i].puntosDeVenta[].
    //    - empresasDisponible era duplicado de puntosDeVenta mantenido a mano
    //      por los handlers viejos.
    //    Ambos se borran del JSON en el próximo save.
    if ('puntosDeVenta' in raw) {
        delete raw.puntosDeVenta;
    }
    if ('empresasDisponible' in raw) {
        delete raw.empresasDisponible;
    }

    // 5. Limpiar cuil cuando viene vacío. Si el cliente carga un CUIL real
    //    después, el campo reaparece.
    if ('cuil' in raw && (raw.cuil === '' || raw.cuil === null || raw.cuil === undefined)) {
        delete raw.cuil;
    }

    return raw;
}

/**
 * Devuelve la empresa por razón social. Match case-insensitive y trim.
 * @param {Cliente} cliente
 * @param {string} razonSocial
 * @returns {Empresa|null}
 */
function getEmpresaPorRazonSocial(cliente, razonSocial) {
    if (!cliente || !Array.isArray(cliente.empresas) || !razonSocial) return null;
    const target = String(razonSocial).trim().toLowerCase();
    return cliente.empresas.find(e =>
        e.razonSocial && e.razonSocial.trim().toLowerCase() === target
    ) || null;
}

/**
 * Devuelve la lista de razones sociales del cliente desde `empresas[]`.
 * @param {Cliente} cliente
 * @returns {string[]}
 */
function listarRazonesSociales(cliente) {
    if (!cliente || !Array.isArray(cliente.empresas)) return [];
    return cliente.empresas.map(e => e.razonSocial).filter(Boolean);
}

module.exports = {
    crearEmpresa,
    normalizarCliente,
    normalizarPuntoDeVenta,
    normalizarNumeroPdv,
    getEmpresaPorRazonSocial,
    listarRazonesSociales
};
