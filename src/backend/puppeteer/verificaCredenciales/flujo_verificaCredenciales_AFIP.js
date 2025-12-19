const { elegirComprobanteEnLinea } = require('../elegirComprobanteEnLinea');
const { listarEmpresasDisponibles } = require('../listarEmpresasDisponibles');
const { hacerLogin } = require('../facturas/codigo/login/login_arca');

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
        console.log('    [AFIP] -> Eligiendo comprobante en línea...');
        const newPage = await elegirComprobanteEnLinea(loggedPage);

        // Llamada a la nueva función que solo lista las empresas
        console.log('    [AFIP] -> Listando empresas disponibles...');
        const puntosDeVentaArray = await listarEmpresasDisponibles(newPage);
        
        console.log(`    [AFIP] -> Empresas encontradas: ${puntosDeVentaArray.length}`);

        console.log('    [AFIP] <== Saliendo del worker con éxito.');
        return { 
            success: true, 
            data: { puntosDeVentaArray: puntosDeVentaArray } 
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

