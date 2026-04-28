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

    return { success: true };

  } catch (error) {
    console.error('❌ Error inesperado en hacerLogin:', error);
    return { success: false, error: 'UNEXPECTED_ERROR', message: error.message };
  }
}

module.exports = { hacerLogin };