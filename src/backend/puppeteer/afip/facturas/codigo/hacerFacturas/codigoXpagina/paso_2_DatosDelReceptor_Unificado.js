/**
 * Paso 2 - Datos del Receptor (VERSIÓN UNIFICADA)
 *
 * Detecta automáticamente según datos.receptor:
 * - Normal: Receptor genérico (IVA fijo = 5, condición de venta: otros)
 * - Cliente: Receptor específico (CUIT/DNI, condiciones de venta personalizadas)
 */

async function paso_2_DatosDelReceptor_Unificado(newPage, datos) {
  try {
    console.log("Ejecutando paso_2_DatosDelReceptor_Unificado...");

    await newPage.waitForSelector('#idtipodocreceptor', { timeout: 120000 });

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
        await esperarElementoEnDOM("#idtipodocreceptor");

        // Si no hay receptor específico, usar valores por defecto (modo normal)
        const receptor = (datos.receptor && datos.receptor.numeroDocumento)
          ? datos.receptor
          : {
              condicionIVA: 5,
              tipoDocumento: 80,
              numeroDocumento: null,
              condicionesVenta: ['otros']
            };

        // Seleccionar condición IVA del receptor
        let selectIva = document.getElementById('idivareceptor');
        selectIva.value = receptor.condicionIVA;
        selectIva.dispatchEvent(new Event('change'));

        // Esperar a que AFIP procese el cambio de IVA
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Seleccionar tipo de documento
        let selectTipoDoc = document.getElementById('idtipodocreceptor');
        selectTipoDoc.value = receptor.tipoDocumento;
        selectTipoDoc.dispatchEvent(new Event('change'));

        // Esperar a que AFIP procese el cambio de tipo de documento
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Ingresar número de documento (solo si existe)
        if (receptor.numeroDocumento) {
          let inputNumDoc = document.getElementById('nrodocreceptor');
          if (inputNumDoc) {
            inputNumDoc.value = receptor.numeroDocumento;
            inputNumDoc.dispatchEvent(new Event('change'));
          }
        }

        // Esperar a que AFIP procese el cambio de documento antes de marcar condiciones
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Marcar formas de pago según receptor.condicionesVenta
        if (receptor.condicionesVenta && receptor.condicionesVenta.length > 0) {
          receptor.condicionesVenta.forEach(formaPago => {
            if (!formaPago) return;

            let encontrado = false;

            // Buscar por label que contenga el texto
            const labels = document.querySelectorAll('label');
            for (const label of labels) {
              if (label.textContent.trim().toLowerCase().includes(formaPago.toLowerCase())) {
                let checkbox = label.querySelector('input[type="checkbox"]');
                if (!checkbox && label.htmlFor) {
                  checkbox = document.getElementById(label.htmlFor);
                }
                if (checkbox && !checkbox.checked) {
                  checkbox.click();
                  encontrado = true;
                  break;
                }
              }
            }

            // Fallback: buscar checkbox cuyo elemento padre contenga el texto
            if (!encontrado) {
              const todosCheckboxes = document.querySelectorAll('input[type="checkbox"]');
              for (const cb of todosCheckboxes) {
                const parent = cb.parentElement;
                if (parent && parent.textContent.trim().toLowerCase().includes(formaPago.toLowerCase())) {
                  if (!cb.checked) {
                    cb.click();
                  }
                  break;
                }
              }
            }
          });
        }

        // Validar campos después de un delay
        setTimeout(function () {
          if (typeof validarCampos === 'function') {
            validarCampos();
          }
        }, 1500);
      }
    }, datos);

    // Esperar a que aparezca la siguiente página (datos de operación)
    try {
      await Promise.race([
        newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        newPage.waitForSelector('#detalle_descripcion1', { timeout: 30000 })
      ]);
    } catch (raceError) {
      const currentUrl = newPage.url();
      if (!currentUrl.includes('genComDatosOperacion')) {
        throw raceError;
      }
    }

    console.log("paso_2_DatosDelReceptor_Unificado ejecutado correctamente.");
    return { success: true, message: "Datos del receptor completados" };
  } catch (error) {
    console.error("Error al ejecutar paso_2_DatosDelReceptor_Unificado:", error);
    throw error;
  }
}

module.exports = { paso_2_DatosDelReceptor_Unificado };
