// atm/logErrorCliente.js
// Log del error de UN cliente dentro de un lote ATM.
//
// Una clave incorrecta (o un aviso de ATM) es un resultado esperado, no una falla del
// programa: va en una línea, sin pila. Con la pila parecía que la app se había roto,
// aunque el lote seguía con el siguiente cliente. Cualquier otro error sí lleva la pila:
// es lo que hace falta para depurar.

const { MENSAJES_LOGIN_ATM } = require('../puppeteer/atm/codigoXpagina/login_atm.js');

/**
 * @param {string} servicio  ej. 'Constancia Fiscal'
 * @param {string} cliente   nombre del cliente
 * @param {Error} error
 * @returns {boolean} true si era un error esperado (sin pila)
 */
function logErrorCliente(servicio, cliente, error) {
    const codigo = error && error.code;
    if (codigo && Object.prototype.hasOwnProperty.call(MENSAJES_LOGIN_ATM, codigo)) {
        console.error(`⛔ [${servicio}] ${cliente}: ${error.message} (${codigo})`);
        return true;
    }
    console.error(`Error procesando ${servicio} para ${cliente}:`, error);
    return false;
}

module.exports = { logErrorCliente };
