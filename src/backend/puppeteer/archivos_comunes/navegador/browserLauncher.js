const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');

// Crea un perfil temporal con el Password Manager de Google desactivado.
// Necesario porque el modal "Cambia la contraseña" (leak detection) se controla
// por preferencia de perfil, no por --disable-features.
function createIsolatedUserDataDir() {
  const dir = path.join(
    os.tmpdir(),
    `afip-electron-profile-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const defaultDir = path.join(dir, 'Default');
  fs.mkdirSync(defaultDir, { recursive: true });

  const preferences = {
    credentials_enable_service: false,
    profile: {
      password_manager_leak_detection: false,
      password_manager_enabled: false
    },
    safebrowsing: { enabled: false }
  };
  fs.writeFileSync(path.join(defaultDir, 'Preferences'), JSON.stringify(preferences));

  const localState = { password_manager: { leak_detection_enabled: false } };
  fs.writeFileSync(path.join(dir, 'Local State'), JSON.stringify(localState));

  return dir;
}

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
      '--disable-features=DownloadBubble,DownloadBubbleV2,PasswordCheck,PasswordLeakDetection,AutofillServerCommunication,PasswordManagerOnboarding', // Desactivar diálogo de descarga moderno, verificación de contraseñas comprometidas y onboarding del password manager

      // ===== DESHABILITAR PASSWORD MANAGER DE CHROME =====
      '--disable-save-password-bubble', // No mostrar popup de guardar contraseña
      '--disable-password-generation', // No sugerir contraseñas generadas
      '--disable-password-manager-reauthentication', // No pedir reautenticación para autocompletar
      '--password-store=basic' // Usar almacén básico sin integración con el sistema
    ],
    defaultViewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    devtools: false
  };

  const userDataDir = createIsolatedUserDataDir();
  launchOptions.userDataDir = userDataDir;

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
    browser.on('disconnected', () => {
      fs.rm(userDataDir, { recursive: true, force: true }, () => {});
    });
    return browser;
  } catch (error) {
    console.error('Error al lanzar Puppeteer:', error);
    fs.rm(userDataDir, { recursive: true, force: true }, () => {});
    throw error;
  }
}

// Viewport por defecto para todas las pestañas que abrimos.
const DEFAULT_VIEWPORT = { width: 1366, height: 768 };

async function launchBrowserAndPage({ headless = true } = {}) {
  const browser = await launchBrowser({ headless });
  // Chrome ya abre con una pestaña inicial (about:blank): la reusamos en vez de
  // crear otra con newPage(), así no queda una pestaña en blanco de más.
  const paginas = await browser.pages();
  const page = paginas.length ? paginas[0] : await browser.newPage();
  await page.setViewport(DEFAULT_VIEWPORT);
  return { browser, page };
}

// Traduce la bandera `visible` que manda el frontend a la opción `headless` de Puppeteer.
// Si la bandera no llega (undefined), el navegador se abre VISIBLE: así los servicios
// que todavía no mandan la bandera siguen igual que antes.
function resolverHeadless(visible) {
  return visible === false;
}

module.exports = { launchBrowser, launchBrowserAndPage, resolverHeadless };