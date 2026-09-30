/**
 * Login en AFIP ARCA
 *
 * NOTA: Este archivo fue refactorizado para recibir `page` como parametro.
 * Ya NO crea ni cierra el browser - eso lo maneja puppeteer-manager.
 *
 * Uso:
 *   const resultado = await hacerLogin(page, url, credenciales);
 *   if (!resultado.success) return resultado;
 *   // continuar con el flujo...
 */

// Cuando AFIP interpone un captcha, dejamos la ventana abierta y ESPERAMOS a que el
// usuario lo resuelva a mano (es más rápido y confiable que automatizarlo). Este es el
// tiempo máximo de espera antes de rendirse y marcar CAPTCHA_BLOQUEO. Ajustable.
const ESPERA_CAPTCHA_MANUAL_MS = 180000; // 3 minutos

// ¿El navegador corre oculto? Se detecta acá (y no con una bandera) para que ningún
// servicio tenga que acordarse de pasarla. OJO: browser.version() NO sirve (el headless
// nuevo reporta "Chrome/..."); el user agent sí dice "HeadlessChrome".
async function navegadorOculto(page) {
  try {
    return /HeadlessChrome/i.test(await page.browser().userAgent());
  } catch (_) {
    return false; // ante la duda, asumir visible (comportamiento de siempre)
  }
}

async function hacerLogin(page, url, credenciales) {
  try {
    // Validación y normalización de entrada
    if (!credenciales?.usuario || !credenciales?.contrasena) {
      return {
        success: false,
        error: 'INVALID_INPUT',
        message: 'Credenciales incompletas'
      };
    }

    // Normalizar credenciales a string (defensa en profundidad)
    const usuario = String(credenciales.usuario);
    const contrasena = String(credenciales.contrasena);

    // Navegar a la pagina de login
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#F1\\:username', { visible: true });

    // Si AFIP autocompletó el CUIT (caso típico del re-login intermedio), no volvemos
    // a tipearlo: se duplicarían los dígitos y daría error de CUIT inválido.
    const valorActual = await page.$eval('#F1\\:username', el => (el.value || '').trim());
    if (!valorActual) {
        await page.type('#F1\\:username', usuario);
    } else {
        console.log(`✅ [Login ARCA] CUIT autocompletado por el navegador (${valorActual}); no se vuelve a escribir.`);
    }

    // --- Click en "Siguiente" con reintento ---
    // En internet lento, a veces el click se "pierde" y la página no responde.
    // Estrategia: clickear, esperar respuesta esperada (password o error). Si en N
    // segundos no pasa nada, volver a clickear y esperar más.
    const esperarRespuestaCUIT = (timeoutMs) => Promise.race([
      page.waitForSelector('#F1\\:password', { visible: true, timeout: timeoutMs })
        .then(() => ({ tipo: 'password_visible' }))
        .catch(() => null),
      page.waitForSelector('#F1\\:msg', { visible: true, timeout: timeoutMs })
        .then(() => ({ tipo: 'error_cuit' }))
        .catch(() => null)
    ]).then(res => res || { tipo: 'timeout' });

    await page.click('#F1\\:btnSiguiente');
    let resultadoCUIT = await esperarRespuestaCUIT(8000);

    if (resultadoCUIT.tipo === 'timeout') {
      console.log('⚠️ [Login ARCA] Sin respuesta tras click "Siguiente" (8s). Reintentando click...');
      try { await page.click('#F1\\:btnSiguiente'); } catch (_) { /* botón puede haber desaparecido */ }
      resultadoCUIT = await esperarRespuestaCUIT(15000);
    }

    if (resultadoCUIT.tipo === 'error_cuit') {
      const errorMessage = await page.$eval('#F1\\:msg', el => el.textContent);
      console.log(`🔴 [Login ARCA] CUIT incorrecto: ${errorMessage}`);
      return { success: false, error: 'INVALID_CUIT', message: errorMessage };
    }

    if (resultadoCUIT.tipo === 'timeout') {
      console.log('🔴 [Login ARCA] Timeout esperando respuesta despues de ingresar CUIT (incluso tras reintento)');
      return { success: false, error: 'TIMEOUT', message: 'Timeout esperando respuesta de AFIP' };
    }

    // Si llegamos aquí, el CUIT fue correcto (resultadoCUIT.tipo === 'password_visible')
    console.log('✅ [Login ARCA] CUIT validado correctamente.');
    await page.type('#F1\\:password', contrasena);

    // --- Click "Ingresar" con reintento ---
    // Misma lógica que arriba: si no aparece ni navegación ni error, reintento.
    const errorSelector = 'p.text-danger span#F1\\:msg';
    const esperarRespuestaIngresar = (timeoutMs) => {
      const navPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: timeoutMs })
        .then(() => 'navigation')
        .catch(() => null);
      const errPromise = page.waitForSelector(errorSelector, { visible: true, timeout: timeoutMs })
        .then(() => 'error')
        .catch(() => null);
      return Promise.race([navPromise, errPromise]).then(res => res || 'timeout');
    };

    await page.click('#F1\\:btnIngresar');
    let winner = await esperarRespuestaIngresar(15000);

    if (winner === 'timeout') {
      console.log('⚠️ [Login ARCA] Sin respuesta tras click "Ingresar" (15s). Reintentando click...');
      try { await page.click('#F1\\:btnIngresar'); } catch (_) { /* puede haber navegado entre medio */ }
      winner = await esperarRespuestaIngresar(20000);
    }

    // ¿AFIP interpuso un captcha? Aparece tras varios logins fallidos y bloquea por IP
    // ~15 min CUALQUIER login. NO significa clave inválida: hay que marcarlo distinto para
    // no condenar credenciales que sí son buenas. Se chequea ANTES de clasificar el error
    // porque el mismo #F1:msg muestra "clave incorrecta" y "captcha incorrecto": decidimos
    // por PRESENCIA del input del captcha, no por el mensaje.
    if (winner !== 'navigation' && await hayCaptchaAfip(page)) {
      // Oculto nadie puede resolverlo: no esperamos los 3 minutos, cortamos ya.
      if (await navegadorOculto(page)) {
        console.log('🧩 [Login ARCA] AFIP interpuso un captcha con el navegador OCULTO. Se corta sin esperar.');
        return {
          success: false,
          error: 'CAPTCHA_BLOQUEO',
          message: 'AFIP pidió un captcha y el navegador está oculto. ' +
                   'Reintentá con "Mostrar navegador" activado para resolverlo a mano. ' +
                   'No indica que la clave sea inválida.'
        };
      }
      // Modo manual: dejamos la ventana abierta y esperamos a que el usuario resuelva el
      // captcha a mano. La ventana no se cierra porque seguimos DENTRO del callback de
      // puppeteer-manager (que cierra recién cuando este login retorna).
      console.log('🧩 [Login ARCA] AFIP interpuso un captcha.');
      console.log(`✋ [Login ARCA] Resolvé el captcha en la ventana del navegador. Esperando hasta ${ESPERA_CAPTCHA_MANUAL_MS / 1000}s...`);
      try {
        // Si aparece el buscador del portal, es que el captcha se resolvió y el login entró.
        await page.waitForSelector('#buscadorInput', { timeout: ESPERA_CAPTCHA_MANUAL_MS });
        console.log('✅ [Login ARCA] Captcha resuelto manualmente. Login completado.');
        winner = 'navigation'; // seguimos por el camino de éxito (saltea los checks de error/timeout)
      } catch (_) {
        console.log('🔴 [Login ARCA] El captcha no se resolvió a tiempo. Se marca para reintentar.');
        return {
          success: false,
          error: 'CAPTCHA_BLOQUEO',
          message: 'AFIP pidió un captcha y no se resolvió manualmente a tiempo. ' +
                   'No indica que la clave sea inválida; reintentar en unos minutos.'
        };
      }
    }

    if (winner === 'error') {
      const errorMessage = await page.$eval(errorSelector, el => el.textContent);
      console.log(`🔴 [Login ARCA] Fallo de login detectado: ${errorMessage}`);
      return { success: false, error: 'INVALID_CREDENTIALS', message: errorMessage };
    }

    if (winner === 'timeout') {
      console.log('🔴 [Login ARCA] Timeout esperando respuesta tras "Ingresar" (incluso tras reintento)');
      return { success: false, error: 'TIMEOUT', message: 'Timeout esperando respuesta de AFIP tras login' };
    }

    // Si la navegación ganó, procedemos
    console.log('✅ [Login ARCA] Login y navegación completados con éxito.');

    // Tras el login, AFIP a veces interpone una pantalla de cambio/recordatorio de
    // clave fiscal (botones "Cambiar"/"Cancelar"). NO es el home: si seguimos, los
    // flujos que esperan #buscadorInput (analizar cliente, verificación, etc.) se
    // cuelgan con un error crudo. La detectamos acá, en el chokepoint común a todos.
    if (await detectarCambioClaveAfip(page)) {
      console.log('🔒 [Login ARCA] AFIP exige/recomienda actualizar la clave fiscal. Abortando flujo automatizado.');
      return {
        success: false,
        error: 'UPDATE_PASSWORD_REQUIRED',
        message: 'AFIP requiere que el cliente actualice su clave fiscal antes de operar. ' +
                 'Ingresá manualmente a AFIP con este CUIT, cambiá la contraseña y volvé a intentar.'
      };
    }

    return { success: true };

  } catch (error) {
    console.error('❌ Error inesperado en hacerLogin:', error);
    return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
  }
}

/**
 * ¿La página está mostrando el captcha de AFIP? El captcha aparece tras varios
 * logins fallidos y bloquea por IP ~15 min CUALQUIER login. Se detecta por la
 * PRESENCIA visible del input de solución (#F1:captchaSolutionInput), no por el
 * mensaje de error #F1:msg, porque ese span se comparte con "clave incorrecta".
 * @param {import('puppeteer').Page} page
 * @returns {Promise<boolean>}
 */
async function hayCaptchaAfip(page) {
  try {
    return await page.evaluate(() => {
      // getElementById evita tener que escapar los dos puntos del id "F1:...".
      const input = document.getElementById('F1:captchaSolutionInput');
      if (!input) return false;
      const style = window.getComputedStyle(input);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  } catch (_) {
    return false;
  }
}

/**
 * Detecta si, tras el login, AFIP mostró una pantalla de cambio/recordatorio de
 * clave fiscal en vez del home. Cubre dos variantes:
 *   - Cambio forzado (form action con "cambioClave..." / URL con "cambioclave").
 *   - Recordatorio sugerido (pantalla con botones "Cambiar"/"Cancelar").
 * Conservador: si ya vemos el buscador del portal (#buscadorInput) damos por
 * hecho que estamos en el home y devolvemos false, para evitar falsos positivos.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<boolean>}
 */
async function detectarCambioClaveAfip(page) {
  try {
    const url = (page.url() || '').toLowerCase();
    if (url.includes('cambioclave')) return true;

    return await page.evaluate(() => {
      // Si ya estamos en el portal (buscador presente), no es pantalla de cambio.
      if (document.getElementById('buscadorInput')) return false;

      // 1) Form de cambio de clave (forzado o sugerido).
      if (document.querySelector('form[action*="cambioClave" i]')) return true;

      // 2) Heurística por contenido: la pantalla de recordatorio habla de la clave
      //    fiscal y ofrece cambiarla. Pedimos ambas señales para no disparar de más.
      const texto = ((document.body && document.body.innerText) || '').toLowerCase();
      const mencionaClave = texto.includes('clave fiscal') || texto.includes('contraseña') || texto.includes('su clave');
      const pideCambio = texto.includes('cambio de clave') || texto.includes('cambiar') || texto.includes('actualizar');
      return mencionaClave && pideCambio;
    });
  } catch (_) {
    // Ante cualquier error de evaluación preferimos no bloquear el login.
    return false;
  }
}

module.exports = { hacerLogin };