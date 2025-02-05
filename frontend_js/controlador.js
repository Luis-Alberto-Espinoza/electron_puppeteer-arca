import { inicializarInterfazFacturas } from './facturas/interfazFacturas.js'; 

document.addEventListener('DOMContentLoaded', () => {
    inicializarInterfazFacturas();
});


document.addEventListener('DOMContentLoaded', () => {
  const abrirNavegadorBtn = document.getElementById('abrirNavegadorBtn');
  const url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml"
  const encabezados = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
      'Referer': 'https://google.com'
  };

  abrirNavegadorBtn.addEventListener('click', () => {
      window.electronAPI.abrirNavegadorPuppeteer(url, encabezados);
  });
});