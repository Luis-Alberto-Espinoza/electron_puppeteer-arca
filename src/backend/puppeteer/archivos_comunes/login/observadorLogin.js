// observadorLogin.js
// Punto único por donde pasa el resultado de TODOS los logins (AFIP y ATM).
//
// Los logins (login_arca.hacerLogin, login_atm.loginATM) avisan acá cuando terminan,
// y el que quiera enterarse se suscribe. Así la capa de Puppeteer no sabe nada del
// repositorio de clientes: main.js suscribe al registrador (cliente/registrarResultadoLogin)
// y cualquier flujo nuevo que use esos logins queda cubierto sin tocar nada.

const oyentes = [];

/** @param {(evento: {canal:'afip'|'atm', cuit:string, clave:string, resultado:Object}) => any} fn */
function suscribir(fn) {
    oyentes.push(fn);
    return () => {
        const i = oyentes.indexOf(fn);
        if (i !== -1) oyentes.splice(i, 1);
    };
}

/**
 * Se espera a los oyentes (así, cuando el flujo sigue, el estado ya quedó guardado),
 * pero un oyente que falla NUNCA rompe el login.
 */
async function notificar(evento) {
    for (const fn of oyentes) {
        try {
            await fn(evento);
        } catch (e) {
            console.error('[observadorLogin] un oyente falló:', e.message);
        }
    }
}

module.exports = { suscribir, notificar };
