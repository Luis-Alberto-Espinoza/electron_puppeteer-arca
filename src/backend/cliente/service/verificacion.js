const verificarYObtenerDatosAFIP = require('../../puppeteer/verificaCredenciales/flujo_verificaCredenciales_AFIP.js');
const verificarCredencialesATM = require('../../puppeteer/atm/flujosDeTareas/flujo_verificaCredenciales_atm.js');
const { crearEmpresa } = require('../model.js');

/**
 * Orquesta la validación de credenciales y la extracción de datos para un usuario.
 * Corre los servicios EN SERIE: cada flujo (AFIP, ATM) abre y cierra su propio
 * navegador de punta a punta, así nunca hay dos ventanas abiertas al mismo tiempo.
 *
 * @param {object} usuario El objeto de usuario a procesar.
 * @param {Array<string>|null} servicesToVerify Servicios a chequear; null = todos los disponibles.
 * @param {object} [opciones]
 * @param {boolean} [opciones.soloLogin=false] Si true, AFIP solo valida login sin scrapear empresas.
 *                                             En este modo NO se reescribe usuario.empresas.
 * @param {boolean} [opciones.visible] false = navegadores (AFIP y ATM) ocultos; si no llega, visibles.
 */
async function gestionarValidacion(usuario, servicesToVerify = null, opciones = {}) {
    const { soloLogin = false, visible } = opciones;
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
        usuario.claveAfipBloqueadaCaptcha = false; // No verificado por captcha (no es inválido)
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
        try {
            // El flujo AFIP abre y cierra su propio navegador (no recibe page).
            const resultadoAFIP = await verificarYObtenerDatosAFIP(null, usuario, { soloLogin, visible });
            if (resultadoAFIP.success) {
                usuario.claveAfipValida = true;
                usuario.errorAfip = null;

                // Nombre del titular (comodidad del alta). AFIP tiene prioridad sobre ATM.
                if (resultadoAFIP.data && resultadoAFIP.data.nombre) {
                    usuario.nombreDetectado = resultadoAFIP.data.nombre;
                }

                if (soloLogin) {
                    // Modo lite: solo confirmamos credenciales, no tocamos empresas[]
                    // ni cuitAsociados. El scraping pesado lo hace "Analizar cliente".
                    console.log('  -> AFIP: Válido (modo lite, sin scraping de empresas).');
                } else {
                    // Modo completo: refrescar empresas[] preservando PDV cacheados
                    // de empresas previas que sigan en AFIP.
                    const empresasAfip = (resultadoAFIP.data && Array.isArray(resultadoAFIP.data.empresasArray))
                        ? resultadoAFIP.data.empresasArray
                        : [];
                    const empresasPrevias = Array.isArray(usuario.empresas) ? usuario.empresas : [];
                    usuario.empresas = empresasAfip.map(razonSocial => {
                        const previa = empresasPrevias.find(e =>
                            e.razonSocial && e.razonSocial.trim().toLowerCase() === String(razonSocial).trim().toLowerCase()
                        );
                        return previa || crearEmpresa({ razonSocial });
                    });
                    console.log(`  -> AFIP: Válido. Empresas encontradas: ${usuario.empresas.length}`);
                    if (resultadoAFIP.data && resultadoAFIP.data.cuitAsociados) {
                        usuario.cuitAsociados = resultadoAFIP.data.cuitAsociados;
                        console.log(`  -> AFIP: CUITs asociados encontrados: ${usuario.cuitAsociados.length}`);
                    }
                }
            } else {
                usuario.claveAfipValida = false; // La clave no es válida para la automatización
                if (resultadoAFIP.error === 'UPDATE_PASSWORD_REQUIRED') {
                    usuario.claveAfipRequiereActualizacion = true;
                    usuario.errorAfip = 'Requiere actualización de contraseña';
                    console.log('  -> AFIP: Requiere actualización de contraseña.');
                } else if (resultadoAFIP.error === 'CAPTCHA_BLOQUEO') {
                    // AFIP pidió captcha (bloqueo temporal por IP). NO es clave inválida:
                    // marcamos distinto para no condenar credenciales que pueden ser buenas.
                    usuario.claveAfipBloqueadaCaptcha = true;
                    usuario.errorAfip = resultadoAFIP.message || 'AFIP pidió captcha (bloqueo temporal). No se pudo verificar.';
                    console.log('  -> AFIP: Bloqueado por captcha. No es inválido; queda para reintentar.');
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
        }
    }

    // --- Flujo de ATM ---
    if (servicesToCheck.includes('atm') && usuario.claveATM) {
        console.log('[MANAGER] -> Iniciando flujo ATM...');
        try {
            // El flujo ATM abre y cierra su propio navegador (no recibe page).
            const resultadoATM = await verificarCredencialesATM(null, usuario.cuit, usuario.claveATM, { visible });
            if (resultadoATM.success) {
                usuario.claveAtmValida = true;
                usuario.errorAtm = null;
                // Nombre solo si AFIP no lo trajo (AFIP tiene prioridad).
                if (!usuario.nombreDetectado && resultadoATM.nombre) {
                    usuario.nombreDetectado = resultadoATM.nombre;
                }
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
        }
    }
    console.log(`[MANAGER] <== Saliendo de gestionarValidacion para CUIT: ${usuario.cuit}`);

    // Marcar la fecha de la última vez que se intentó validar
    usuario.fechaModificacion = new Date().toISOString();
}

module.exports = { gestionarValidacion };
