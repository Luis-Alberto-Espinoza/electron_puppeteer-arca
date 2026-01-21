const puppeteerManager = require('../archivos_comunes/navegador/puppeteer-manager');
const { listarEmpresas } = require('../afip/archivosComunes/empresasDisponibles');
const { hacerLogin } = require('../afip/facturas/codigo/login/login_arca');
const { buscarEnAfip } = require('../afip/archivosComunes/buscadorAfip');
const { obtenerCuitsAsociados } = require('../afip/archivosComunes/obtenerCuitsAsociados');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Valida credenciales de AFIP, y si son correctas, extrae los puntos de venta.
 * @param {import('puppeteer').Page} page - IGNORADO (mantiene firma por compatibilidad)
 * @param {object} usuario El objeto de usuario que contiene CUIT y claveAFIP.
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function verificarYObtenerDatosAFIP(page, usuario) {
    console.log('    [AFIP] ==> Entrando a verificacion de credenciales');

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
            return { success: false, error: loginResult.message };
        }

        // 2. Verificar buscador AFIP
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

        // 3. Buscar comprobante en linea
        console.log('    [AFIP] -> Buscando comprobante en linea...');
        const newPage = await buscarEnAfip(loggedPage, 'compr', { esperarNuevaPestana: true });

        // 4. Listar empresas
        console.log('    [AFIP] -> Listando empresas disponibles...');
        const puntosDeVentaArray = await listarEmpresas(newPage);
        console.log(`    [AFIP] -> Empresas encontradas: ${puntosDeVentaArray.length}`);

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
            puntosDeVentaArray: puntosDeVentaArray
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
