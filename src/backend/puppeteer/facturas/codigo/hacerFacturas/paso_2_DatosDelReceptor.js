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
          formu[0].value = 5;
          formu[7].checked = true;
            formu[15].checked = true;
            setTimeout(function () {
             formu[38].click();
            }, 2500);
          console.log("Formulario llenado correctamente.");
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