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
 * @property {string|null} cuit                       CUIT de la empresa (lo llena el scraping ABM)
 * @property {string} razonSocial                     razón social tal como aparece en AFIP
 * @property {'B'|'C'|null} tipoContribuyente         tipo DE LA EMPRESA (puede diferir del cliente)
 * @property {string|null} claveATM                   clave ATM propia de la empresa (ATM Mendoza es
 *   por empresa, no por representante). Deuda técnica conocida: cuando llegue el modelo BD
 *   (Contribuyente + Credencial), esto + el estado de abajo se reemplazan por una fila en
 *   `credenciales(servicio='atm_mendoza')`. Ver docs/analisis/baseDeDatos/2_idea.md §1.2.
 *
 *   ── Estado de la credencial ATM de ESTA empresa ───────────────────────────
 *   El estado de validación es POR CREDENCIAL, no por cliente (2_idea.md §0): la
 *   empresa tiene su propia clave ATM, así que su validación vive acá, no en el
 *   representante. Espeja los flags ATM que el cliente ya tiene a nivel raíz.
 * @property {string|null} estado_atm                 'no_aplica'|'pendiente'|'validado'|'invalido'|'requiere_actualizacion'
 * @property {boolean|null} claveAtmValida
 * @property {boolean|null} claveAtmRequiereActualizacion
 * @property {boolean|null} claveAtmInvalida
 * @property {string|null} errorAtm                   mensaje del último intento fallido
 * @property {string|null} fechaVerificacionAtm       ISO timestamp de la última verificación ATM
 *
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
    // Booleano si vino booleano, null si no se sabe (no forzar false: null = "nunca se verificó").
    const bool3 = v => (typeof v === 'boolean' ? v : null);
    return {
        cuit: parcial.cuit != null ? String(parcial.cuit) : null,
        razonSocial: String(parcial.razonSocial || '').trim(),
        tipoContribuyente: parcial.tipoContribuyente || null,
        claveATM: parcial.claveATM ? String(parcial.claveATM) : null,
        // Estado de la credencial ATM de esta empresa (espeja los flags del cliente).
        estado_atm: parcial.estado_atm || null,
        claveAtmValida: bool3(parcial.claveAtmValida),
        claveAtmRequiereActualizacion: bool3(parcial.claveAtmRequiereActualizacion),
        claveAtmInvalida: bool3(parcial.claveAtmInvalida),
        errorAtm: parcial.errorAtm || null,
        fechaVerificacionAtm: parcial.fechaVerificacionAtm || null,
        puntosDeVenta: Array.isArray(parcial.puntosDeVenta)
            ? parcial.puntosDeVenta.map(normalizarPuntoDeVenta).filter(Boolean)
            : [],
        puntosDeVentaActualizados: parcial.puntosDeVentaActualizados || null
    };
}

/**
 * Deriva una descripción "humana" desde el campo domicilio del ABM.
 * El domicilio viene con el formato:
 *   "TIPO_DE_LOCAL - NNNN - DIRECCIÓN REAL"
 * (ej. "LOCALES Y ESTABLECIMIENTOS - 0001 - SEVERO DEL CASTILLO 5506 - CORRALITOS - MENDOZA")
 *
 * Queremos la parte útil para identificar el PDV, sin el prefijo del tipo
 * ni el número (que ya tenemos aparte). Devuelve `null` si no puede limpiarlo.
 */
function derivarDescripcionDeDomicilio(domicilio) {
    if (!domicilio || typeof domicilio !== 'string') return null;
    // Quitar "- NNNN -" del medio (el número de PDV)
    let limpio = domicilio.replace(/\s*-\s*\d{3,5}\s*-\s*/, ' - ');
    // Quitar prefijo genérico tipo "LOCALES Y ESTABLECIMIENTOS - " (solo si toda la
    // primera parte es mayúsculas / espacios, para no comer una dirección legítima).
    limpio = limpio.replace(/^[A-ZÁÉÍÓÚÑ\s]{6,}-\s*/, '').trim();
    // Colapsar espacios múltiples
    limpio = limpio.replace(/\s+/g, ' ');
    return limpio || null;
}

/**
 * Normaliza un punto de venta — acepta string ("00001"), number (1) u objeto.
 *
 * Si el objeto viene con `domicilio` poblado pero `descripcion` vacío (caso típico
 * del scraping ABM), derivamos una descripción útil del domicilio para que las
 * vistas tengan algo legible que mostrar al usuario. Los datos del flujo viejo
 * (que vienen con descripcion poblada y sin domicilio) no se ven afectados.
 *
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
        let descripcion = raw.descripcion != null ? String(raw.descripcion).trim() : null;
        const sistema = raw.sistema != null ? String(raw.sistema).trim() : null;
        const domicilio = raw.domicilio != null ? String(raw.domicilio).trim() : null;
        const activo = typeof raw.activo === 'boolean' ? raw.activo : null;

        // Si no vino descripcion pero sí domicilio, derivar una.
        if (!descripcion && domicilio) {
            descripcion = derivarDescripcionDeDomicilio(domicilio);
        }

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
 * NO toca `nombre`/`apellido`.
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
 * Fusiona las empresas que vienen del form de edición con las ya guardadas,
 * matcheando por `razonSocial` (case-insensitive, trim).
 *
 * Contrato: **el form es autoritativo sobre los campos que muestra**
 * (`cuit`, `claveATM`, `tipoContribuyente`) y el **storage es autoritativo sobre
 * lo que el form no toca** (`puntosDeVenta`, `puntosDeVentaActualizados`). Así se
 * cumple la regla del informe (`docs/modelo_cliente/...`): persistir con merge,
 * NO rebuild — nunca se pierden los PDV scrapeados al editar.
 *
 * - Empresa entrante que matchea una existente → merge (pisa cuit/claveATM/tipo,
 *   conserva PDV de la existente).
 * - Empresa entrante nueva → se agrega.
 * - Empresa existente NO mencionada en el form → se conserva tal cual.
 * - `entrantes` undefined/no-array → devuelve las existentes sin tocar (los
 *   callers viejos que no mandan empresas no rompen nada).
 *
 * `cuit` se preserva si el form lo manda vacío (no se borra por accidente).
 * `claveATM` sí se puede vaciar (mandar '' borra la clave).
 *
 * @param {Empresa[]} existentes
 * @param {Array<Empresa|string>} entrantes
 * @returns {Empresa[]}
 */
function fusionarEmpresas(existentes, entrantes) {
    const previas = (Array.isArray(existentes) ? existentes : [])
        .filter(esEmpresaObjeto)
        .map(crearEmpresa);
    const porRazon = new Map(previas.map(e => [e.razonSocial.trim().toLowerCase(), e]));

    if (!Array.isArray(entrantes)) return Array.from(porRazon.values());

    for (const raw of entrantes) {
        const obj = typeof raw === 'string' ? { razonSocial: raw } : (raw || {});
        const razonSocial = String(obj.razonSocial || '').trim();
        if (!razonSocial) continue;
        const key = razonSocial.toLowerCase();
        const previa = porRazon.get(key) || null;

        // Clave ATM resultante (form autoritativo: '' borra; ausente conserva).
        const claveATMnueva = obj.claveATM !== undefined
            ? (obj.claveATM ? String(obj.claveATM) : null)
            : (previa ? previa.claveATM : null);
        // Si la clave cambió respecto de la guardada, la validación vieja ya no
        // aplica → se resetea (espeja lo que hace user:update a nivel cliente).
        const claveCambio = previa && claveATMnueva !== previa.claveATM;

        porRazon.set(key, crearEmpresa({
            razonSocial,
            // Form autoritativo (lo que muestra). cuit se preserva si viene vacío.
            cuit: (obj.cuit != null && String(obj.cuit).trim() !== '')
                ? obj.cuit
                : (previa && previa.cuit),
            claveATM: claveATMnueva,
            tipoContribuyente: obj.tipoContribuyente || (previa && previa.tipoContribuyente),
            // Estado ATM: lo maneja el storage, no el form. Preservar salvo que cambie la clave.
            estado_atm: claveCambio
                ? (claveATMnueva ? 'pendiente' : 'no_aplica')
                : (previa && previa.estado_atm),
            claveAtmValida: claveCambio ? null : (previa && previa.claveAtmValida),
            claveAtmRequiereActualizacion: claveCambio ? null : (previa && previa.claveAtmRequiereActualizacion),
            claveAtmInvalida: claveCambio ? null : (previa && previa.claveAtmInvalida),
            errorAtm: claveCambio ? null : (previa && previa.errorAtm),
            fechaVerificacionAtm: claveCambio ? null : (previa && previa.fechaVerificacionAtm),
            // Storage autoritativo (lo que el form no toca): preservar PDV.
            puntosDeVenta: previa ? previa.puntosDeVenta : obj.puntosDeVenta,
            puntosDeVentaActualizados: previa
                ? previa.puntosDeVentaActualizados
                : obj.puntosDeVentaActualizados
        }));
    }

    return Array.from(porRazon.values());
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
    fusionarEmpresas,
    normalizarCliente,
    normalizarPuntoDeVenta,
    normalizarNumeroPdv,
    getEmpresaPorRazonSocial,
    listarRazonesSociales
};
