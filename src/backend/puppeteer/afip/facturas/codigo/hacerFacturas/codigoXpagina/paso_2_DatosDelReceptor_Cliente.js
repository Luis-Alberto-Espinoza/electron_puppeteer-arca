/**
 * Paso 2 - Datos del Receptor (VERSIÓN CLIENTE)
 * Permite especificar:
 * - Tipo y número de documento del receptor
 * - Condición IVA del receptor
 * - Condiciones de venta (checkboxes)
 * 
 * 
Ejecutando paso_2_DatosDelReceptor_Cliente...
Datos del receptor: {
  tipoActividad: 'Servicio',
  tipoContribuyente: 'C',
  fechaComprobante: '13/01/2026',
  puntoVenta: 'OZCARIZ GRACIELA EDITH',
  fechaDesde: '13/01/2026',
  fechaHasta: '13/01/2026',
  fechaVtoPago: '13/01/2026',
  receptor: {
    tipoDocumento: 80,
    numeroDocumento: '30500007539',
    condicionIVA: 1,
    condicionesVenta: [ 'Cuenta Corriente' ],
    nombreCliente: ''
  },
  lineasDetalle: [
    {
      descripcion: 'asdasdasd',
      unidadMedida: 7,
      cantidad: 1,
      precioUnitario: 324234234
    }
  ],
  carpetaPDF: null,
  nombreArchivoPDF: null
}


 */

async function paso_2_DatosDelReceptor_Cliente(newPage, datos) {
  try {
    console.log("Ejecutando paso_2_DatosDelReceptor_Cliente...");
    console.log("Datos del receptor:", datos);

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
          if (datos.receptor.condicionesVenta && datos.receptor.condicionesVenta.length > 0) {
            const formasDePagoMap = {
              "Contado": "formadepago1",
              "Tarjeta de Débito": "formadepago2",
              "Tarjeta de Crédito": "formadepago3",
              "Cuenta Corriente": "formadepago4",
              "Cheque": "formadepago5",
              "Transferencia Bancaria": "formadepago6",
              "Otra": "formadepago7",
              "Otros medios de pago electrónico": "formadepago8"
            };

            datos.receptor.condicionesVenta.forEach(formaPago => {
              const checkboxId = formasDePagoMap[formaPago];
              if (checkboxId) {
                const checkbox = document.getElementById(checkboxId);
                if (checkbox) {
                  checkbox.checked = true;
                  checkbox.dispatchEvent(new Event('change'));
                  console.log(`Forma de pago marcada: ${formaPago} (${checkboxId})`);
                } else {
                  console.warn(`No se encontró el checkbox con id: ${checkboxId}`);
                }
              } else {
                console.warn(`Forma de pago no reconocida: ${formaPago}`);
              }
            });
          }

          // Validar campos después de un delay
          setTimeout(function () {
            if (typeof validarCampos === 'function') {
              validarCampos();
            }
          }, 1500);

        } catch (error) {
          console.error("Error en evaluate:", error);
        }
      }
    }, datos);

    // Esperar la navegación después de que validarCampos() dispare el submit
    await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

    console.log("paso_2_DatosDelReceptor_Cliente ejecutado correctamente.");
    return { success: true, message: "Datos del receptor (cliente) completados" };
  } catch (error) {
    console.error("Error al ejecutar paso_2_DatosDelReceptor_Cliente:", error);
    throw error;
  }
}

module.exports = { paso_2_DatosDelReceptor_Cliente };
