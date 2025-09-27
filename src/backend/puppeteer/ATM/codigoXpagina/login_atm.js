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

        await page.type('#cuit', String(cuit), { delay: 50 });
        await page.type('#password', String(clave), { delay: 50 });
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
        const updateSelector = '//p[contains(text(), "Su contraseña ha expirado")]';
        const updateInfo = await page.evaluate((selector) => {
            const element = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            return element ? { text: element.textContent.trim() } : null;
        }, updateSelector);

        if (updateInfo) {
            console.log('🟡 [loginATM] Se requiere actualización de contraseña.');
            return { success: false, error: 'UPDATE_PASSWORD_REQUIRED', message: updateInfo.text };
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

module.exports = { loginATM, debugPopupElements };