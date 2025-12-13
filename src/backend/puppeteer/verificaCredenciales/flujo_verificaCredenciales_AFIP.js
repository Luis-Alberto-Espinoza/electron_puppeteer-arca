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

        // Hacer clic y esperar el resultado (navegación exitosa, error, o cambio de clave)
        await page.click('#F1\\:btnIngresar');

        // Usar Promise.race para detectar qué ocurre primero
        const resultado = await Promise.race([
            // Opción 1: Navegación exitosa (el buscador aparece)
            page.waitForSelector('#buscadorInput', { timeout: 10000 })
                .then(() => ({ tipo: 'exitoso' }))
                .catch(() => null),

            // Opción 2: Formulario de cambio de clave
            page.waitForSelector('form[action*="cambioClaveForzado.xhtml"]', { timeout: 10000 })
                .then(() => ({ tipo: 'cambio_clave' }))
                .catch(() => null),

            // Opción 3: Mensaje de error en login
            page.waitForSelector('#F1\\:msg', { visible: true, timeout: 10000 })
                .then(async () => {
                    const errorText = await page.evaluate(() => {
                        const el = document.querySelector('#F1\\:msg');
                        return el ? el.textContent.trim() : null;
                    });
                    return { tipo: 'error', mensaje: errorText };
                })
                .catch(() => null)
        ]).then(res => res || { tipo: 'timeout' });

        // Procesar el resultado
        if (resultado.tipo === 'error') {
            console.log('    [AFIP] -> Error de login detectado:', resultado.mensaje);
            throw new Error(resultado.mensaje || 'Clave o usuario incorrecto');
        }

        if (resultado.tipo === 'cambio_clave') {
            console.log('    [AFIP] -> Se detectó la página de cambio de clave forzado.');
            throw new Error('UPDATE_PASSWORD_REQUIRED');
        }

        if (resultado.tipo === 'timeout') {
            console.log('    [AFIP] -> Timeout esperando respuesta del login');
            throw new Error('Timeout: La página de AFIP no respondió en el tiempo esperado');
        }

        // Si llegamos aquí, el login fue exitoso (resultado.tipo === 'exitoso')
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

