const verificarYObtenerDatosAFIP = require('./verificaCredenciales/flujo_verificaCredenciales.js');
const verificarCredencialesATM = require('./ATM/flujosDeTareas/flujo_verificaCredenciales_atm');

/**
 * Orquesta la validación de credenciales y la extracción de datos para un usuario.
 * Abre y cierra pestañas dedicadas para cada servicio (AFIP, ATM, etc.).
 * @param {import('puppeteer').Browser} browser La instancia del navegador Puppeteer.
 * @param {object} usuario El objeto de usuario a procesar.
 */
async function gestionarValidacion(browser, usuario) {
    console.log(`[MANAGER] ==> Entrando a gestionarValidacion para CUIT: ${usuario.cuit}`);

    // Reiniciar estados de validación
    usuario.claveAfipValida = false;
    usuario.claveAfipRequiereActualizacion = false;
    usuario.claveAtmValida = false;
    usuario.claveAtmRequiereActualizacion = false;
    usuario.claveAtmInvalida = false; // Estado limpio

    // --- Flujo de AFIP ---
    if (usuario.claveAFIP) {
        console.log('[MANAGER] -> Iniciando flujo AFIP...');
        const afipPage = await browser.newPage();
        try {
            const resultadoAFIP = await verificarYObtenerDatosAFIP(afipPage, usuario);
            if (resultadoAFIP.success) {
                usuario.claveAfipValida = true;
                if (resultadoAFIP.data && resultadoAFIP.data.puntosDeVentaArray) {
                    usuario.puntosDeVenta = resultadoAFIP.data.puntosDeVentaArray;
                    console.log(`  -> AFIP: Válido. Puntos de venta encontrados: ${usuario.puntosDeVenta.length}`);
                }
            } else {
                usuario.claveAfipValida = false; // La clave no es válida para la automatización
                if (resultadoAFIP.error === 'UPDATE_PASSWORD_REQUIRED') {
                    usuario.claveAfipRequiereActualizacion = true;
                    console.log('  -> AFIP: Requiere actualización de contraseña.');
                } else {
                    console.log(`  -> AFIP: Inválido o con errores.`);
                }
            }
            console.log('[MANAGER] <- Flujo AFIP terminado.');
        } catch (e) {
            console.error('Error catastrófico en el flujo AFIP:', e.message);
        } finally {
            await afipPage.close();
        }
    }

    // --- Flujo de ATM ---
    if (usuario.claveATM) {
        console.log('[MANAGER] -> Iniciando flujo ATM...');
        const atmPage = await browser.newPage();
        try {
            const resultadoATM = await verificarCredencialesATM(atmPage, usuario.cuit, usuario.claveATM);
            if (resultadoATM.success) {
                usuario.claveAtmValida = true;
                console.log(`  -> ATM: Válido.`);
            } else {
                usuario.claveAtmValida = false;
                if (resultadoATM.error === 'UPDATE_PASSWORD_REQUIRED') {
                    usuario.claveAtmRequiereActualizacion = true;
                    console.log('  -> ATM: Requiere actualización de contraseña.');
                } else if (resultadoATM.error === 'INVALID_CREDENTIALS') {
                    usuario.claveAtmInvalida = true; // <-- ¡CAMBIO CLAVE!
                    console.log('  -> ATM: Credenciales incorrectas.');
                } else {
                    console.log(`  -> ATM: Inválido o con errores (${resultadoATM.error}).`);
                }
            }
            console.log('[MANAGER] <- Flujo ATM terminado.');
        } catch (e) {
            console.error('Error catastrófico en el flujo ATM:', e.message);
            usuario.claveAtmValida = false;
        } finally {
            await atmPage.close();
        }
    }
    console.log(`[MANAGER] <== Saliendo de gestionarValidacion para CUIT: ${usuario.cuit}`);

    // Marcar la fecha de la última vez que se intentó validar
    usuario.fechaModificacion = new Date().toISOString();
}

module.exports = { gestionarValidacion };
