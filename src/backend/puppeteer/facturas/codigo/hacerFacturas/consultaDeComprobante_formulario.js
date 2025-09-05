async function paso_X_ConsultaComprobantes(newPage, datos) {
  try {
    console.log("Ejecutando script consulta comprobantes...");

    // Esperar a que los elementos estén presentes en la página
    await newPage.waitForSelector('#fed', { timeout: 120000 });

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

      // Verificar que estamos en la página correcta (ajusta la URL según corresponda)
      if (window.location.href.includes('filtrarComprobantesGenerados')) {
        try {
          console.log("Configurando fechas y filtros de consulta...");

          // Debug logs para cada elemento
          console.log("Esperando #fed...");
          const fechaEmisionDesde_btn = await esperarElementoEnDOM("#fed");
          console.log("#fed encontrado");
          fechaEmisionDesde_btn.click();
          fechaEmisionDesde_btn.value = datos.consultaDesde;
         // fechaEmisionDesde_btn.value = '01/07/2025';

          console.log("Esperando #feh...");
          const fechaEmisionHasta_btn = await esperarElementoEnDOM("#feh");
          console.log("#feh encontrado");
          fechaEmisionHasta_btn.value = datos.consultaHasta;

          // Cambia aquí: buscar por name en vez de id
          console.log("Esperando [name='idTipoComprobante']...");
          const tipoComprobanteSelect = await esperarElementoEnDOM("[name='idTipoComprobante']");
          console.log("[name='idTipoComprobante'] encontrado");
          tipoComprobanteSelect.value = datos.idTipoComprobante;

          console.log("Esperando #puntodeventa...");
          const puntoDeVentaSelect = await esperarElementoEnDOM("#puntodeventa");
          console.log("#puntodeventa encontrado");
          puntoDeVentaSelect.value = datos.idPuntoDeVenta;
          puntoDeVentaSelect.dispatchEvent(new Event('change'));

          // Buscar y seleccionar la empresa por nombre en el select de punto de venta
          const nombreEmpresa = datos.nombreEmpresa;
          console.log(`que es empresaAElegir: ${nombreEmpresa}`);

              puntoDeVentaSelect.selectedIndex = 1;
              puntoDeVentaSelect.dispatchEvent(new Event('change'));

          // let encontrado = false;
          // for (let i = 0; i < puntoDeVentaSelect.options.length; i++) {
          //   const texto = puntoDeVentaSelect.options[i].textContent.trim();
          //   console.log(`Opción ${i}: ${texto}`);
          //   if (texto === nombreEmpresa) {
          //     puntoDeVentaSelect.selectedIndex = i;
          //     puntoDeVentaSelect.dispatchEvent(new Event('change'));
          //     console.log(`Seleccionada la empresa: ${texto}`);
          //     encontrado = true;
          //     break;
          //   }
          // }
          // if (!encontrado) {
          //   console.warn(`No se encontró la empresa "${nombreEmpresa}" en el select de punto de venta`);
          // }
          /**
           * 
           * const nombreEmpresa = datos.nombreEmpresa;
console.log(`que es empresaAElegir: ${nombreEmpresa}`);
const botones = document.querySelectorAll("#puntodeventa input[type='button']");
let encontrado = false;
for (let i = 0; i < botones.length; i++) {
    const texto = botones[i].value?.trim();
    console.log(`Botón ${i}: ${texto}`);
    if (texto === nombreEmpresa) {
        await botones[i].click();
        console.log(`Haciendo click en el botón de la empresa: ${texto}`);
        encontrado = true;
        break;
    }
}
if (!encontrado) {
    console.warn(`No se encontró la empresa "${nombreEmpresa}" entre los botones de punto de venta`);
}
           */

          await new Promise(resolve => setTimeout(resolve, 1000));

          const btnContinuar = document.querySelector("input[type='button'][value='Buscar']");
          if (btnContinuar) {
            btnContinuar.setAttribute("onclick", "validarCampos();");
            btnContinuar.click();
          }

          console.log("Consulta iniciada correctamente");

        } catch (error) {
          console.error("Error en evaluate:", error);
          throw error;
        }
      } else {
        console.error("No se está en la página de consulta de comprobantes. URL:", window.location.href);
      }
    }, datos);

    // Esperar a que se procese la consulta
    await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

    console.log("Script de consulta ejecutado correctamente.");
    return { success: true, message: "Consulta de comprobantes realizada exitosamente" };

  } catch (error) {
    console.error("Error al ejecutar el script de consulta:", error);
    throw error;
  }
}

module.exports = { paso_X_ConsultaComprobantes };