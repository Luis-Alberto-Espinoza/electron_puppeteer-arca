const path = require('path');
const {
    getDownloadPath,
    getFilename,
    waitForFile
} = require('../../../utils/fileManager.js');

/**
 * Gestiona la descarga de la constancia fiscal desde la página de ATM.
 * @param {import('puppeteer').Page} page - La página de Puppeteer.
 * @param {string} nombreUsuario - El nombre de usuario para la ruta de descarga.
 * @param {string} cuit - El CUIT para nombrar el archivo.
 * @param {string} downloadsPath - La ruta base de descargas del sistema.
 * @returns {Promise<{success: boolean, files: string[], downloadDir: string}>}
 */
async function gestionarConstanciaFiscal(page, nombreUsuario, cuit, downloadsPath) {
  try {
    // 1. Obtener la ruta de descarga y configurar el comportamiento de descarga
    const downloadDir = getDownloadPath(downloadsPath, nombreUsuario, 'archivos_atm');
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir
    });

    // 2. Navegar dentro del iframe y hacer clic en los botones
    const frameHandle = await page.waitForSelector('iframe[src="nucleo/inicio.zul"]');
    const frame = await frameHandle.contentFrame();
    if (!frame) {
      throw new Error('No se pudo encontrar el contentFrame del iframe.');
    }

    const clickButtonInFrame = async (text) => {
      await frame.waitForSelector('.z-button', { timeout: 10000 });
      const clicked = await frame.evaluate((buttonText) => {
        const buttons = document.querySelectorAll(".z-button");
        for (const button of buttons) {
          if (button.innerText.trim() === buttonText) {
            button.click();
            return true;
          }
        }
        return false;
      }, text);
      if (!clicked) {
        throw new Error(`No se encontró el botón '${text}' en el iframe.`);
      }
    };

    const browser = page.browser();
    const newPagePromise = new Promise(resolve => {
      browser.once('targetcreated', async target => {
        if (target.type() === 'page') {
          const newPage = await target.page();
          resolve(newPage);
        }
      });
    });

    await clickButtonInFrame("Imprimir Constancia");

    try {
        // INTENTA encontrar y procesar el diálogo de deuda (escenario CON deuda)
        // Se usa un timeout más corto para no demorar el flujo si no hay deuda.
        await frame.waitForFunction(() => Array.from(document.querySelectorAll(".z-button")).some(btn => btn.innerText.trim() === "Aceptar"), { timeout: 5000 });
        await clickButtonInFrame("Aceptar");
        
        // Una vez aceptado, se espera el botón para imprimir la deuda
        await frame.waitForFunction(() => Array.from(document.querySelectorAll(".z-button")).some(btn => btn.innerText.trim() === "Imprimir Deuda"), { timeout: 8000 });
        await clickButtonInFrame("Imprimir Deuda");

    } catch (error) {
        // CATCH: Se asume que no hay diálogo de deuda (escenario SIN deuda)
        // El error de timeout es esperado en este caso. No hacemos nada y dejamos que el flujo continúe,
        // ya que la promesa 'newPagePromise' se resolverá con la apertura directa del PDF.
        console.log('No se encontró diálogo de deuda, se asume descarga directa de la constancia.');
    }

    // 3. Esperar a que la nueva pestaña con el visor de PDF se abra
    const pdfPage = await newPagePromise;
    // console.log('Nueva pestaña con visor de PDF detectada.');

    // 4. Preparar nombres de archivo y forzar la descarga
    // console.log('Forzando la descarga del PDF desde el visor...');
    const finalFilename = getFilename('constancia_fiscal', cuit, 'pdf');
    const tempFilename = `temp_${Date.now()}.pdf`; // Nombre temporal

    await pdfPage.evaluate((fileName) => {
        return new Promise(async (resolve, reject) => {
            try {
                const response = await window.fetch(window.location.href);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }, tempFilename);

    // 5. Esperar a que el archivo temporal aparezca y renombrarlo al nombre final
    const finalPath = await waitForFile(downloadDir, tempFilename, finalFilename, 30000);
    if (!finalPath) {
        throw new Error('La descarga del archivo PDF falló o excedió el tiempo de espera.');
    }
    // console.log(`¡Archivo descargado y verificado en: ${finalPath}!`);

    // 6. Limpieza
    await pdfPage.close();

    return {
      success: true,
      files: [finalPath], // El fileManager ahora devuelve la ruta completa
      downloadDir
    };

  } catch (error) {
    console.error('❌ Error gestionando la constancia fiscal:', error);
    throw new Error('Fallo el proceso de gestion de constancia fiscal: ' + error.message);
  }
}

module.exports = { gestionarConstanciaFiscal };