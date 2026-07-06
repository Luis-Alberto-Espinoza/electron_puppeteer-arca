// proyeccionUsersJson.js — PUENTE de transición (C0 del plan write-side).
//
// Proyecta el modelo plano (`contribuyentes.json`) al shape embed (`users.json`)
// que TODAVÍA leen 4 flujos no migrados: SCT (nombre/apellido/cuit por id),
// Planes (representante por id → claveAFIP), NC (usuarioCompleto por id) y la
// empresa ABM (lee `empresas[]`). Es el inverso de `tools/migrar_contribuyentes.js`.
//
// El CRUD nuevo escribe el plano vía el repo y, tras cada guardado, llama a esto
// para regenerar `users.json` y que esos flujos sigan vivos. Cuando se migren al
// repo, el puente se retira y `users.json` muere (ver plan_crud_writeside).
//
// Reglas de diseño:
//  - Cada contribuyente → 1 entrada top-level findable por `id` (preserva `id`,
//    Riesgo 2 del plan: los 4 flujos keyean por id).
//  - El representante lleva a sus representados (FK) como `empresas[]` (lo que
//    consume la ABM).
//  - El output debe SOBREVIVIR `normalizarCliente` (storage.loadData lo corre al
//    leer): root no se toca; `empresas[]` se reconstruye con `crearEmpresa`, así
//    que cada empresa va en su shape.
//
// Limitación conocida (cubierta por C3): no se reconstruye la "self-empresa" de
// un cliente directo (sus propios PDV). La ABM a nivel directo se migra al plano
// en C3; hasta entonces, este puente cubre el caso representado (el crítico para
// SCT/Planes/NC).

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
 * @returns {{ users: Array }}     objeto con el mismo shape que `users.json`
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
            // Jurídica no tiene nombre/apellido → la razón social hace de nombre
            // (SCT enriquece por id usando nombre/cuit).
            nombre: c.nombre || c.razonSocial || null,
            apellido: c.apellido || null,
            tipoContribuyente: c.tipoContribuyente || null,
            // Planes lee claveAFIP del representante directo de acá.
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
