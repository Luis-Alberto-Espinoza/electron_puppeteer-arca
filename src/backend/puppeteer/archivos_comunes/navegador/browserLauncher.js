const fs = require('fs');
const puppeteer = require('puppeteer-core');

async function launchBrowser({ headless = true, args = [] } = {}) { // <-- permite pasar headless y args personalizados
  // Se eliminó la dependencia de 'electron.screen' para que sea compatible con workers.
  // El tamaño de la ventana será el predeterminado de Puppeteer.
  let launchOptions = {
    headless, // <-- configurable
    args: [
      ...args, // <-- Argumentos personalizados primero
      //`--window-size=${width},${height}`, // Removido
      //`--window-position=0,0`, // Removido
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-extensions',
      '--disable-dev-shm-usage',

      // ===== ARGUMENTOS COMENTADOS PARA PERMITIR SEGUNDO PLANO =====
      // Al comentar estos argumentos, el navegador puede ponerse en segundo plano
      // y NO "robará" el foco constantemente

      // '--disable-background-timer-throttling',
      // ↑ Evita que los timers se ralenticen en segundo plano
      // Al comentarlo: Los timers se ralentizan si el navegador está oculto (puede afectar performance)

      // '--disable-backgrounding-occluded-windows',
      // ↑ Evita que ventanas tapadas se pongan en modo background
      // Al comentarlo: El navegador PUEDE ponerse en segundo plano si otra ventana lo tapa

      // '--disable-renderer-backgrounding',
      // ↑ Evita que el proceso de renderizado se pause
      // Al comentarlo: El navegador puede pausar el renderizado en segundo plano (AHORRA RECURSOS)

      // ============================================================

      '--disable-prompt-on-repost', // Desactivar prompt de repost
      '--disable-hang-monitor', // Desactivar monitor de cuelgue
      '--disable-features=DownloadBubble,DownloadBubbleV2,PasswordCheck,PasswordLeakDetection', // Desactivar diálogo de descarga moderno y verificación de contraseñas comprometidas

      // ===== DESHABILITAR PASSWORD MANAGER DE CHROME =====
      '--disable-save-password-bubble', // No mostrar popup de guardar contraseña
      '--disable-password-generation', // No sugerir contraseñas generadas
      '--password-store=basic' // Usar almacén básico sin integración con el sistema
    ],
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    devtools: false
  };

  let executablePath;
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    executablePath = candidates.find(fs.existsSync);
    if (!executablePath) {
      throw new Error('Instala Google Chrome o Microsoft Edge para usar esta aplicación.');
    }
  } else if (process.platform === 'linux') {
    const candidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    ];
    executablePath = candidates.find(fs.existsSync);
    if (!executablePath) {
      throw new Error('No se encontró Chrome/Chromium. Instala con: sudo apt install google-chrome-stable');
    }
  } else if (process.platform === 'darwin') {
    executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (!fs.existsSync(executablePath)) {
      throw new Error('Instala Google Chrome para usar esta aplicación.');
    }
  } else {
    throw new Error('Plataforma no soportada');
  }

  // console.log('Usando navegador en:', executablePath);
  launchOptions.executablePath = executablePath;

  try {
    const browser = await puppeteer.launch(launchOptions);
    return browser;
  } catch (error) {
    console.error('Error al lanzar Puppeteer:', error);
    throw error;
  }
}

async function launchBrowserAndPage({ headless = true } = {}) {
  const browser = await launchBrowser({ headless });
  const page = await browser.newPage();
  return { browser, page };
}

module.exports = { launchBrowser, launchBrowserAndPage };