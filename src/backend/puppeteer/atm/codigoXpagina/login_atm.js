const observadorLogin = require('../../archivos_comunes/login/observadorLogin.js');

/**
 * Acepta un dialog nativo sin romper el flujo si ya fue manejado.
 * Un dialog solo puede aceptarse una vez: si otro listener llegó primero (o la página
 * ya navegó), accept() tira "Cannot accept dialog which is already handled!" y, dentro
 * de un handler async, eso termina en un unhandled rejection.
 * @param {import('puppeteer').Dialog} dialog
 */
async function aceptarDialog(dialog) {
    try {
        await dialog.accept();
    } catch (err) {
        console.log(`⚠️ [loginATM] No se pudo aceptar el dialog (probablemente ya manejado): ${err.message}`);
    }
}

/**
 * Escribe un valor en un input y VERIFICA que haya quedado completo, reintentando si no.
 *
 * Por qué: waitForSelector({visible:true}) garantiza que el campo está pintado, no que el
 * JS de la página ya terminó de engancharse. El input #cuit de ATM tiene una máscara que se
 * bindea al terminar de cargar; si tipeamos antes de que esté lista (o más rápido de lo que
 * procesa), se come las primeras teclas y el CUIT queda con 9 dígitos: el login falla sin
 * decir por qué. Dormir más es frágil (en una máquina lenta vuelve); leer el value de vuelta
 * es determinista.
 *
 * OJO con la comparación: esa misma máscara reformatea 30618222302 → "30-61822230-2". Por eso
 * `normalizar` permite comparar ignorando el formato (para el CUIT, solo los dígitos).
 *
 * @param {import('puppeteer').Page} page
 * @param {string} selector
 * @param {string} valor
 * @param {string} etiqueta - Nombre para los logs (no se loguea el valor si es sensible).
 * @param {{ sensible?: boolean, intentos?: number, normalizar?: (v: string) => string }} [opciones]
 * @returns {Promise<boolean>} true si el campo quedó con el valor esperado.
 */
async function escribirVerificado(page, selector, valor, etiqueta, opciones = {}) {
    const { sensible = false, intentos = 3, normalizar = (v) => v } = opciones;
    const texto = String(valor);
    const esperado = normalizar(texto);
    const paraLog = sensible ? `(${texto.length} caracteres)` : texto;
    const mostrar = (v) => (sensible ? `(${v.length} caracteres)` : `"${v}"`);

    for (let intento = 1; intento <= intentos; intento++) {
        // Limpiamos por JS en vez de triple-clic + Backspace: si el clic llega antes de que
        // el campo esté interactivo, la selección no ocurre y el Backspace no borra nada.
        await page.$eval(selector, el => {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.focus(selector);
        await page.type(selector, texto, { delay: 30 });

        const quedo = await page.$eval(selector, el => el.value);
        if (normalizar(quedo) === esperado) {
            if (intento > 1) {
                console.log(`✅ [loginATM] ${etiqueta} escrito OK en el intento ${intento}`);
            }
            return true;
        }

        console.warn(
            `⚠️ [loginATM] ${etiqueta} quedó incompleto (intento ${intento}/${intentos}): ` +
            `esperado ${paraLog}, quedó ${mostrar(quedo)}`
        );
        // La página todavía estaba inicializándose: le damos aire antes de reintentar.
        await new Promise(resolve => setTimeout(resolve, 400));
    }

    // Último recurso: asignamos el value directo y avisamos a la página con los eventos que
    // escucharía un tipeo real. Menos fiel que teclear, pero mejor que mandar un CUIT roto.
    console.warn(`⚠️ [loginATM] ${etiqueta}: agotados los reintentos de tipeo, asignando por JS`);
    await page.$eval(selector, (el, v) => {
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, texto);

    const quedoFinal = await page.$eval(selector, el => el.value);
    if (normalizar(quedoFinal) !== esperado) {
        console.error(
            `❌ [loginATM] ${etiqueta}: no se pudo completar el campo ni por JS ` +
            `(quedó ${mostrar(quedoFinal)})`
        );
        return false;
    }
    return true;
}

/**
 * Traduce los errores técnicos de Puppeteer (en inglés) a un mensaje que el usuario entienda.
 * Si no reconoce el error, devuelve el original: mejor un mensaje técnico que uno inventado.
 * @param {Error} error
 * @returns {string}
 */
function mensajeErrorLogin(error) {
    const msg = String((error && error.message) || error || '');
    if (/detached|Execution context was destroyed/i.test(msg)) {
        return 'La página de ATM se recargó en medio del login. Probá de nuevo; si se repite, revisá la clave.';
    }
    if (/Target closed|Session closed|Protocol error|browser has disconnected/i.test(msg)) {
        return 'Se cerró el navegador antes de terminar el login.';
    }
    if (/timeout|timed out/i.test(msg)) {
        return 'ATM tardó demasiado en responder. Probá de nuevo en un rato.';
    }
    if (/net::ERR_/i.test(msg)) {
        return 'No se pudo conectar con ATM. Revisá la conexión a internet.';
    }
    return msg;
}

/** Deja solo los dígitos: sirve para comparar contra un campo con máscara (30-61822230-2). */
const soloDigitos = (v) => String(v).replace(/\D/g, '');

/**
 * Maneja el modal de actualización de email que puede aparecer después del login
 * @param {import('puppeteer').Page} page - La instancia de la página de Puppeteer.
 * @returns {Promise<string>} 'OK' si se manejó correctamente o no apareció, 'ERROR' si falló
 */
async function manejarModalActualizacionEmail(page) {
    try {
        console.log('[manejarModalActualizacionEmail] Verificando si existe modal de email...');

        // No dormimos a ciegas: el login ya navegó con networkidle2, así que si el modal
        // va a aparecer, aparece enseguida. waitForFunction sondea solo (cada ~100ms) y
        // corta apenas lo ve. Si no aparece, el timeout corto es el único costo.
        const TIMEOUT_MODAL = 2500; // antes 3000ms fijos + 7000ms de timeout
        let btnPostergar = null;

        try {
            // Esperar a que el modal esté visible usando evaluación del display
            console.log('[manejarModalActualizacionEmail] Esperando modal con id "divMisTramitesConfirmarEmails"...');

            await page.waitForFunction(
                () => {
                    const modal = document.getElementById('divMisTramitesConfirmarEmails');
                    if (!modal) return false;
                    const style = window.getComputedStyle(modal);
                    return style.display === 'block' && style.visibility !== 'hidden';
                },
                { timeout: TIMEOUT_MODAL }
            );

            console.log('✅ [manejarModalActualizacionEmail] Modal de emails detectado como visible');

            // Esperar un poco más para que el modal termine de renderizarse
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Buscar el botón "Postergar" de forma más simple
            console.log('[manejarModalActualizacionEmail] Buscando botón "Postergar"...');

            // Intentar múltiples estrategias de búsqueda
            btnPostergar = await page.evaluateHandle(() => {
                // Buscar dentro del modal específico
                const modal = document.getElementById('divMisTramitesConfirmarEmails');
                if (!modal) {
                    console.log('[DEBUG] Modal no encontrado por ID');
                    return null;
                }

                // Buscar todos los botones dentro del modal
                const botones = modal.querySelectorAll('button');
                console.log(`[DEBUG] Botones encontrados en modal: ${botones.length}`);

                for (const btn of botones) {
                    console.log(`[DEBUG] Botón texto: "${btn.textContent.trim()}"`);
                    if (btn.textContent.includes('Postergar')) {
                        console.log('[DEBUG] ¡Botón Postergar encontrado!');
                        return btn;
                    }
                }

                console.log('[DEBUG] Botón Postergar NO encontrado');
                return null;
            });

            // Verificar si se encontró el botón
            const encontrado = await btnPostergar.evaluate(btn => btn !== null);
            if (encontrado) {
                console.log('✅ [manejarModalActualizacionEmail] Botón "Postergar" encontrado');
            } else {
                console.warn('⚠️ [manejarModalActualizacionEmail] Modal visible pero botón "Postergar" no encontrado');
                btnPostergar = null;
            }

        } catch (timeoutError) {
            // No apareció el modal, es normal
            console.log('[manejarModalActualizacionEmail] No apareció modal de email (timeout - esto es normal)');
            console.log('[manejarModalActualizacionEmail] Error detalle:', timeoutError.message);
            return 'OK';
        }

        // Si encontramos el botón, hacer clic
        if (btnPostergar) {
            console.log('👆 [manejarModalActualizacionEmail] Haciendo clic en "Postergar"...');

            // Verificar que el botón sea visible y clicable
            const esVisible = await btnPostergar.evaluate(btn => {
                const rect = btn.getBoundingClientRect();
                const style = window.getComputedStyle(btn);
                return rect.width > 0 &&
                       rect.height > 0 &&
                       style.display !== 'none' &&
                       style.visibility !== 'hidden';
            });

            if (!esVisible) {
                console.warn('⚠️ [manejarModalActualizacionEmail] El botón existe pero no es visible');
                return 'ERROR';
            }

            // Hacer clic en el botón
            await btnPostergar.click();
            console.log('✅ [manejarModalActualizacionEmail] Clic en "Postergar" ejecutado');

            // Esperar a que el modal se cierre
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Verificar que el modal se cerró
            const modalCerrado = await page.evaluate(() => {
                const botones = Array.from(document.querySelectorAll('button'));
                const btnPostergar = botones.find(btn => btn.textContent.includes('Postergar'));
                if (!btnPostergar) return true; // El botón ya no existe, modal cerrado

                const style = window.getComputedStyle(btnPostergar);
                return style.display === 'none' || style.visibility === 'hidden';
            });

            if (modalCerrado) {
                console.log('✅ [manejarModalActualizacionEmail] Modal cerrado exitosamente');
                return 'OK';
            } else {
                console.warn('⚠️ [manejarModalActualizacionEmail] El modal podría no haberse cerrado completamente');
                return 'OK'; // Continuamos de todos modos
            }
        }

        console.log('[manejarModalActualizacionEmail] No se detectó modal de email');
        return 'OK';

    } catch (error) {
        console.error('❌ [manejarModalActualizacionEmail] Error inesperado:', error.message);
        console.error('Stack:', error.stack);
        // No bloqueamos el flujo por este error
        return 'OK';
    }
}

/**
 * Inicia sesión en la plataforma ATM de AFIP con detección múltiple de ventanas emergentes
 * @param {import('puppeteer').Page} page - La instancia de la página de Puppeteer.
 * @param {Object} credencialesATM - Las credenciales del usuario.
 */
async function loginATMSinAviso(page, credencialesATM) {
    const { cuit, clave } = credencialesATM;
    const url = 'https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp';

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.waitForSelector('#cuit', { visible: true });
        console.log(`[loginATM] Iniciando login para CUIT: ${cuit}`);

        // El campo está pintado pero la página puede seguir inicializándose y comerse las
        // primeras teclas; por eso escribimos verificando el resultado (ver escribirVerificado).
        // El campo aplica máscara (30-61822230-2), así que comparamos solo los dígitos.
        const cuitOk = await escribirVerificado(page, '#cuit', cuit, 'CUIT', { normalizar: soloDigitos });
        if (!cuitOk) {
            return {
                success: false,
                error: 'CAMPO_INCOMPLETO',
                message: 'No se pudo escribir el CUIT completo en el formulario de ATM'
            };
        }
        console.log(`[loginATM] CUIT ingresado: ${cuit}`);

        const claveOk = await escribirVerificado(page, '#password', clave, 'Contraseña', { sensible: true });
        if (!claveOk) {
            return {
                success: false,
                error: 'CAMPO_INCOMPLETO',
                message: 'No se pudo escribir la contraseña completa en el formulario de ATM'
            };
        }
        console.log(`[loginATM] Contraseña ingresada`);

        // Preparamos la "carrera" de promesas.
        // Con clave incorrecta ATM muestra un alert y RECARGA la página: esa recarga hace fallar
        // waitForNavigation con "Navigating frame was detached". Si la dejábamos rechazar, le ganaba
        // la carrera al diálogo y el usuario veía ese error en inglés en vez de "clave incorrecta".
        // Por eso la navegación nunca rechaza: devuelve { errorNavegacion } y se decide abajo.
        const navigationPromise = page
            .waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })
            .then(() => null, (err) => ({ errorNavegacion: err }));

        // Guardamos la referencia al handler para poder desregistrarlo si gana la navegación:
        // si queda vivo, atrapa diálogos de pasos posteriores (ej: el del cambio de clave).
        // OJO: usamos page.on (no page.once). Puppeteer registra los once() con un wrapper
        // interno, así que page.off(evt, nuestroHandler) NO lo encuentra y no lo remueve.
        // Con page.on, el handler queda bajo su propia referencia y el off del finally sí lo saca.
        let loginDialogHandler;
        let resultadoDialogo = null;
        const dialogPromise = new Promise(resolve => {
            loginDialogHandler = async dialog => {
                console.log('🚨 [loginATM] Dialog nativo detectado:', dialog.message());
                // Resolvemos ANTES de aceptar: aceptar dispara la recarga de la página, y el
                // resultado del diálogo tiene que quedar registrado antes de que eso pase.
                resultadoDialogo = { success: false, error: 'INVALID_CREDENTIALS', message: dialog.message() };
                resolve(resultadoDialogo);
                await aceptarDialog(dialog);
            };
            page.on('dialog', loginDialogHandler);
        });
        await page.click('#ingresar');

        console.log('[loginATM] Esperando resultado de la carrera: navegación vs. diálogo...');

        // El resultado será lo que resuelva primero: la navegación o el diálogo
        let result;
        try {
            result = await Promise.race([
                navigationPromise,
                dialogPromise
            ]);
        } finally {
            // Gane quien gane, el listener de la carrera ya cumplió su función
            page.off('dialog', loginDialogHandler);
        }

        // La navegación falló (típico: la recarga tras el alert de clave incorrecta).
        // Le damos un instante al diálogo por si todavía no se registró; si apareció, manda él.
        if (result && result.errorNavegacion) {
            const dialogoTardio = resultadoDialogo || await Promise.race([
                dialogPromise,
                new Promise(resolve => setTimeout(() => resolve(null), 1500))
            ]);
            if (dialogoTardio) {
                console.log(`🔴 [loginATM] Navegación cortada por el diálogo: ${dialogoTardio.message}`);
                return dialogoTardio;
            }
            throw result.errorNavegacion;
        }

        // Si el diálogo ganó, 'result' será el objeto de error y lo retornamos
        if (result && result.error) {
            console.log(`🔴 [loginATM] La carrera la ganó el diálogo: ${result.error}`);
            return result;
        }

        console.log('[loginATM] La carrera la ganó la navegación. Analizando página de destino...');

        // Si la navegación ganó, analizamos si la página pide actualizar contraseña
        const updatePasswordSelector = '//p[contains(text(), "Su contraseña ha expirado")]';
        const updatePasswordInfo = await page.evaluate((selector) => {
            const element = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            return element ? { text: element.textContent.trim() } : null;
        }, updatePasswordSelector);

        if (updatePasswordInfo) {
            console.log('🟡 [loginATM] Se requiere actualización de contraseña. Procediendo a cambiarla automáticamente...');

            try {
                // Esperar a que los campos estén disponibles
                await page.waitForSelector('#claveAnterior', { visible: true, timeout: 5000 });
                console.log('[loginATM] Campos de cambio de contraseña encontrados');

                // Completar los 3 campos con la misma contraseña actual (verificando: esta
                // pantalla también recién terminó de cargar y puede perder las primeras teclas)
                const camposClave = [
                    ['#claveAnterior', 'Contraseña anterior'],
                    ['#nuevaClave', 'Nueva contraseña'],
                    ['#confirmacionClave', 'Confirmación de contraseña']
                ];
                for (const [selector, etiqueta] of camposClave) {
                    const ok = await escribirVerificado(page, selector, clave, etiqueta, { sensible: true });
                    if (!ok) {
                        return {
                            success: false,
                            error: 'PASSWORD_UPDATE_FAILED',
                            message: `No se pudo completar el campo "${etiqueta}" del cambio de clave`
                        };
                    }
                    console.log(`[loginATM] ${etiqueta} ingresada`);
                }

                // Preparar listener para el dialog de éxito que aparece después de cambiar la clave
                const dialogSuccessPromise = new Promise((resolve) => {
                    let timeoutId;

                    const dialogHandler = async (dialog) => {
                        clearTimeout(timeoutId);
                        // Nos quitamos ya (registrados con page.on): un solo dialog nos alcanza
                        // y no queremos quedar colgados atrapando dialogs posteriores.
                        page.off('dialog', dialogHandler);
                        const message = dialog.message();
                        console.log('🎉 [loginATM] Dialog de cambio de clave detectado:', message);

                        // Verificar si es el mensaje de éxito
                        if (message.toLowerCase().includes('modificada') ||
                            message.toLowerCase().includes('éxito') ||
                            message.toLowerCase().includes('exitosamente')) {
                            console.log('✅ [loginATM] Dialog de éxito confirmado');
                            await aceptarDialog(dialog);
                            resolve({ success: true, message });
                        } else if (message.toLowerCase().includes('error') ||
                                   message.toLowerCase().includes('incorrecto')) {
                            console.log('❌ [loginATM] Dialog de error detectado');
                            await aceptarDialog(dialog);
                            resolve({ success: false, message });
                        } else {
                            // Dialog desconocido, aceptar de todos modos
                            console.log('⚠️ [loginATM] Dialog desconocido, aceptando...');
                            await aceptarDialog(dialog);
                            resolve({ success: true, message });
                        }
                    };

                    page.on('dialog', dialogHandler);

                    // Timeout de 10 segundos por si no aparece el dialog
                    timeoutId = setTimeout(() => {
                        page.off('dialog', dialogHandler);
                        console.log('⏱️ [loginATM] Timeout esperando dialog - continuando...');
                        resolve({ success: true, message: 'No apareció dialog (asumiendo éxito)' });
                    }, 10000);
                });

                // Hacer clic en el botón "Cambiar Clave"
                await page.click('#cambiar_clave');
                console.log('[loginATM] Clic en botón "Cambiar Clave" ejecutado');

                // Esperar el resultado del dialog
                const dialogResult = await dialogSuccessPromise;
                console.log('[loginATM] Resultado del dialog:', dialogResult);

                // Si el dialog indicó error, retornar inmediatamente
                if (!dialogResult.success) {
                    console.log('🔴 [loginATM] Dialog indicó error al cambiar contraseña');
                    return {
                        success: false,
                        error: 'PASSWORD_UPDATE_FAILED',
                        message: `Error al actualizar contraseña: ${dialogResult.message}`
                    };
                }

                // Esperar un poco más para que la página redirija después del dialog
                await new Promise(resolve => setTimeout(resolve, 2000));

                // DEBUG: Capturar el estado de la página después del cambio
                const pageDebugInfo = await page.evaluate(() => {
                    return {
                        url: window.location.href,
                        title: document.title,
                        bodyText: document.body.textContent.substring(0, 500), // Primeros 500 caracteres
                        hasErrorMessage: document.body.textContent.toLowerCase().includes('error'),
                        hasSuccessMessage: document.body.textContent.toLowerCase().includes('éxito') ||
                                         document.body.textContent.toLowerCase().includes('exitosamente') ||
                                         document.body.textContent.toLowerCase().includes('actualizada'),
                        formExists: !!document.getElementById('claveAnterior'), // ¿Sigue el form de cambio?
                        isHomePage: document.body.textContent.includes('Mis Trámites') ||
                                   document.body.textContent.includes('Mi ATM')
                    };
                });

                console.log('🔍 [DEBUG loginATM] Estado después de cambio de clave:', JSON.stringify(pageDebugInfo, null, 2));

                // Verificar si hubo error o éxito basándonos en el estado real
                let cambioExitoso = false;

                // Si el formulario de cambio ya no existe, significa que avanzó (éxito)
                if (!pageDebugInfo.formExists) {
                    console.log('✅ [loginATM] Formulario de cambio desapareció - Cambio exitoso');
                    cambioExitoso = true;
                }
                // Si hay mensaje de éxito explícito
                else if (pageDebugInfo.hasSuccessMessage) {
                    console.log('✅ [loginATM] Mensaje de éxito detectado');
                    cambioExitoso = true;
                }
                // Si llegó a la home/mis trámites
                else if (pageDebugInfo.isHomePage) {
                    console.log('✅ [loginATM] Redirigido a página principal - Cambio exitoso');
                    cambioExitoso = true;
                }
                // Si hay mensaje de error explícito
                else if (pageDebugInfo.hasErrorMessage) {
                    console.log('❌ [loginATM] Mensaje de error detectado en la página');
                    cambioExitoso = false;
                }
                // Si nada cambió, asumimos éxito (el sistema no siempre muestra confirmación)
                else {
                    console.log('⚠️ [loginATM] Estado incierto - Asumiendo éxito por defecto');
                    cambioExitoso = true;
                }

                if (cambioExitoso) {
                    console.log('✅ [loginATM] Contraseña actualizada automáticamente');

                    // Ahora necesitamos volver a hacer login con la misma contraseña
                    // O verificar si ya estamos logueados
                    console.log('[loginATM] Verificando estado post-actualización...');

                    // Esperar a que redirija o maneje el modal de email si aparece
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Manejar modal de email si aparece
                    const modalEmailPostergado = await manejarModalActualizacionEmail(page);
                    if (modalEmailPostergado === 'ERROR') {
                        console.log('🔴 [loginATM] No se pudo postergar la actualización de email.');
                        return { success: false, error: 'EMAIL_UPDATE_MODAL_ERROR', message: 'No se pudo cerrar el modal de actualización de email' };
                    }

                    return {
                        success: true,
                        passwordUpdated: true,
                        message: 'Contraseña actualizada automáticamente'
                    };
                } else {
                    console.log('🔴 [loginATM] Error al actualizar contraseña automáticamente');
                    return {
                        success: false,
                        error: 'PASSWORD_UPDATE_FAILED',
                        message: 'No se pudo actualizar la contraseña automáticamente'
                    };
                }

            } catch (updateError) {
                console.error('❌ [loginATM] Error durante actualización automática de contraseña:', updateError.message);
                return {
                    success: false,
                    error: 'PASSWORD_UPDATE_ERROR',
                    message: `Error al actualizar contraseña: ${updateError.message}`
                };
            }
        }

        // Verificar si apareció el modal de actualización de email
        // TODO: Ajustar los selectores según la implementación real del modal
        const modalEmailPostergado = await manejarModalActualizacionEmail(page);
        if (modalEmailPostergado === 'ERROR') {
            console.log('🔴 [loginATM] No se pudo postergar la actualización de email.');
            return { success: false, error: 'EMAIL_UPDATE_MODAL_ERROR', message: 'No se pudo cerrar el modal de actualización de email' };
        }

        console.log('✅ [loginATM] Login completado con éxito.');
        return { success: true };

    } catch (error) {
        // El catch ahora solo se activará para errores inesperados o timeouts de navegación reales
        console.error('❌ [loginATM] Error inesperado durante el login:', error.message);
        return { success: false, error: 'UNEXPECTED_ERROR', message: mensajeErrorLogin(error) };
    }
}

/**
 * Login en ATM + aviso al observadorLogin (registra si la clave guardada anda).
 * Es lo que usan todos los flujos; el login en sí está en loginATMSinAviso.
 */
async function loginATM(page, credencialesATM) {
    const resultado = await loginATMSinAviso(page, credencialesATM);
    await observadorLogin.notificar({
        canal: 'atm',
        cuit: credencialesATM && credencialesATM.cuit,
        clave: credencialesATM && credencialesATM.clave,
        resultado
    });
    return resultado;
}

/**
 * loginATM + corte si falla. Para los flujos que hacen login y siguen navegando:
 * si la clave está mal, no tiene sentido seguir (antes seguían de largo y fallaban
 * minutos después esperando pantallas que nunca aparecían, con un error que no
 * mencionaba la clave). Lanza un Error con mensaje claro y `.code` = error del login,
 * que el manager del lote atrapa para ese cliente y sigue con el siguiente.
 * @returns {Promise<Object>} el resultado del login si salió bien
 */
async function exigirLoginATM(page, credencialesATM) {
    const resultado = await loginATM(page, credencialesATM);
    if (resultado && resultado.success) return resultado;

    const mensajes = {
        INVALID_CREDENTIALS: 'Clave ATM incorrecta',
        CAMPO_INCOMPLETO: 'No se pudo completar el formulario de login de ATM',
        PASSWORD_UPDATE_FAILED: 'ATM pidió cambiar la clave y no se pudo',
        PASSWORD_UPDATE_ERROR: 'ATM pidió cambiar la clave y no se pudo',
        EMAIL_UPDATE_MODAL_ERROR: 'No se pudo cerrar el aviso de actualización de email de ATM'
    };
    const codigo = (resultado && resultado.error) || 'LOGIN_FAILED';
    const detalle = resultado && resultado.message;
    const base = mensajes[codigo] || 'No se pudo iniciar sesión en ATM';
    const error = new Error(detalle && detalle !== base ? `${base}: ${detalle}` : base);
    error.code = codigo;
    throw error;
}

// === FUNCIÓN AUXILIAR PARA DEBUG ===
async function debugPopupElements(page) {
  console.log('🔍 Analizando elementos emergentes en la página...');
  
  // Buscar todos los elementos que podrían ser popups
  const popupInfo = await page.evaluate(() => {
    const results = [];
    
    // Buscar elementos con display block que aparecieron recientemente
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      
      // Criterios para identificar posibles popups
      if (
        (style.position === 'fixed' || style.position === 'absolute') &&
        style.zIndex > 100 &&
        rect.width > 100 && rect.height > 50 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      ) {
        results.push({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          text: el.textContent?.trim().substring(0, 100),
          zIndex: style.zIndex,
          position: style.position
        });
      }
    });
    
    return results;
  });
  
  console.log('Elementos tipo popup encontrados:', popupInfo);
  return popupInfo;
}

// Configurar manejo de excepciones no capturadas
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

module.exports = { loginATM, exigirLoginATM, debugPopupElements, manejarModalActualizacionEmail };