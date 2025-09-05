async function extraerDatosDeConsultaComprobantes(newPage, datos) {
  try {
    console.log("Ejecutando script extracción de datos...");

    // Esperar a que la tabla esté presente en la página
    await newPage.waitForSelector('#contenido > div.jig_borde > div > table > tbody > tr', { timeout: 120000 });

    // Ejecutar el script en la página
    const resultados = await newPage.evaluate(async (datos) => {
      function esperarElementoEnDOM(selector, maxIntentos = 10, intervalo = 500) {
        return new Promise((resolve, reject) => {
          let intentos = 0;

          function verificarElemento() {
            let elementos = document.querySelectorAll(selector);
            if (elementos.length > 0) {
              resolve(elementos);
            } else {
              intentos++;
              if (intentos >= maxIntentos) {
                reject(new Error(`Elementos ${selector} no encontrados después de ${maxIntentos} intentos`));
              } else {
                setTimeout(verificarElemento, intervalo);
              }
            }
          }
          verificarElemento();
        });
      }

      // Verificar que estamos en la página correcta (ajusta la URL según corresponda)
      if (window.location.href.includes('consultas') || window.location.href.includes('buscarComprobantesGenerados')) {
        try {
          console.log("Extrayendo datos de la tabla...");
          
          // Buscar todos los elementos de la séptima columna (montos)
          let elementos = await esperarElementoEnDOM("#contenido > div.jig_borde > div > table > tbody > tr > td:nth-child(7)");
          let suma = 0;
          let montos = [];
          let stringi = "";

          elementos.forEach((elemento, index) => {
              let monto = parseFloat(elemento.textContent.trim());
              let fila = elemento.closest("tr"); // Selecciona la fila actual
              let celdaTerceraColumna = fila.querySelector("td:nth-child(3)"); // Selecciona la tercera columna dentro de la fila actual
              
              if (celdaTerceraColumna && !isNaN(monto)) {
                  let textoTerceraColumna = celdaTerceraColumna.textContent.trim();
                  stringi += textoTerceraColumna + ", " + monto + "\n";
                  montos.push(monto);
              }
          });

          // Sumar los montos
          suma = montos.reduce((acumulador, monto) => acumulador + monto, 0);

          console.log("La suma total de los montos es:", suma);
          console.log("La cantidad de facturas es:", montos.length);
          
          // Retornar los resultados
          return {
            suma: suma,
            cantidadFacturas: montos.length,
            montos: montos,
            detalle: stringi,
            datosExtraidos: true
          };
          
        } catch (error) {
          console.error("Error en evaluate:", error);
          throw error;
        }
      } else {
        throw new Error("No se está en la página de consulta de comprobantes");
      }
    }, datos);

    console.log("Script de extracción ejecutado correctamente.");
    return { 
      success: true, 
      message: "Datos extraídos exitosamente",
      data: resultados
    };
    
  } catch (error) {
    console.error("Error al ejecutar el script de extracción:", error);
    throw error;
  }
}

module.exports = { extraerDatosDeConsultaComprobantes };