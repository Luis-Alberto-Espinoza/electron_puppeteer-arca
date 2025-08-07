async function paso_2_DatosDelReceptor(newPage, datos) {
  try {
    console.log("Ejecutando script _2_...");

    // Esperar a que el elemento esté presente en la página
    await newPage.waitForSelector('#idtipodocreceptor', { timeout: 120000 });

    // Ejecutar el script en la página
    await newPage.evaluate(async (datos) => {
      function esperarElementoEnDOM(selector, maxIntentos = 10, intervalo = 500) {
        return new Promise((resolve, reject) => {
          let intentos = 0;

          function verificarElemento() {
            let elemento = document.querySelector(selector);
            if (elemento) {
              resolve(elemento);
            } else {
              intentos++;
              if (intentos >= maxIntentos) {
                reject(new Error(`Elemento ${selector} no encontrado después de ${maxIntentos} intentos`));
              } else {
                setTimeout(verificarElemento, intervalo);
              }
            }
          }
          verificarElemento();
        });
      }

      if (window.location.href.includes('genComDatosReceptor')) {
        try {
          console.log("Buscando elemento #idtipodocreceptor...");
          const elemento = await esperarElementoEnDOM("#idtipodocreceptor");
          console.log("Elemento encontrado, llenando formulario...");
          let formu = document.getElementById('formulario');
          let selectIva = document.getElementById('idivareceptor');
          selectIva.value = 5;
          selectIva.dispatchEvent(new Event('change'));

          if (datos.tipoContribuyente === 'B') {
              formu[1].value = 80
              formu[7].checked = true;
          } 
          formu[16].checked = true;
          setTimeout(function () {
            validarCampos();
          }, 1500);
        } catch (error) {
          console.error("Error en evaluate:", error);
        }
      }
    }, datos);

    await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

    console.log("Script _2_ ejecutado correctamente.");
    return { success: true, message: "Punto de venta y tipo de comprobante seleccionados" };
  } catch (error) {
    console.error("Error al ejecutar el script:", error);
    throw error;
  }
}

module.exports = { paso_2_DatosDelReceptor };