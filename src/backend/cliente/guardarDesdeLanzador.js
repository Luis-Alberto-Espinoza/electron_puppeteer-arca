// guardarDesdeLanzador.js
// Modo manual del lanzador: después de un login exitoso con CUIT + clave tipeados,
// ofrecer guardar ese cliente (o actualizar su clave si ya estaba en la cartera).
//
// La clave se acaba de probar con un login real, así que se guarda como 'validado'.
//
// Un representado de AFIP no tiene clave propia: entra con la de su representante
// (ver invariante en normalizarContribuyente). Si alguien loguea a mano con el CUIT
// de un representado, NO se guarda: actualizarClave la escribiría en el representante.

const CAMPO_CLAVE = { afip: 'claveAFIP', atm: 'claveATM' };

function errorGuardar(code, message) {
    const e = new Error(message);
    e.code = code;
    return e;
}

/**
 * Qué pasaría al guardar este CUIT. Lo usa el handler de sesión manual para que el
 * front ponga el botón correcto ("Guardar cliente" / "Actualizar clave guardada").
 * @returns {Promise<{existe:false} | {existe:true, nombre:string, esRepresentado:boolean}>}
 */
async function estadoGuardado(repo, cuit, canal) {
    const info = await repo.titularClave(String(cuit), canal);
    if (!info) return { existe: false };
    return { existe: true, nombre: info.objetivo.nombre, esRepresentado: info.esRepresentante };
}

/**
 * Crea el contribuyente o le actualiza la clave del canal, dejándola validada.
 * @param {Object} repo contribuyenteRepo
 * @param {{cuit:string, canal:'afip'|'atm', clave:string, nombre?:string}} datos
 * @returns {Promise<{accion:'creado'|'actualizado', nombre:string}>}
 */
async function guardarDesdeLanzador(repo, { cuit, canal, clave, nombre }) {
    const campo = CAMPO_CLAVE[canal];
    if (!campo) throw errorGuardar('CANAL_INVALIDO', `Canal desconocido: ${canal}`);
    cuit = String(cuit || '').trim();
    clave = String(clave || '');
    nombre = String(nombre || '').trim();
    if (!clave) throw errorGuardar('CLAVE_VACIA', 'La clave no puede estar vacía.');

    const previo = await estadoGuardado(repo, cuit, canal);

    if (previo.existe) {
        if (previo.esRepresentado) {
            throw errorGuardar('ES_REPRESENTADO',
                `${previo.nombre} entra a AFIP con la clave de su representante: no se le guarda una clave propia.`);
        }
        // actualizar() deja el estado en 'pendiente' al cambiar la clave; el login ya la probó.
        await repo.actualizar(cuit, { [campo]: clave });
        await repo.registrarVerificacion(cuit, canal, 'validado');
        return { accion: 'actualizado', nombre: previo.nombre };
    }

    if (!nombre) throw errorGuardar('NOMBRE_VACIO', 'Completá el nombre o razón social.');
    await repo.crear({
        cuit,
        tipo: null,              // normalizar lo infiere
        razonSocial: nombre,     // entero, sin partir en nombre/apellido
        [campo]: clave,
        estado_afip: canal === 'afip' ? 'validado' : 'no_aplica',
        estado_atm: canal === 'atm' ? 'validado' : 'no_aplica'
    });
    return { accion: 'creado', nombre };
}

module.exports = { estadoGuardado, guardarDesdeLanzador };
