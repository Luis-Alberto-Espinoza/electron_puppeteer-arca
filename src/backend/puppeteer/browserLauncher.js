const { app } = require('electron');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

async function launchBrowser({ headless = false } = {}) { // <-- permite pasar headless
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  let launchOptions = {
    headless, // <-- configurable
    args: [
      `--window-size=${width},${height}`,
      `--window-position=0,0`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-extensions',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
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

  console.log('Usando navegador en:', executablePath);
  launchOptions.executablePath = executablePath;

  try {
    const browser = await puppeteer.launch(launchOptions);
    return browser;
  } catch (error) {
    console.error('Error al lanzar Puppeteer:', error);
    throw error;
  }
}

module.exports = { launchBrowser };