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

    const resultadoEval = await newPage.evaluate(async (datos) => {
      const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      // Opciones reales (value distinto de "") de un <select>.
      const opcionesValidas = (select) =>
        Array.from(select.options)
          .filter(o => o.value !== '')
          .map(o => ({ value: o.value, text: o.text.trim() }));

      if (!window.location.href.includes('genComDatosReceptor')) {
        return { ok: true, skipped: true };
      }

      // Si no hay receptor específico, usar valores por defecto (modo normal)
      const receptor = (datos.receptor && datos.receptor.numeroDocumento)
        ? datos.receptor
        : {
            condicionIVA: 5,
            tipoDocumento: 80,
            numeroDocumento: null,
            condicionesVenta: ['otros']
          };

      // --- Condición IVA del receptor ---
      const selectIva = document.getElementById('idivareceptor');
      if (!selectIva) {
        return { ok: false, error: 'No se encontró el select de condición IVA del receptor (#idivareceptor)' };
      }

      const opcionesIva = opcionesValidas(selectIva);
      const targetIva = String(receptor.condicionIVA);

      // Si la condición IVA elegida no figura en el combo, AFIP no la permite para
      // este tipo de comprobante (p. ej. un receptor "Responsable Inscripto" exige
      // Factura A, no B). Cortamos acá con un mensaje claro en vez de un timeout.
      if (!opcionesIva.some(o => o.value === targetIva)) {
        const disponibles = opcionesIva.map(o => `${o.value}=${o.text}`).join(', ');
        return {
          ok: false,
          error: `La condición IVA del receptor (código ${targetIva}) no está disponible para este comprobante. ` +
                 `AFIP solo permite acá: ${disponibles || '(sin opciones)'}. ` +
                 `Revisá la "Condición frente al IVA" del cliente (un Responsable Inscripto requiere Factura A, no B).`
        };
      }

      selectIva.value = targetIva;
      selectIva.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(1500);

      // --- Tipo de documento ---
      // Según el comprobante, #idtipodocreceptor puede ser un <select> (factura
      // común: se elige CUIT/DNI/etc.) o un <input hidden> fijo (p. ej. Nota de
      // Crédito A: siempre CUIT). El hidden NO tiene `.options`, así que hacer
      // Array.from(.options) rompía con "undefined is not iterable". Solo recorremos
      // opciones si realmente es un select; si es hidden, AFIP ya lo dejó fijo.
      const selectTipoDoc = document.getElementById('idtipodocreceptor');
      if (selectTipoDoc) {
        const targetDoc = String(receptor.tipoDocumento);
        if (selectTipoDoc.options) {
          if (Array.from(selectTipoDoc.options).some(o => o.value === targetDoc)) {
            selectTipoDoc.value = targetDoc;
            selectTipoDoc.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(1500);
          }
        }
        // input hidden: el tipo de documento ya viene fijado por AFIP, no se toca.
      }

      // --- Número de documento (solo si existe) ---
      if (receptor.numeroDocumento) {
        const inputNumDoc = document.getElementById('nrodocreceptor');
        if (inputNumDoc) {
          inputNumDoc.value = receptor.numeroDocumento;
          inputNumDoc.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Esperar a que AFIP procese el documento antes de marcar condiciones
      await sleep(1000);

      // --- Formas de pago según receptor.condicionesVenta ---
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

      // --- Comprobante asociado (solo NC/ND) ---
      // Para una Nota de Crédito/Débito, AFIP muestra en esta misma pantalla un
      // bloque para referenciar la factura original. Lo completamos con los datos
      // que el usuario cargó a mano en el frontend.
      const ca = datos.comprobanteAsociado;
      if (ca) {
        const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

        // Tipo del comprobante asociado: se matchea por TEXTO (no por value), porque
        // los values de #cmp_asoc_tipo no son estables/conocidos. Buscamos la opción
        // cuyo texto coincida (o contenga) el tipo elegido (ej. "Factura B").
        const selectTipoAsoc = document.getElementById('cmp_asoc_tipo');
        if (selectTipoAsoc && ca.tipo) {
          const objetivo = norm(ca.tipo);
          const opcion = Array.from(selectTipoAsoc.options).find(
            o => norm(o.text) === objetivo || norm(o.text).includes(objetivo)
          );
          if (opcion) {
            selectTipoAsoc.value = opcion.value;
            selectTipoAsoc.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(800);
          }
        }

        const inputPtoVta = document.querySelector('input[name="cmpAsociadoPtoVta"]');
        if (inputPtoVta && ca.puntoVenta) {
          inputPtoVta.value = ca.puntoVenta;
          inputPtoVta.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const inputNro = document.querySelector('input[name="cmpAsociadoNro"]');
        if (inputNro && ca.numero) {
          inputNro.value = ca.numero;
          inputNro.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const inputFecha = document.querySelector('input[name="cmpAsociadoFechaEmision"]');
        if (inputFecha && ca.fecha) {
          inputFecha.value = ca.fecha;
          inputFecha.dispatchEvent(new Event('change', { bubbles: true }));
        }

        await sleep(500);
      }

      // Validar campos después de un delay
      setTimeout(function () {
        if (typeof validarCampos === 'function') {
          validarCampos();
        }
      }, 1500);

      return { ok: true };
    }, datos);

    // Si la validación dentro de la página falló (p. ej. condición IVA no disponible),
    // cortamos con el mensaje claro en lugar de esperar el timeout de navegación.
    if (resultadoEval && resultadoEval.ok === false) {
      throw new Error(resultadoEval.error || 'No se pudieron completar los datos del receptor');
    }

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
