/**
 * Maneja el modal de actualización de email que puede aparecer después del login
 * @param {import('puppeteer').Page} page - La instancia de la página de Puppeteer.
 * @returns {Promise<string>} 'OK' si se manejó correctamente o no apareció, 'ERROR' si falló
 */
async function manejarModalActualizacionEmail(page) {
    try {
        console.log('[manejarModalActualizacionEmail] Verificando si existe modal de email...');

        // Esperar un momento para que la página se estabilice y el modal tenga chance de aparecer
        console.log('[manejarModalActualizacionEmail] Esperando 3 segundos para que la página se estabilice...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Esperar a que el modal esté visible (el modal tiene id="divMisTramitesConfirmarEmails")
        const TIMEOUT_MODAL = 7000; // 7 segundos
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
async function loginATM(page, credencialesATM) {
    const { cuit, clave } = credencialesATM;
    const url = 'https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp';

    try {
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.waitForSelector('#cuit', { visible: true });
        console.log(`[loginATM] Iniciando login para CUIT: ${cuit}`);

        // Esperar un momento adicional para que la página esté completamente lista
        await new Promise(resolve => setTimeout(resolve, 500));

        // Limpiar y enfocar el campo CUIT antes de escribir
        await page.click('#cuit', { clickCount: 3 }); // Triple clic para seleccionar todo
        await page.keyboard.press('Backspace'); // Limpiar cualquier contenido previo

        // Escribir CUIT
        await page.type('#cuit', String(cuit), { delay: 100 }); // Delay aumentado a 100ms
        console.log(`[loginATM] CUIT ingresado: ${cuit}`);

        // Limpiar y escribir contraseña
        await page.click('#password', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('#password', String(clave), { delay: 100 });
        console.log(`[loginATM] Contraseña ingresada`);

        // Preparamos la "carrera" de promesas
        const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });

        const dialogPromise = new Promise(resolve => {
            page.once('dialog', async dialog => {
                console.log('🚨 [loginATM] Dialog nativo detectado:', dialog.message());
                await dialog.accept();
                // El diálogo de error gana la carrera y resuelve con un objeto de error
                resolve({ success: false, error: 'INVALID_CREDENTIALS', message: dialog.message() });
            });
        });
        await page.click('#ingresar');

        console.log('[loginATM] Esperando resultado de la carrera: navegación vs. diálogo...');

        // El resultado será lo que resuelva primero: la navegación o el diálogo
        const result = await Promise.race([
            navigationPromise,
            dialogPromise
        ]);

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
            console.log('🟡 [loginATM] Se requiere actualización de contraseña.');
            return { success: false, error: 'UPDATE_PASSWORD_REQUIRED', message: updatePasswordInfo.text };
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
        return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
    }
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

module.exports = { loginATM, debugPopupElements, manejarModalActualizacionEmail };