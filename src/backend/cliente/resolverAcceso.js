/**
 * resolverAcceso — el corazón del modelo plano de contribuyente.
 *
 * Responde "para operar a ESTE contribuyente por ESTE canal, ¿con qué CUIT y
 * clave entro, y de quién es el trámite?". Esconde toda la lógica de
 * representación: el consumidor pide por el cuit objetivo y recibe el camino ya
 * resuelto, sin saber que existe un representante.
 *
 * Contrato: docs/modelo_cliente/contrato_contribuyente_repo.md §2 (resolverAcceso)
 * Modelo:   docs/modelo_cliente/plan_contribuyente_plano.md §4.3
 *
 * Diseño: la lógica vive en `resolverAccesoCore` (PURA y síncrona → testeable
 * sin storage). `resolverAcceso` es el orquestador async que trae los datos
 * (objetivo + representante si hace falta) vía el `buscarPorCuit` inyectado por
 * el repo. Es **mecánico**: resuelve por qué clave EXISTE, no chequea estado de
 * validación (eso es de `listar`).
 */

/**
 * @typedef {Object} AccesoTramite
 * @property {string} loginCuit
 * @property {string} loginClave
 * @property {string} objetivoCuit
 * @property {string} objetivoNombre
 * @property {boolean} requiereElegirEmpresa
 */

/**
 * Nombre canónico del contribuyente. PREFIERE la razón social, porque es el
 * nombre con el que AFIP lo lista (en la pantalla de elegir empresa) y el que
 * usamos para la carpeta. Para física sin razón social cae a nombre+apellido, y
 * al cuit como último recurso.
 *
 * Ojo: NO usar nombre+apellido primero — AFIP muestra "MORALES DEBORA DEL CARMEN"
 * (razón social), no "Debora Morales", así que el match de empresa fallaba.
 * @param {Object} c contribuyente
 * @returns {string}
 */
function nombreDe(c) {
    if (c.razonSocial) return c.razonSocial;
    const nombreApellido = [c.nombre, c.apellido].filter(Boolean).join(' ').trim();
    return nombreApellido || c.cuit || '';
}

/**
 * Arma el DTO de acceso. `requiereElegirEmpresa` se da masticado para que el
 * consumidor no repita la comparación (si la repitiera, vuelve el bug).
 */
function armarAcceso(loginCuit, loginClave, objetivo) {
    const objetivoCuit = objetivo.cuit;
    return {
        loginCuit: String(loginCuit),
        loginClave,
        objetivoCuit: String(objetivoCuit),
        objetivoNombre: nombreDe(objetivo),
        requiereElegirEmpresa: String(loginCuit) !== String(objetivoCuit)
    };
}

/**
 * Núcleo PURO de la resolución. No toca storage: recibe el objetivo y, si el
 * canal es AFIP y se necesita, el representante ya buscado.
 *
 * @param {Object|null} objetivo       contribuyente a operar
 * @param {'afip'|'atm'} canal
 * @param {Object|null} [representante] solo relevante para AFIP por representación
 * @returns {AccesoTramite|null}        null si no hay camino de acceso
 */
function resolverAccesoCore(objetivo, canal, representante = null) {
    if (!objetivo) return null;

    if (canal === 'atm') {
        // ATM es siempre directo: clave propia o no hay acceso (no hay representación ATM).
        if (!objetivo.claveATM) return null;
        return armarAcceso(objetivo.cuit, objetivo.claveATM, objetivo);
    }

    if (canal === 'afip') {
        // 1) ¿Tiene clave AFIP propia? → entra él mismo.
        if (objetivo.claveAFIP) {
            return armarAcceso(objetivo.cuit, objetivo.claveAFIP, objetivo);
        }
        // 2) ¿Lo representa alguien con clave AFIP? → entra el representante.
        if (objetivo.representanteAfipCuit && representante && representante.claveAFIP) {
            return armarAcceso(representante.cuit, representante.claveAFIP, objetivo);
        }
        // 3) Ni propio ni representante → no puede operar AFIP.
        return null;
    }

    return null; // canal desconocido
}

/**
 * Orquestador async (lo que expone el repo). Trae el objetivo y, solo si AFIP y
 * sin clave propia, el representante; después delega en el núcleo puro.
 *
 * @param {string} cuit
 * @param {'afip'|'atm'} canal
 * @param {{ buscarPorCuit: (cuit: string) => (Object|null|Promise<Object|null>) }} deps
 * @returns {Promise<AccesoTramite|null>}
 */
async function resolverAcceso(cuit, canal, { buscarPorCuit }) {
    const objetivo = await buscarPorCuit(cuit);
    if (!objetivo) return null;

    let representante = null;
    if (canal === 'afip' && !objetivo.claveAFIP && objetivo.representanteAfipCuit) {
        representante = await buscarPorCuit(objetivo.representanteAfipCuit);
    }

    return resolverAccesoCore(objetivo, canal, representante);
}

module.exports = { resolverAcceso, resolverAccesoCore, nombreDe };
