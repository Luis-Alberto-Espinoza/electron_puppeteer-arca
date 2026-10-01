// registrarResultadoLogin.js
// El lanzador de sesión hace un login real: aprovechamos el resultado para dejar
// asentado si la clave del titular anda o no. Así "abrir el navegador" valida la
// clave (por ejemplo, después de actualizarla desde el diálogo).
//
// Solo se registran resultados CONCLUYENTES. Un captcha, un timeout o un corte de
// red no dicen nada de la clave: si los marcáramos como inválidos, un cliente con
// clave buena quedaría bloqueado (ver plan captcha login AFIP).

/**
 * @param {Object} repo          contribuyenteRepo
 * @param {string} cuitTitular   CUIT con el que se hizo el login (el representante, si aplica)
 * @param {'afip'|'atm'} canal
 * @param {{success:boolean, error?:string, message?:string}} resultado
 */
async function registrarResultadoLogin(repo, cuitTitular, canal, resultado) {
    let estado = null;
    if (resultado && resultado.success) estado = 'validado';
    else if (resultado && resultado.error === 'INVALID_CREDENTIALS') estado = 'invalido';
    if (!estado) return;

    try {
        await repo.registrarVerificacion(String(cuitTitular), canal, estado,
            estado === 'invalido' ? (resultado.message || 'Clave incorrecta') : null);
    } catch (e) {
        // No bloquea al usuario: el navegador ya está abierto (o ya falló).
        console.error(`[registrarResultadoLogin] no se pudo registrar ${canal} de ${cuitTitular}:`, e.message);
    }
}

module.exports = { registrarResultadoLogin };
