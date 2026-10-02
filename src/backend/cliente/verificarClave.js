// verificarClave.js
// Verificación corta de una clave recién cargada desde el diálogo "Actualizar clave",
// para que el cliente quede usable SIN salir de la pantalla (ej. a mitad de una factura).
//
// Cada servicio verifica lo que necesita para operar:
//   'atm'          → solo login en ATM.
//   'afip'         → solo login en AFIP.
//   'facturacion'  → si el cliente YA tiene puntos de venta: solo login (lo único que
//                    se rompió es la clave). Si NO tiene: Analizar (login + trae los PDV),
//                    porque sin PDV no se puede facturar (típico: nunca tuvo clave).
//                    Que AFIP le sume un PDV a un cliente que ya tenía es raro: para eso
//                    está el Analizar de Clientes.
//
// Corre con el navegador OCULTO. El estado de la clave (validada / incorrecta) lo
// registra el observadorLogin, igual que cualquier otro login: acá solo se orquesta.

const puppeteerManager = require('../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginArca = require('../puppeteer/afip/archivosComunes/login/login_arca.js');
const { loginATM } = require('../puppeteer/atm/codigoXpagina/login_atm.js');
const empresaManager = require('../afip/empresa/empresaManager.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/** Mensajes para el usuario según el código del login (el resto, el mensaje original). */
function mensajeDe(resultado, canal) {
    const sitio = canal === 'atm' ? 'ATM' : 'AFIP';
    switch (resultado && resultado.error) {
        case 'INVALID_CREDENTIALS':
            return `${sitio} rechazó la clave. Revisala y probá de nuevo.`;
        case 'CAPTCHA_BLOQUEO':
            return 'AFIP pidió captcha (bloqueo temporal por IP, ~15 min). La clave quedó guardada sin validar: probala más tarde.';
        case 'TIMEOUT':
            return `${sitio} tardó demasiado en responder. La clave quedó guardada sin validar.`;
        default:
            return (resultado && resultado.message) || `No se pudo verificar la clave en ${sitio}.`;
    }
}

/**
 * @param {Object} repo
 * @param {string} cuit       el cliente objetivo (el resolver decide con qué clave se entra)
 * @param {'afip'|'atm'|'facturacion'} servicio
 * @returns {Promise<{success:boolean, error?:string, message:string}>}
 */
async function verificarClave(repo, cuit, servicio) {
    const canal = servicio === 'atm' ? 'atm' : 'afip';
    const acceso = await repo.resolverAcceso(String(cuit), canal);
    if (!acceso) return { success: false, error: 'SIN_ACCESO', message: 'El cliente no tiene clave cargada.' };

    const objetivo = await repo.getByCuit(String(cuit));
    const tienePdv = !!(objetivo && Array.isArray(objetivo.puntosDeVenta) && objetivo.puntosDeVenta.length > 0);
    const analizar = servicio === 'facturacion' && !tienePdv;

    let resultado;
    if (analizar) {
        resultado = await empresaManager.analizarContribuyente(repo, String(cuit), { visible: false });
    } else if (canal === 'atm') {
        resultado = await puppeteerManager.ejecutar(
            (browser, page) => loginATM(page, { cuit: acceso.loginCuit, clave: acceso.loginClave }),
            { headless: true });
    } else {
        resultado = await puppeteerManager.ejecutar(
            (browser, page) => loginArca.hacerLogin(page, URL_LOGIN_AFIP,
                { usuario: acceso.loginCuit, contrasena: acceso.loginClave }),
            { headless: true });
    }

    if (!resultado || !resultado.success) {
        return { success: false, error: resultado && resultado.error, message: mensajeDe(resultado, canal) };
    }

    if (analizar) {
        // La clave anda; ¿quedó con puntos de venta para facturar?
        const c = await repo.getByCuit(String(cuit));
        if (!c || !Array.isArray(c.puntosDeVenta) || c.puntosDeVenta.length === 0) {
            return {
                success: false, error: 'SIN_PDV',
                message: 'La clave anda, pero AFIP no muestra puntos de venta para este cliente: no se puede facturar.'
            };
        }
        return { success: true, message: `Clave verificada. ${c.puntosDeVenta.length} punto(s) de venta actualizados.` };
    }
    return { success: true, message: 'Clave verificada.' };
}

module.exports = { verificarClave, mensajeDe };
