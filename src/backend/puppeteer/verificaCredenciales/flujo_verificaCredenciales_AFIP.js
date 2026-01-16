const { listarEmpresas } = require('../empresasDisponibles');
const { hacerLogin } = require('../facturas/codigo/login/login_arca');
const { buscarEnAfip } = require('../buscadorAfip');
const { obtenerCuitsAsociados } = require('../obtenerCuitsAsociados');

/**
 * Valida credenciales de AFIP, y si son correctas, extrae los puntos de venta.
 * @param {import('puppeteer').Page} page La página de Puppeteer a utilizar.
 * @param {object} usuario El objeto de usuario que contiene CUIT y claveAFIP.
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function verificarYObtenerDatosAFIP(page, usuario) {
    console.log('    [AFIP] ==> Entrando a worker');
    let browser;
    try {
        const { cuit, claveAFIP, nombreEmpresa } = usuario;
        if (!cuit || !claveAFIP) {
            throw new Error("CUIT o claveAFIP no proporcionados.");
        }

        // 1. Usar la función compartida de login
        console.log('    [AFIP] -> Iniciando login...');
        const url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
        const loginResult = await hacerLogin(url, {
            usuario: cuit,
            contrasena: claveAFIP
        }, { headless: false }); // Ajusta headless según necesites

        // 2. Verificar si el login fue exitoso
        if (!loginResult.success) {
            console.error('    [AFIP] -> El login falló:', loginResult.message);

            // Mapear errores específicos de login_arca a errores de AFIP
            let errorMessage = loginResult.message;
            if (loginResult.error === 'INVALID_CUIT') {
                errorMessage = loginResult.message; // "Número de CUIL/CUIT incorrecto"
            } else if (loginResult.error === 'INVALID_CREDENTIALS') {
                errorMessage = loginResult.message; // Error de contraseña
            }

            throw new Error(errorMessage);
        }

        // 3. Desestructurar page y browser del resultado exitoso
        const { page: loggedPage, browser: b } = loginResult;
        browser = b;

        // IMPORTANTE: Verificar si necesitamos esperar el buscador (específico de AFIP)
        // El login_arca espera la navegación, pero AFIP puede requerir esperar elementos específicos
        console.log('    [AFIP] -> Login exitoso. Esperando buscador AFIP...');
        try {
            await loggedPage.waitForSelector('#buscadorInput', { timeout: 10000 });
            console.log('    [AFIP] -> Buscador AFIP detectado correctamente.');
        } catch (cambioClaveError) {
            // Verificar si es la página de cambio de clave forzado
            const esCambioClave = await loggedPage.$('form[action*="cambioClaveForzado.xhtml"]');
            if (esCambioClave) {
                console.log('    [AFIP] -> Se detectó la página de cambio de clave forzado.');
                throw new Error('UPDATE_PASSWORD_REQUIRED');
            }
            throw new Error('No se pudo detectar la página principal de AFIP tras el login');
        }

        // 4. Navegar y extraer datos (lógica original)
        console.log('    [AFIP] -> Buscando comprobante en línea...');
        const newPage = await buscarEnAfip(loggedPage, 'compr', { esperarNuevaPestana: true });

        // Llamada a la nueva función que solo lista las empresas
        console.log('    [AFIP] -> Listando empresas disponibles...');
        const puntosDeVentaArray = await listarEmpresas(newPage);

        console.log(`    [AFIP] -> Empresas encontradas: ${puntosDeVentaArray.length}`);

        // 5. Volver a la pestaña principal para buscar CUITs asociados
        console.log('    [AFIP] -> Volviendo a la pestaña principal para buscar CUITs asociados...');
        let cuitAsociados = null;
        let ccmaPage = null;

        try {
            // Usar el buscador para acceder a CCMA
            console.log('    [AFIP] -> Buscando CCMA en el buscador...');
            ccmaPage = await buscarEnAfip(loggedPage, 'ccma', {
                timeoutNuevaPestana: 10000,
                esperarNuevaPestana: true
            });

            // Intentar obtener los CUITs asociados
            cuitAsociados = await obtenerCuitsAsociados(ccmaPage);

            if (cuitAsociados && cuitAsociados.length > 0) {
                console.log(`    [AFIP] -> Se obtuvieron ${cuitAsociados.length} CUITs asociados`);
            } else {
                console.log('    [AFIP] -> No se encontraron CUITs asociados (no es página de selección)');
            }

        } catch (ccmaError) {
            console.log('    [AFIP] -> No se pudo obtener CUITs asociados:', ccmaError.message);
            // No es crítico, continuar sin CUITs asociados
        } finally {
            // Cerrar la pestaña de CCMA si se abrió y es diferente a loggedPage
            if (ccmaPage && ccmaPage !== loggedPage) {
                try {
                    await ccmaPage.close();
                    console.log('    [AFIP] -> Pestaña de CCMA cerrada');
                } catch (closeError) {
                    console.log('    [AFIP] -> Error al cerrar pestaña CCMA:', closeError.message);
                }
            }
        }

        // 6. Preparar respuesta con los datos obtenidos
        const responseData = {
            puntosDeVentaArray: puntosDeVentaArray
        };

        // Agregar CUITs asociados solo si existen
        if (cuitAsociados && cuitAsociados.length > 0) {
            responseData.cuitAsociados = cuitAsociados;
        }

        console.log('    [AFIP] <== Saliendo del worker con éxito.');
        return {
            success: true,
            data: responseData
        };

    } catch (error) {
        console.error(`    [AFIP] ERROR: ${error.message}`);
        return { success: false, error: error.message || "Error desconocido en flujo AFIP." };
    } finally {
        // Cerrar el navegador si fue creado por hacerLogin
        if (browser) {
            console.log('    [AFIP] -> Cerrando navegador...');
            await browser.close();
        }
    }
}

module.exports = verificarYObtenerDatosAFIP;

