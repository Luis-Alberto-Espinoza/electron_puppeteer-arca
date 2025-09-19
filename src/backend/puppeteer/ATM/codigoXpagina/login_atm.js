/**
 * Inicia sesión en la plataforma ATM de AFIP utilizando page.evaluate.
 * @param {import('puppeteer').Page} page - La instancia de la página de Puppeteer.
 * @param {string} cuit - El CUIT del usuario.
 * @param {string} clave - La clave fiscal del usuario.
 */
async function loginATM(page, credencialesATM) {
  const { cuit, clave } = credencialesATM;
  try {
    console.log('Iniciando proceso de login en la plataforma ATM (con evaluate)...');
    // Esperamos que el selector principal esté listo
    await page.waitForSelector('#cuit', { visible: true });

    // Ejecutamos el código de login dentro del contexto del navegador
    await page.evaluate((cuit, clave) => {
      const inputCuit = document.getElementById('cuit');
      const inputClave = document.getElementById('password');
      const btnLogin = document.getElementById('ingresar');

      // Tu función original para simular eventos
      function triggerEvents(element, value) {
        element.focus();
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('keyup', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
      }


      setTimeout(() => {
        // Llenar formulario
        triggerEvents(inputCuit, cuit);
        triggerEvents(inputClave, clave);
      }, 100);


      // El click se hace dentro de un setTimeout, como en tu script original
      setTimeout(() => {
        btnLogin.click();
      }, 100);


    }, cuit, clave); // Pasamos cuit y clave como argumentos a evaluate

    // Añadimos una espera para que la navegación post-login finalice
    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    console.log('Login (con evaluate) exitoso.');

  } catch (error) {
    console.error('Error durante el login (con evaluate):', error);
    throw new Error('Fallo el proceso de login con evaluate.');
  }
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Si quieres mostrar el error en una ventana:
  // const { dialog } = require('electron');
  // dialog.showErrorBox('Error no capturado', error.message);
  // No cierres la app aquí
});

module.exports = { loginATM };