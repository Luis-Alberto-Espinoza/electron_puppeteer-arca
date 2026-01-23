/**
 * Paso 2 - Datos del Receptor (VERSIÓN UNIFICADA - REHECHO CORRECTAMENTE)
 *
 * Unifica paso_2_DatosDelReceptor.js y paso_2_DatosDelReceptor_Cliente.js
 * copiando EXACTAMENTE el código que funciona.
 *
 * Diferencia:
 * - Normal: Receptor genérico (IVA fijo = 5, checkboxes fijos)
 * - Cliente: Receptor específico (CUIT/DNI, condiciones de venta)
 *
 * Detecta automáticamente según datos.receptor
 */

async function paso_2_DatosDelReceptor_Unificado(newPage, datos) {
  try {
    console.log("Ejecutando paso_2_DatosDelReceptor_Unificado...");
console.log("%%%%%%%%%%%%====>>>>  mira aca ", datos)
    // Esperar a que el elemento esté presente en la página (COPIADO EXACTO)
    await newPage.waitForSelector('#idtipodocreceptor', { timeout: 120000 });

    // Ejecutar el script en la página
    await newPage.evaluate(async (datos) => {
      // Función esperarElementoEnDOM (COPIADA EXACTA de ambos archivos)
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

          // Obtener el formulario
          let formu = document.getElementById('formulario');

          // Detectar si es receptor específico o genérico
          const esReceptorEspecifico = datos.receptor && datos.receptor.numeroDocumento;

          if (esReceptorEspecifico) {
            // ==========================================
            // MODO CLIENTE (COPIADO EXACTO de paso_2_DatosDelReceptor_Cliente.js líneas 49-115)
            // ==========================================

            // Seleccionar condición IVA del receptor
            let selectIva = document.getElementById('idivareceptor');
            selectIva.value = datos.receptor.condicionIVA;
            selectIva.dispatchEvent(new Event('change'));

            // Seleccionar tipo de documento
            let selectTipoDoc = document.getElementById('idtipodocreceptor');
            selectTipoDoc.value = datos.receptor.tipoDocumento; // 80=CUIT, 96=DNI
            selectTipoDoc.dispatchEvent(new Event('change'));

            // Ingresar número de documento
            let inputNumDoc = document.getElementById('nrodocreceptor');
            if (inputNumDoc) {
              inputNumDoc.value = datos.receptor.numeroDocumento;
              inputNumDoc.dispatchEvent(new Event('change'));
            }

            // Marcar formas de pago según datos.receptor.condicionesVenta
            // Buscar por texto visible del label (más robusto que por ID)
            console.log("Condiciones de venta recibidas:", datos.receptor.condicionesVenta);
            if (datos.receptor.condicionesVenta && datos.receptor.condicionesVenta.length > 0) {
              datos.receptor.condicionesVenta.forEach(formaPago => {
                let checkboxEncontrado = false;

                // Estrategia 1: Buscar label que contenga el texto y obtener el checkbox asociado
                const labels = document.querySelectorAll('label');
                for (const label of labels) {
                  if (label.textContent.trim().toLowerCase().includes(formaPago.toLowerCase())) {
                    // El checkbox puede estar dentro del label o referenciado por 'for'
                    let checkbox = label.querySelector('input[type="checkbox"]');
                    if (!checkbox && label.htmlFor) {
                      checkbox = document.getElementById(label.htmlFor);
                    }
                    if (checkbox) {
                      checkbox.checked = true;
                      checkbox.dispatchEvent(new Event('change'));
                      console.log(`Forma de pago marcada por texto: ${formaPago}`);
                      checkboxEncontrado = true;
                      break;
                    }
                  }
                }

                // Estrategia 2 (fallback): Buscar checkbox cuyo siguiente hermano o padre contenga el texto
                if (!checkboxEncontrado) {
                  const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                  for (const checkbox of checkboxes) {
                    const parent = checkbox.parentElement;
                    const nextSibling = checkbox.nextSibling;
                    const textoParent = parent ? parent.textContent.trim().toLowerCase() : '';
                    const textoSibling = nextSibling ? nextSibling.textContent?.trim().toLowerCase() : '';

                    if (textoParent.includes(formaPago.toLowerCase()) ||
                        textoSibling?.includes(formaPago.toLowerCase())) {
                      checkbox.checked = true;
                      checkbox.dispatchEvent(new Event('change'));
                      console.log(`Forma de pago marcada por contexto: ${formaPago}`);
                      checkboxEncontrado = true;
                      break;
                    }
                  }
                }

                if (!checkboxEncontrado) {
                  console.warn(`No se encontró checkbox para forma de pago: ${formaPago}`);
                }
              });
            }

            // Marcar checkbox según tipo de contribuyente (compatibilidad)
            if (datos.tipoContribuyente === 'B') {
              formu[1].value = 80; // Tipo documento CUIT
              formu[7].checked = true; // Checkbox específico
            }

            // Solo marcar checkbox por defecto si NO vienen condiciones de venta del frontend
            // Esto evita sobreescribir las condiciones de venta seleccionadas por el usuario
            if (!datos.receptor.condicionesVenta || datos.receptor.condicionesVenta.length === 0) {
              if (formu[16]) {
                formu[16].checked = true; // "otros medios de pago electrónico" por defecto
                console.log('Forma de pago por defecto: formu[16] (otros medios electrónicos)');
              }
            }

            // Validar campos después de un delay
            setTimeout(function () {
              if (typeof validarCampos === 'function') {
                validarCampos();
              }
            }, 1500);

          } else {
            // ==========================================
            // MODO NORMAL (COPIADO EXACTO de paso_2_DatosDelReceptor.js líneas 37-48)
            // ==========================================

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
          }

        } catch (error) {
          console.error("Error en evaluate:", error);
        }
      }
    }, datos);

    // Esperar a que aparezca la siguiente página (datos de operación)
    // Usamos Promise.race para manejar dos escenarios:
    // 1. La navegación aún no ocurrió -> waitForNavigation la captura
    // 2. La navegación ya ocurrió -> waitForSelector detecta la nueva página
    try {
      await Promise.race([
        newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        newPage.waitForSelector('#detalle_descripcion1', { timeout: 30000 }) // Elemento del paso 3
      ]);
    } catch (raceError) {
      // Si ambos fallan, verificar si ya estamos en la página correcta
      const currentUrl = newPage.url();
      if (!currentUrl.includes('genComDatosOperacion')) {
        throw raceError;
      }
      console.log("Ya estamos en la página de datos de operación");
    }

    console.log("paso_2_DatosDelReceptor_Unificado ejecutado correctamente.");
    return { success: true, message: "Datos del receptor completados" };
  } catch (error) {
    console.error("Error al ejecutar paso_2_DatosDelReceptor_Unificado:", error);
    throw error;
  }
}

module.exports = { paso_2_DatosDelReceptor_Unificado };
