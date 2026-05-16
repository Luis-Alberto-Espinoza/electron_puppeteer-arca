/**
 * Manager de operaciones de Empresa (sobre datos del cliente).
 *
 * Hoy expone:
 *   - descubrirPuntosDeVenta(usuarioId, razonSocial)
 *       → navega AFIP, lee el <select id="puntodeventa">,
 *         persiste el resultado en cliente.empresas[i].puntosDeVenta
 *         y devuelve la lista normalizada.
 *
 * No conoce de IPC ni de Electron; recibe `userStorage` por inyección.
 */

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager     = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const { ejecutarFlujoDescubrirPuntosDeVenta } = require('../../puppeteer/afip/empresa/flujo_descubrirPuntosDeVenta.js');
const { normalizarPuntoDeVenta, getEmpresaPorRazonSocial } = require('../../cliente/model.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Parsea una opción cruda del <select id="puntodeventa"> de AFIP.
 *
 *   value: "1" o "00001" (número crudo)
 *   text:  "00001 - Casa Central" | "00001" | "00001-Sucursal"
 *
 * Devuelve { numero, descripcion } pasado por la normalización del modelo
 * (numero queda como string padStart-5).
 *
 * @param {{value:string, text:string}} opcion
 * @returns {{numero:string, descripcion:string|null}|null}
 */
function parsearOpcionPdv(opcion) {
    const valueLimpio = String(opcion.value || '').trim();
    if (!valueLimpio) return null;

    // Extraer descripción del texto visible, si difiere del número.
    const textLimpio = String(opcion.text || '').trim();
    let descripcion = null;
    // Patrón "00001 - Casa Central" o "00001-Casa Central" o "1 Casa Central"
    const m = textLimpio.match(/^\s*\d+\s*[-–:\s]\s*(.+?)\s*$/);
    if (m && m[1]) {
        const candidato = m[1].trim();
        // Si la descripción es sólo el mismo número repetido, descartar
        if (!/^\d+$/.test(candidato)) descripcion = candidato;
    }

    return normalizarPuntoDeVenta({ numero: valueLimpio, descripcion });
}

/**
 * Persiste el resultado del descubrimiento en el JSON.
 * Aplica `normalizarCliente` indirectamente vía `saveData`.
 *
 * @param {Object} userStorage
 * @param {string|number} usuarioId
 * @param {string} razonSocial
 * @param {Array<{numero:string, descripcion:string|null}>} puntosDeVenta
 * @returns {string} ISO timestamp de la actualización
 */
function persistirPuntosDeVenta(userStorage, usuarioId, razonSocial, puntosDeVenta) {
    const data = userStorage.loadData();
    const usuario = data.users.find(u => String(u.id) === String(usuarioId));
    if (!usuario) throw new Error(`Usuario id=${usuarioId} no encontrado al persistir pdv`);

    const empresa = getEmpresaPorRazonSocial(usuario, razonSocial);
    if (!empresa) throw new Error(`Empresa "${razonSocial}" no encontrada en usuario ${usuarioId}`);

    const ahora = new Date().toISOString();
    empresa.puntosDeVenta = puntosDeVenta;
    empresa.puntosDeVentaActualizados = ahora;

    userStorage.saveData(data);
    return ahora;
}

/**
 * Descubre los puntos de venta de una empresa.
 *
 * @param {Object} userStorage           - inyectado, instancia de JsonStorage
 * @param {string|number} usuarioId
 * @param {string} razonSocial
 * @returns {Promise<{success:true, data:{razonSocial:string, puntosDeVenta:Array, puntosDeVentaActualizados:string}} | {success:false, error:string, message:string}>}
 */
async function descubrirPuntosDeVenta(userStorage, usuarioId, razonSocial) {
    console.log('🔵 [EmpresaManager] descubrirPuntosDeVenta', { usuarioId, razonSocial });

    const data = userStorage.loadData();
    const usuario = data.users.find(u => String(u.id) === String(usuarioId));
    if (!usuario) {
        return { success: false, error: 'USER_NOT_FOUND', message: 'No se encontró el usuario.' };
    }

    if (!getEmpresaPorRazonSocial(usuario, razonSocial)) {
        return { success: false, error: 'EMPRESA_NOT_FOUND', message: `La empresa "${razonSocial}" no está en el cliente.` };
    }

    const credenciales = {
        usuario: usuario.cuit,
        contrasena: usuario.claveAFIP || usuario.clave,
        nombreEmpresa: razonSocial
    };

    return await puppeteerManager.ejecutar(async (browser, page) => {
        console.log('🔵 [EmpresaManager] Login en AFIP...');
        const loginResult = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);
        if (!loginResult.success) {
            return { success: false, error: 'LOGIN_FAILED', message: loginResult.message };
        }

        console.log('🔵 [EmpresaManager] Ejecutando flujo de descubrimiento...');
        const opcionesCrudas = await ejecutarFlujoDescubrirPuntosDeVenta(page, razonSocial);

        // Normalizar al modelo {numero, descripcion}
        const puntosDeVenta = opcionesCrudas
            .map(parsearOpcionPdv)
            .filter(Boolean);

        // Persistir en el JSON
        const ts = persistirPuntosDeVenta(userStorage, usuarioId, razonSocial, puntosDeVenta);

        console.log(`✅ [EmpresaManager] ${puntosDeVenta.length} pdv guardado(s) en ${razonSocial}.`);
        return {
            success: true,
            data: {
                razonSocial,
                puntosDeVenta,
                puntosDeVentaActualizados: ts
            }
        };

    }, { headless: false });
}

module.exports = {
    descubrirPuntosDeVenta,
    // Exportados para tests:
    parsearOpcionPdv
};
