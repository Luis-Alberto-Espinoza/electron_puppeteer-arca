/**
 * Hace clic en el botón "Ingresos Brutos" para asegurar que la tabla de planes esté visible.
 * @param {import('puppeteer').Page} page - La instancia de la página de Puppeteer.
 */
async function prepararTablaIngresosBrutos(page) {
  try {
    const frameHandle = await page.waitForSelector('iframe[src="nucleo/inicio.zul"]');
    const frame = await frameHandle.contentFrame();
    if (!frame) throw new Error('No se pudo encontrar el contentFrame del iframe.');

    console.log('Preparando tabla de Ingresos Brutos...');

    await frame.evaluate(async () => {
      const buttons = document.querySelectorAll('.z-button');
      let clicked = false;
      for (const btn of buttons) {
        if (btn.textContent.trim() === "Ingresos Brutos") {
          btn.click();
          clicked = true;
          break;
        }
      }
      if (!clicked) throw new Error('No se encontró el botón "Ingresos Brutos".');
    });

    // Espera prudencial para que la tabla se cargue después del clic
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Tabla de Ingresos Brutos preparada.');

  } catch (error) {
    console.error('Error al preparar la tabla de Ingresos Brutos:', error);
    throw new Error('Fallo al preparar la tabla de Ingresos Brutos.');
  }
}

/**
 * Navega al iframe principal y cuenta cuántas filas de planes de pago tienen el estado "VIGENTE".
 * @param {import('puppeteer').Page} page - La instancia de la página de Puppeteer.
 * @returns {Promise<number>} - El número de filas vigentes encontradas.
 */
async function contarFilasVigentes(page) {
  try {
    const frameHandle = await page.waitForSelector('iframe[src="nucleo/inicio.zul"]');
    const frame = await frameHandle.contentFrame();
    if (!frame) throw new Error('No se pudo encontrar el contentFrame del iframe.');

    console.log('Contando filas con estado VIGENTE...');

    return await frame.evaluate(() => {
      const tables = document.querySelectorAll('table');
      if (tables.length < 2) return 0; // Si no está la tabla esperada, no hay filas.
      
      const targetTbody = tables[1].querySelector('tbody');
      if (!targetTbody) return 0;

      const filas = targetTbody.children;
      let count = 0;
      for (const row of filas) {
        if (row.children.length > 2) {
          const cell = row.children[2]; // La tercera celda corresponde al estado
          if (cell && cell.textContent.trim().toUpperCase() === "VIGENTE") {
            count++;
          }
        }
      }
      return count;
    });

  } catch (error) {
    console.error('Error al contar las filas vigentes:', error);
    throw new Error('Fallo al contar las filas vigentes.');
  }
}

/**
 * Hace clic en el botón "Imprimir Constancia" para una fila "VIGENTE" específica, identificada por su índice.
 * @param {import('puppeteer').Page} page - La instancia de la página de Puppeteer.
 * @param {number} indice - El índice de la fila VIGENTE a descargar (basado en 0).
 */
async function descargarFilaVigentePorIndice(page, indice) {
  try {
    const frameHandle = await page.waitForSelector('iframe[src="nucleo/inicio.zul"]');
    const frame = await frameHandle.contentFrame();
    if (!frame) throw new Error('No se pudo encontrar el contentFrame del iframe.');

    console.log(`Descargando fila VIGENTE en el índice ${indice}...`);

    const resultado = await frame.evaluate(async (idx) => {
      const tables = document.querySelectorAll('table');
      if (tables.length < 2) {
        return { success: false, error: 'No se encontró la tabla de planes de pago.' };
      }
      const targetTbody = tables[1].querySelector('tbody');
      if (!targetTbody) {
        return { success: false, error: 'La tabla de planes no tiene cuerpo (tbody).' };
      }

      const filasVigentes = [];
      for (const row of targetTbody.children) {
        if (row.children.length > 2) {
          const cell = row.children[2];
          if (cell && cell.textContent.trim().toUpperCase() === "VIGENTE") {
            filasVigentes.push(row);
          }
        }
      }

      if (idx >= filasVigentes.length) {
        return { success: false, error: `Índice ${idx} fuera de rango. Se encontraron ${filasVigentes.length} filas vigentes.` };
      }

      const filaParaHacerClick = filasVigentes[idx];
      filaParaHacerClick.click();
      
      await new Promise(resolve => setTimeout(resolve, 1500));

      const botones = document.querySelectorAll('.z-button');
      let clicked = false;
      for (const btn of botones) {
        if (btn.textContent.trim() === "Imprimir Constancia") {
          btn.click();
          clicked = true;
          break;
        }
      }
      
      if (!clicked) {
        return { success: false, error: 'No se encontró el botón "Imprimir Constancia" después de hacer clic en la fila.' };
      }

      return { success: true };

    }, indice);

    if (!resultado.success) {
        throw new Error(resultado.error);
    }

    console.log(`Clic para descarga del índice ${indice} completado.`);

  } catch (error) {
    console.error(`Error al descargar la fila en el índice ${indice}:`, error);
    throw new Error(`Fallo en la descarga del índice ${indice}.`);
  }
}

module.exports = { prepararTablaIngresosBrutos, contarFilasVigentes, descargarFilaVigentePorIndice };