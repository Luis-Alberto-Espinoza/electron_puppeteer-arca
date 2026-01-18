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
    await page.type('#F1\\:username', usuario);

    // Click en Siguiente
    await page.click('#F1\\:btnSiguiente');

    // --- Validar CUIT: detectar si hubo error o si navegó correctamente ---
    const resultadoCUIT = await Promise.race([
      page.waitForSelector('#F1\\:password', { visible: true, timeout: 10000 })
        .then(() => ({ tipo: 'password_visible' }))
        .catch(() => null),
      page.waitForSelector('#F1\\:msg', { visible: true, timeout: 10000 })
        .then(() => ({ tipo: 'error_cuit' }))
        .catch(() => null)
    ]).then(res => res || { tipo: 'timeout' });

    if (resultadoCUIT.tipo === 'error_cuit') {
      const errorMessage = await page.$eval('#F1\\:msg', el => el.textContent);
      console.log(`🔴 [Login ARCA] CUIT incorrecto: ${errorMessage}`);
      return { success: false, error: 'INVALID_CUIT', message: errorMessage };
    }

    if (resultadoCUIT.tipo === 'timeout') {
      console.log('🔴 [Login ARCA] Timeout esperando respuesta despues de ingresar CUIT');
      return { success: false, error: 'TIMEOUT', message: 'Timeout esperando respuesta de AFIP' };
    }

    // Si llegamos aquí, el CUIT fue correcto (resultadoCUIT.tipo === 'password_visible')
    console.log('✅ [Login ARCA] CUIT validado correctamente.');
    await page.type('#F1\\:password', contrasena);

    // --- Implementación de Promise.race ---
    const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle2' });
    const errorSelector = 'p.text-danger span#F1\\:msg';
    const errorPromise = page.waitForSelector(errorSelector, { visible: true });

    await page.click('#F1\\:btnIngresar');

    const winner = await Promise.race([
      navigationPromise.then(() => 'navigation'),
      errorPromise.then(() => 'error')
    ]);

    if (winner === 'error') {
      const errorMessage = await page.$eval(errorSelector, el => el.textContent);
      console.log(`🔴 [Login ARCA] Fallo de login detectado: ${errorMessage}`);
      return { success: false, error: 'INVALID_CREDENTIALS', message: errorMessage };
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