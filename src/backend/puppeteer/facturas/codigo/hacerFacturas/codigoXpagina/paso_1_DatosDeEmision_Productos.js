const fecha = require('../utils.js');
const path = require('path');
const fs = require('fs').promises; // Usa promesas para manejar directorios
const { fork } = require('child_process');
const os = require('os'); // Añade os para rutas seguras

async function paso_1_DatosDeEmision_Productos(newPage, datos, factura, modoTest = false) {
  try {
    await newPage.evaluate((datos, modoTest) => {
      try {
        if (window.location.href.includes('genComDatosEmisor') && datos.tipoActividad === 'Producto') {
          let inputFechas = document.querySelector("#fc");
          inputFechas.value = datos.fechaComprobante;

          let conceptoAincluir = document.querySelector("#idconcepto");
          conceptoAincluir.children[1].selected = true;
        } else {
          console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datosDeEmision:", datos.datosDeEmision);
        }
      } catch (error) {
        console.error("Error dentro de evaluate:", error);
      }
    }, datos, modoTest);

    if (modoTest) {
      // Usa el directorio temporal del sistema
      const screenshotsDir = os.tmpdir();
      const screenshotPath = path.join(screenshotsDir, 'paso1_producto.png');
      await newPage.screenshot({ path: screenshotPath });
      console.log('Captura guardada en:', screenshotPath);

      // Verifica que el archivo existe antes de intentar abrirlo
      if (await fs.access(screenshotPath).then(() => true).catch(() => false)) {
        //const visorProcess = fork(path.join(__dirname, 'visorImagen.js'));
        const visorProcess = fork(path.join(__dirname, './../visorImagen.js'));

        visorProcess.on('error', (err) => {
          console.error('Error en el proceso visor:', err);
        });

        visorProcess.on('exit', (code) => {
          console.log('Proceso visor terminó con código:', code);
        });

        visorProcess.send({ screenshotPath });
      } else {
        console.error('Error: No se pudo crear el archivo de captura en', screenshotPath);
      }
    }

    // Espera la navegación después de hacer clic en el botón
    await Promise.all([
      newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }),
      newPage.evaluate(() => {
        let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");
        btnContinuar.click();
      })
    ]);

    console.log("Script _1_Producto_ ejecutado correctamente.");
    return { success: true, message: "Datos de emisión (producto) completados" };
  } catch (error) {
    console.error("Error al ejecutar el script:", error);
    throw error;
  }
}

module.exports = { paso_1_DatosDeEmision_Productos };