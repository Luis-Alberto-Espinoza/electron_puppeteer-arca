// registrarResultadoLogin.js
// Cada login real (lanzador, VEP, Cuenta Tributaria, lotes ATM, facturación...) deja
// asentado si la clave del titular anda o no. Así "usar un cliente valida su clave"
// en cualquier servicio, por ejemplo después de corregirla desde el diálogo.
//
// Se suscribe al observadorLogin (lo cablea main.js).
//
// Reglas:
//  - Solo resultados CONCLUYENTES: éxito → 'validado'; INVALID_CREDENTIALS → 'invalido'.
//    Un captcha, un timeout o un corte de red no dicen nada de la clave: si los marcáramos
//    como inválidos, un cliente con clave buena quedaría bloqueado (ver plan captcha).
//  - Solo si la clave usada ES la guardada del titular. El lanzador manual o una clave
//    recién tipeada en un alta prueban OTRA clave: su resultado no dice nada de la guardada.

/**
 * @param {Object} repo  contribuyenteRepo
 * @returns {(evento: {canal, cuit, clave, resultado}) => Promise<void>}
 */
function crearRegistradorLogin(repo) {
    return async function registrar({ canal, cuit, clave, resultado }) {
        let estado = null;
        if (resultado && resultado.success) estado = 'validado';
        else if (resultado && resultado.error === 'INVALID_CREDENTIALS') estado = 'invalido';
        if (!estado || !cuit) return;

        const titular = await repo.getByCuit(String(cuit));
        if (!titular) return;   // no es un cliente guardado (ej. lanzador manual)
        const guardada = canal === 'afip' ? titular.claveAFIP : titular.claveATM;
        if (!guardada || guardada !== clave) return;

        const estadoActual = canal === 'afip' ? titular.estado_afip : titular.estado_atm;
        if (estadoActual === estado && estado === 'validado') return;   // nada que cambiar

        await repo.registrarVerificacion(String(cuit), canal, estado,
            estado === 'invalido' ? (resultado.message || 'Clave incorrecta') : null);
        console.log(`[registrarResultadoLogin] ${canal} de ${cuit} → ${estado}`);
    };
}

module.exports = { crearRegistradorLogin };
