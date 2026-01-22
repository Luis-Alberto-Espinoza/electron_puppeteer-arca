const verificarYObtenerDatosAFIP = require('../../puppeteer/verificaCredenciales/flujo_verificaCredenciales_AFIP.js');
const verificarCredencialesATM = require('../../puppeteer/atm/flujosDeTareas/flujo_verificaCredenciales_atm.js');

/**
 * Orquesta la validación de credenciales y la extracción de datos para un usuario.
 * Abre y cierra pestañas dedicadas para cada servicio (AFIP, ATM, etc.).
 * @param {import('puppeteer').Browser} browser La instancia del navegador Puppeteer.
 * @param {object} usuario El objeto de usuario a procesar.
 */
async function gestionarValidacion(browser, usuario, servicesToVerify = null) {
    console.log(`[MANAGER] ==> Entrando a gestionarValidacion para CUIT: ${usuario.cuit}`);

    // Determinar qué servicios verificar
    const allAvailableServices = [];
    if (usuario.claveAFIP) allAvailableServices.push('afip');
    if (usuario.claveATM) allAvailableServices.push('atm');

    const servicesToCheck = servicesToVerify || allAvailableServices;

    // Reiniciar estados de validación para los servicios que se van a chequear
    if (servicesToCheck.includes('afip')) {
        usuario.claveAfipValida = false;
        usuario.claveAfipRequiereActualizacion = false;
        usuario.errorAfip = null; // Limpiar error anterior
    }
    if (servicesToCheck.includes('atm')) {
        usuario.claveAtmValida = false;
        usuario.claveAtmRequiereActualizacion = false;
        usuario.claveAtmInvalida = false; // Estado limpio
        usuario.errorAtm = null; // Limpiar error anterior
    }

    // --- Flujo de AFIP ---
    if (servicesToCheck.includes('afip') && usuario.claveAFIP) {
        console.log('[MANAGER] -> Iniciando flujo AFIP...');
        const afipPage = await browser.newPage();
        try {
            const resultadoAFIP = await verificarYObtenerDatosAFIP(afipPage, usuario);
            if (resultadoAFIP.success) {
                usuario.claveAfipValida = true;
                usuario.errorAfip = null;
                if (resultadoAFIP.data && resultadoAFIP.data.puntosDeVentaArray) {
                    usuario.puntosDeVenta = resultadoAFIP.data.puntosDeVentaArray;
                    console.log(`  -> AFIP: Válido. Puntos de venta encontrados: ${usuario.puntosDeVenta.length}`);
                }
                // Agregar CUITs asociados si existen
                if (resultadoAFIP.data && resultadoAFIP.data.cuitAsociados) {
                    usuario.cuitAsociados = resultadoAFIP.data.cuitAsociados;
                    console.log(`  -> AFIP: CUITs asociados encontrados: ${usuario.cuitAsociados.length}`);
                }
            } else {
                usuario.claveAfipValida = false; // La clave no es válida para la automatización
                if (resultadoAFIP.error === 'UPDATE_PASSWORD_REQUIRED') {
                    usuario.claveAfipRequiereActualizacion = true;
                    usuario.errorAfip = 'Requiere actualización de contraseña';
                    console.log('  -> AFIP: Requiere actualización de contraseña.');
                } else {
                    usuario.errorAfip = resultadoAFIP.message || resultadoAFIP.error || 'Credenciales AFIP inválidas';
                    console.log(`  -> AFIP: Inválido o con errores.`);
                }
            }
            console.log('[MANAGER] <- Flujo AFIP terminado.');
        } catch (e) {
            console.error('Error catastrófico en el flujo AFIP:', e.message);
            usuario.claveAfipValida = false;
            usuario.errorAfip = `Error: ${e.message}`;
        } finally {
            await afipPage.close();
        }
    }

    // --- Flujo de ATM ---
    if (servicesToCheck.includes('atm') && usuario.claveATM) {
        console.log('[MANAGER] -> Iniciando flujo ATM...');
        const atmPage = await browser.newPage();
        try {
            const resultadoATM = await verificarCredencialesATM(atmPage, usuario.cuit, usuario.claveATM);
            if (resultadoATM.success) {
                usuario.claveAtmValida = true;
                usuario.errorAtm = null;
                console.log(`  -> ATM: Válido.`);
            } else {
                usuario.claveAtmValida = false;
                if (resultadoATM.error === 'UPDATE_PASSWORD_REQUIRED') {
                    usuario.claveAtmRequiereActualizacion = true;
                    usuario.errorAtm = 'Requiere actualización de contraseña';
                    console.log('  -> ATM: Requiere actualización de contraseña.');
                } else if (resultadoATM.error === 'INVALID_CREDENTIALS') {
                    usuario.claveAtmInvalida = true; // <-- ¡CAMBIO CLAVE!
                    usuario.errorAtm = 'CUIT o clave incorrectos';
                    console.log('  -> ATM: Credenciales incorrectas.');
                } else {
                    usuario.errorAtm = resultadoATM.message || resultadoATM.error || 'Error de validación ATM';
                    console.log(`  -> ATM: Inválido o con errores (${resultadoATM.error}).`);
                }
            }
            console.log('[MANAGER] <- Flujo ATM terminado.');
        } catch (e) {
            console.error('Error catastrófico en el flujo ATM:', e.message);
            usuario.claveAtmValida = false;
            usuario.errorAtm = `Error: ${e.message}`;
        } finally {
            await atmPage.close();
        }
    }
    console.log(`[MANAGER] <== Saliendo de gestionarValidacion para CUIT: ${usuario.cuit}`);

    // Marcar la fecha de la última vez que se intentó validar
    usuario.fechaModificacion = new Date().toISOString();
}

module.exports = { gestionarValidacion };
