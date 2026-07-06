const puppeteerManager = require('../archivos_comunes/navegador/puppeteer-manager');
const { listarEmpresas } = require('../afip/archivosComunes/empresasDisponibles');
const { hacerLogin } = require('../afip/archivosComunes/login/login_arca');
const { buscarEnAfip } = require('../afip/archivosComunes/buscadorAfip');
const { obtenerCuitsAsociados } = require('../afip/archivosComunes/obtenerCuitsAsociados');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Lee el nombre/razón social del titular logueado desde el encabezado del portal AFIP
 * (`#usernav > div`). Best-effort: si el selector no está o cambió, devuelve null y el
 * login sigue igual — el nombre es una comodidad para el alta, no un dato crítico.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<string|null>}
 */
async function leerNombreTitularAfip(page) {
    try {
        return await page.evaluate(() => {
            const el = document.querySelector('#usernav > div');
            if (!el) return null;
            let txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
            // Sacar el CUIT si viene pegado, incluyendo los corchetes/paréntesis que lo
            // envuelvan (ej. "APELLIDO NOMBRE [27-33461797-7]" -> "APELLIDO NOMBRE").
            // Si borramos solo los dígitos, quedan los corchetes vacíos "[]" en el nombre.
            txt = txt
                .replace(/[[(]?\s*\d{2}-?\d{8}-?\d\s*[\])]?/g, '') // CUIT con o sin corchetes/paréntesis
                .replace(/[[\]()]/g, '')                            // corchetes/paréntesis huérfanos
                .replace(/\s+/g, ' ')
                .trim();
            return txt || null;
        });
    } catch (_) {
        return null;
    }
}

/**
 * Valida credenciales de AFIP.
 *
 * Por default hace VALIDACIÓN COMPLETA: login + lista empresas + CUITs asociados.
 * Con `opciones.soloLogin === true` corta justo después del login exitoso
 * (modo "lite": solo confirma que las credenciales andan, sin scrapear nada).
 *
 * @param {import('puppeteer').Page} page - IGNORADO (mantiene firma por compatibilidad)
 * @param {object} usuario - { cuit, claveAFIP, ... }
 * @param {object} [opciones]
 * @param {boolean} [opciones.soloLogin=false]  si true, vuelve después del login
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function verificarYObtenerDatosAFIP(page, usuario, opciones = {}) {
    const { soloLogin = false } = opciones;
    console.log(`    [AFIP] ==> Entrando a verificacion de credenciales (soloLogin=${soloLogin})`);

    const { cuit, claveAFIP, nombreEmpresa } = usuario;
    if (!cuit || !claveAFIP) {
        return { success: false, error: "CUIT o claveAFIP no proporcionados." };
    }

    return await puppeteerManager.ejecutar(async (browser, loggedPage) => {
        // 1. Login
        console.log('    [AFIP] -> Iniciando login...');
        const loginResult = await hacerLogin(loggedPage, URL_LOGIN_AFIP, {
            usuario: cuit,
            contrasena: claveAFIP
        });

        if (!loginResult.success) {
            console.error('    [AFIP] -> El login fallo:', loginResult.message);
            // Propagar el CÓDIGO de error (no el mensaje), para que gestionarValidacion
            // pueda distinguir UPDATE_PASSWORD_REQUIRED y marcar requiere_actualizacion.
            return { success: false, error: loginResult.error, message: loginResult.message };
        }

        // 2. Verificar buscador AFIP (confirma que el login dejó al usuario adentro)
        console.log('    [AFIP] -> Login exitoso. Esperando buscador AFIP...');
        try {
            await loggedPage.waitForSelector('#buscadorInput', { timeout: 10000 });
            console.log('    [AFIP] -> Buscador AFIP detectado correctamente.');
        } catch (cambioClaveError) {
            const esCambioClave = await loggedPage.$('form[action*="cambioClaveForzado.xhtml"]');
            if (esCambioClave) {
                console.log('    [AFIP] -> Se detecto la pagina de cambio de clave forzado.');
                return { success: false, error: 'UPDATE_PASSWORD_REQUIRED' };
            }
            return { success: false, error: 'No se pudo detectar la pagina principal de AFIP tras el login' };
        }

        // Salida temprana modo lite: las credenciales son válidas, nada más que hacer.
        // Aprovechamos el login para leer el nombre del titular (comodidad del alta).
        if (soloLogin) {
            const nombre = await leerNombreTitularAfip(loggedPage);
            console.log(`    [AFIP] <== Modo soloLogin: credenciales OK${nombre ? ` (titular: ${nombre})` : ''}.`);
            return { success: true, data: { nombre } };
        }

        // 3. Buscar comprobante en linea
        console.log('    [AFIP] -> Buscando comprobante en linea...');
        const newPage = await buscarEnAfip(loggedPage, 'compr', { esperarNuevaPestana: true });

        // 4. Listar empresas (razones sociales asociadas al CUIT en AFIP)
        console.log('    [AFIP] -> Listando empresas disponibles...');
        const empresasArray = await listarEmpresas(newPage);
        console.log(`    [AFIP] -> Empresas encontradas: ${empresasArray.length}`);

        // 5. Buscar CUITs asociados
        console.log('    [AFIP] -> Volviendo a la pestana principal para buscar CUITs asociados...');
        let cuitAsociados = null;
        let ccmaPage = null;

        try {
            console.log('    [AFIP] -> Buscando CCMA en el buscador...');
            ccmaPage = await buscarEnAfip(loggedPage, 'ccma', {
                timeoutNuevaPestana: 10000,
                esperarNuevaPestana: true
            });

            cuitAsociados = await obtenerCuitsAsociados(ccmaPage);

            if (cuitAsociados && cuitAsociados.length > 0) {
                console.log(`    [AFIP] -> Se obtuvieron ${cuitAsociados.length} CUITs asociados`);
            } else {
                console.log('    [AFIP] -> No se encontraron CUITs asociados (no es pagina de seleccion)');
            }

        } catch (ccmaError) {
            console.log('    [AFIP] -> No se pudo obtener CUITs asociados:', ccmaError.message);
        } finally {
            if (ccmaPage && ccmaPage !== loggedPage) {
                try {
                    await ccmaPage.close();
                    console.log('    [AFIP] -> Pestana de CCMA cerrada');
                } catch (closeError) {
                    console.log('    [AFIP] -> Error al cerrar pestana CCMA:', closeError.message);
                }
            }
        }

        // 6. Preparar respuesta
        const responseData = {
            empresasArray: empresasArray
        };

        if (cuitAsociados && cuitAsociados.length > 0) {
            responseData.cuitAsociados = cuitAsociados;
        }

        console.log('    [AFIP] <== Saliendo con exito.');
        return {
            success: true,
            data: responseData
        };

    }, { headless: false });
}

module.exports = verificarYObtenerDatosAFIP;
