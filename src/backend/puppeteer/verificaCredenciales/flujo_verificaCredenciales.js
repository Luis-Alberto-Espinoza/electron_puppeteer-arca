const { elegirComprobanteEnLinea } = require('../elegirComprobanteEnLinea');
const { listarEmpresasDisponibles } = require('../listarEmpresasDisponibles');

/**
 * Valida credenciales de AFIP, y si son correctas, extrae los puntos de venta.
 * @param {import('puppeteer').Page} page La página de Puppeteer a utilizar.
 * @param {object} usuario El objeto de usuario que contiene CUIT y claveAFIP.
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function verificarYObtenerDatosAFIP(page, usuario) {
    console.log('    [AFIP] ==> Entrando a worker');
    try {
        const { cuit, claveAFIP, nombreEmpresa } = usuario;
        if (!cuit || !claveAFIP) {
            throw new Error("CUIT o claveAFIP no proporcionados.");
        }

        // 1. Ir a la página de login y autenticarse
        console.log('    [AFIP] -> Navegando a URL de login...');
        const url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
        await page.goto(url, { waitUntil: 'networkidle2' });
        console.log('        [DEBUG] page.goto OK');
        
        // PASO 1: Ingresar CUIT y hacer clic en Siguiente
        console.log('    [AFIP] -> Escribiendo CUIT...');
        await page.waitForSelector('#F1\\:username', { visible: true });
        // Triple clic para seleccionar y sobrescribir el contenido existente
        await page.click('#F1\\:username', { clickCount: 3 });
        await page.type('#F1\\:username', String(cuit));
        console.log('    [AFIP] -> Clic en Siguiente...');
        await Promise.all([
            page.click('#F1\\:btnSiguiente'),
            page.waitForNavigation({ waitUntil: 'networkidle2' })
        ]);

        // PASO 2: Ingresar Contraseña y hacer clic en Ingresar
        console.log('    [AFIP] -> Escribiendo Contraseña...');
        await page.waitForSelector('#F1\\:password', { visible: true });
        await page.type('#F1\\:password', String(claveAFIP));
        console.log('    [AFIP] -> Clic en Ingresar...');
        try {
            await Promise.all([
                page.click('#F1\\:btnIngresar'),
                page.waitForNavigation({ waitUntil: 'networkidle2' })
            ]);
        } catch (e) {
            // Si la navegación falla (timeout), es muy probable que sea por un error de login.
            // Buscamos el mensaje de error específico en la página para dar un reporte más claro.
            const errorLogin = await page.evaluate(() => {
                const el = document.querySelector('#F1\\:msg');
                return el ? el.textContent.trim() : null;
            });

            if (errorLogin) {
                throw new Error(errorLogin); // Lanzamos el error específico (ej: "Clave o usuario incorrecto")
            } else {
                throw e; // Si no hay mensaje, relanzamos el error original (ej: timeout)
            }
        }

        // Lógica de detección final: buscar el formulario de cambio de clave forzado.
        const cambioClaveFormSelector = 'form[action*="cambioClaveForzado.xhtml"]';
        const formHandle = await page.$(cambioClaveFormSelector);

        if (formHandle) {
            // Si el formulario existe, sabemos que se requiere actualizar la clave.
            console.log('    [AFIP] -> Se detectó la página de cambio de clave forzado.');
            throw new Error('UPDATE_PASSWORD_REQUIRED');
        }

        // Si no se encontró el formulario, el login fue un éxito total.
        console.log('    [AFIP] -> Login exitoso.');
        console.log('    [AFIP] -> Login exitoso.');

        // 2. Navegar y extraer datos (lógica original)
        console.log('    [AFIP] -> Eligiendo comprobante en línea...');
        const newPage = await elegirComprobanteEnLinea(page);

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
    }
}

module.exports = verificarYObtenerDatosAFIP;

