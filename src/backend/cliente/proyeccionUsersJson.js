// proyeccionUsersJson.js — proyección legacy EN MEMORIA (ya no se escribe a disco).
//
// Proyecta el modelo plano (`contribuyentes.json`) al shape embed viejo (el de
// `users.json`, que ya no existe). Solo la consumen, en memoria:
//   - `user:getAll` → el front que todavía lee el shape viejo (CRUD, selector de
//     Planes, etc.).
//   - `user:verify-credentials` → "Probar clave" trabaja sobre ese objeto.
// Cuando esos consumidores lean el plano, este archivo se borra.
//
// Reglas de diseño:
//  - Cada contribuyente → 1 entrada top-level findable por `id` (preserva `id`:
//    el front keyea por id).
//  - El representante lleva a sus representados (FK) como `empresas[]` (lo que
//    consume la ABM).
//  - El output debe SOBREVIVIR `normalizarCliente`: root no se toca; `empresas[]`
//    se reconstruye con `crearEmpresa`, así que cada empresa va en su shape.

const { nombreDe } = require('./resolverAcceso.js');

/** Mapea un contribuyente representado al shape `empresa` del embed. */
function empresaDesdeContribuyente(r) {
    return {
        cuit: r.cuit,
        razonSocial: r.razonSocial || '',
        tipoContribuyente: r.tipoContribuyente || null,
        claveATM: r.claveATM || null,
        estado_atm: r.estado_atm || null,
        errorAtm: r.errorAtm || null,
        fechaVerificacionAtm: r.fechaVerificacionAtm || null,
        puntosDeVenta: Array.isArray(r.puntosDeVenta) ? r.puntosDeVenta : [],
        puntosDeVentaActualizados: r.puntosDeVentaActualizados || null
    };
}

/**
 * @param {Array} contribuyentes  lista plana (shape §4.1)
 * @returns {{ users: Array }}     objeto con el shape del viejo `users.json`
 */
function proyectarUsersJson(contribuyentes) {
    const lista = Array.isArray(contribuyentes) ? contribuyentes : [];

    // Índice representante(cuit) → [representados]
    const representadosPorCuit = new Map();
    for (const c of lista) {
        const rep = c.representanteAfipCuit;
        if (!rep) continue;
        const k = String(rep);
        if (!representadosPorCuit.has(k)) representadosPorCuit.set(k, []);
        representadosPorCuit.get(k).push(c);
    }

    // Índice cuit → contribuyente, para resolver el representante de un representado.
    const porCuit = new Map(lista.map(c => [String(c.cuit), c]));

    const users = lista.map(c => {
        const representados = representadosPorCuit.get(String(c.cuit)) || [];
        // Si no tiene clave propia pero sí representante, el acceso AFIP es el de él.
        const repAfip = (!c.claveAFIP && c.representanteAfipCuit)
            ? porCuit.get(String(c.representanteAfipCuit)) || null
            : null;
        const user = {
            id: c.id,
            cuit: c.cuit,
            // Jurídica no tiene nombre/apellido → la razón social hace de nombre.
            nombre: c.nombre || c.razonSocial || null,
            apellido: c.apellido || null,
            tipoContribuyente: c.tipoContribuyente || null,
            claveAFIP: c.claveAFIP || null,
            estado_afip: c.estado_afip || 'no_aplica',
            errorAfip: c.errorAfip || null,
            fechaVerificacionAfip: c.fechaVerificacionAfip || null,
            claveATM: c.claveATM || null,
            estado_atm: c.estado_atm || 'no_aplica',
            errorAtm: c.errorAtm || null,
            fechaVerificacionAtm: c.fechaVerificacionAtm || null,
            // refleja si alguna vez se trajeron PDV (lo usa la ABM/algunas vistas)
            analizado_afip: Boolean(c.puntosDeVentaActualizados),
            // Acceso AFIP por representante (para que el CRUD no muestre "sin clave"
            // en un representado que SÍ puede operar con la clave de su representante).
            representanteAfipCuit: c.representanteAfipCuit || null,
            representanteAfipNombre: repAfip ? nombreDe(repAfip) : null,
            estadoAfipRepresentante: repAfip ? (repAfip.estado_afip || 'no_aplica') : null,
            empresas: representados.map(empresaDesdeContribuyente)
        };
        if (c.cuil) user.cuil = c.cuil;   // normalizarCliente borra cuil vacío
        return user;
    });

    return { users };
}

module.exports = { proyectarUsersJson, empresaDesdeContribuyente };
