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

            // Marcar condiciones de venta (checkboxes)
            if (datos.receptor.condicionesVenta && datos.receptor.condicionesVenta.length > 0) {
              const condicionesMap = {
                "Contado": "contado",
                "Tarjeta de Débito": "tarjeta_debito",
                "Tarjeta de Crédito": "tarjeta_credito",
                "Cuenta Corriente": "cuenta_corriente",
                "Cheque": "cheque",
                "Transferencia Bancaria": "transferencia",
                "Otra": "otra",
                "Otros medios de pago electrónico": "otros_electronicos"
              };

              datos.receptor.condicionesVenta.forEach(condicion => {
                const checkboxId = condicionesMap[condicion];
                if (checkboxId) {
                  // Intentar encontrar el checkbox por diferentes selectores
                  let checkbox = document.getElementById(checkboxId) ||
                                document.querySelector(`input[name="${checkboxId}"]`) ||
                                document.querySelector(`input[value="${condicion}"]`);

                  if (checkbox) {
                    checkbox.checked = true;
                    checkbox.dispatchEvent(new Event('change'));
                  } else {
                    console.warn(`No se encontró checkbox para: ${condicion}`);
                  }
                }
              });
            }

            // Marcar checkbox según tipo de contribuyente (compatibilidad)
            if (datos.tipoContribuyente === 'B') {
              formu[1].value = 80; // Tipo documento CUIT
              formu[7].checked = true; // Checkbox específico
            }

            // Marcar checkbox final (puede ser "domicilio fiscal", etc.)
            if (formu[16]) {
              formu[16].checked = true;
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

    // Esperar que validarCampos() se ejecute antes de esperar navegación
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Esperar la navegación (COPIADO EXACTO)
    await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

    console.log("paso_2_DatosDelReceptor_Unificado ejecutado correctamente.");
    return { success: true, message: "Datos del receptor completados" };
  } catch (error) {
    console.error("Error al ejecutar paso_2_DatosDelReceptor_Unificado:", error);
    throw error;
  }
}

module.exports = { paso_2_DatosDelReceptor_Unificado };
