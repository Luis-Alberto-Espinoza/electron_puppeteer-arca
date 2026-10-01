// corteCaptchaAfip.js
// Corte por captcha para los LOTES de AFIP (VEP, Cuenta Tributaria, Planes de Pago).
//
// El captcha de AFIP bloquea por IP ~15 min: apenas un cliente lo topa, los logins
// siguientes también van a salir bloqueados, y cada uno espera hasta 3 min a que
// alguien lo resuelva a mano. Sin corte, un lote de 20 clientes se arrastraba una
// hora para fallar igual (y cada intento extra alimenta el bloqueo).
//
// Con el corte: el primer CAPTCHA_BLOQUEO activa el corte y el resto del lote se
// saltea con un mensaje claro. Misma idea que el circuit breaker de la validación
// de clientes (cliente/handlers.js). Se crea UNO por ejecución de lote.

const MENSAJE_SALTEADO =
    'Salteado: AFIP pidió captcha (bloqueo temporal por IP, ~15 min). Reintentá este cliente más tarde.';

function crearCorteCaptchaAfip() {
    let activo = false;
    return {
        get activo() { return activo; },
        mensaje: MENSAJE_SALTEADO,
        /** Mirar el resultado de cada cliente: si fue captcha, se corta el resto del lote. */
        registrar(resultado) {
            if (!activo && resultado && resultado.error === 'CAPTCHA_BLOQUEO') {
                activo = true;
                console.warn('[corteCaptchaAfip] AFIP pidió captcha: se saltea AFIP para el resto del lote.');
            }
        }
    };
}

module.exports = { crearCorteCaptchaAfip };
