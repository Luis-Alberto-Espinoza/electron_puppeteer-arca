const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

function generadorDeInforme(archivos) {
  //  console.log("informe de contenido de archivo :", archivos)
  //   console.log("Archivos recibidos:", archivos);
    const [rutaArchivoComprobante, rutaArchivoAlicuotas] = archivos;
    let contadorDeDiferencias = 0;
    let diferencias = [];

    try {
        // Leer los archivos
        const bufferComprobantes = fs.readFileSync(rutaArchivoComprobante);
        const archivoComprobantes = iconv.decode(bufferComprobantes, 'ISO-8859-15');
        const archivoAlicuotas = fs.readFileSync(rutaArchivoAlicuotas, 'utf8');
        // console.log("Archivos leídos correctamente.");

        // Procesar archivo de comprobantes
        const comprobantes = {};
        // console.log("inicio de archivoComprobantes.split('\n').forEach")
        archivoComprobantes.split('\n').forEach((linea, i) => {
            if (linea.trim() === '') return; // Ignorar líneas vacías

            const comprobante = {
                TipoDeComprobante: linea.substring(8, 11).trim(),
                PuntoDeVenta: linea.substring(11, 16).trim(),
                numero: linea.substring(16, 36).trim(),
                importeTotal: parseFloat(linea.substring(108, 123).replace(',', '.')),
                lineaCompleta: linea
            };
            // if(i === 634 || i === 1058 || i === 5447 ){ 
            //     console.log('linea:', i, 'linea:', linea);
            // }

            const indice = comprobante.TipoDeComprobante + comprobante.PuntoDeVenta + comprobante.numero;
            comprobantes[indice] = comprobante;
        });

        // console.log(archivoComprobantes.split('\n').length)
        // console.log("Archivo de comprobantes procesado.");

        // Procesar archivo de alícuotas
        const alicuotas = {};
        let indiceActual = null;
        let sumaAlicuotas = 0;
        let coincidencias = 0;

        archivoAlicuotas.split('\n').forEach(linea => {
            if (linea.trim() === '') return; // Ignorar líneas vacías

            const tipoComprobante = linea.substring(0, 3).trim();
            const puntoDeVenta = linea.substring(3, 8).trim();
            const numeroComprobante = linea.substring(8, 28).trim();
            const impuestoNeto = parseFloat(linea.substring(28, 43).replace(',', '.'));
            const impuestoLiquidado = parseFloat(linea.substring(47, 62).replace(',', '.'));

            const indice = tipoComprobante + puntoDeVenta + numeroComprobante;


            // console.log("\nLinea ejemplo\n", linea);
            // console.log("\ndesglose \n", tipoComprobante, puntoDeVenta, numeroComprobante);

            // console.log("Número de comprobante (alícuotas):", numeroComprobante, "Longitud:", numeroComprobante.length);
            // console.log("Impuesto Neto:", impuestoNeto, "Impuesto Liquidado:", impuestoLiquidado, "Total:", (impuestoNeto + impuestoLiquidado));

            if (indice === indiceActual) {
                // Seguimos en el mismo comprobante, acumular
                sumaAlicuotas += impuestoNeto + impuestoLiquidado;
            } else {
                // Nuevo comprobante, guardar el anterior si existe
                if (indiceActual) {
                    alicuotas[indiceActual] = {
                        indice: indiceActual,
                        importeTotal: sumaAlicuotas
                    };
                }

                // Iniciar con el nuevo comprobante
                indiceActual = indice;
                sumaAlicuotas = impuestoNeto + impuestoLiquidado;
            }
        });

        // Guardar el último comprobante procesado
        if (indiceActual) {
            alicuotas[indiceActual] = {
                indice: indiceActual,
                importeTotal: sumaAlicuotas
            };
        }

        // Comparar y modificar comprobantes si es necesario
        const lineasModificadas = Object.values(comprobantes).map(comprobante => {
            const indice = comprobante.TipoDeComprobante + comprobante.PuntoDeVenta + comprobante.numero;
            const alicuotaCorrespondiente = alicuotas[indice];
            // Solo modificar si existe en alícuotas y hay diferencia
            if (alicuotaCorrespondiente &&
                Math.abs(comprobante.importeTotal - alicuotaCorrespondiente.importeTotal) != 0) {
                contadorDeDiferencias++;
                const diferencia = alicuotaCorrespondiente.importeTotal - comprobante.importeTotal;
                diferencias.push({
                    indice: indice,
                    tipo: comprobante.TipoDeComprobante,
                    puntoVenta: comprobante.PuntoDeVenta,
                    numero: comprobante.numero,
                    importeComprobante: comprobante.importeTotal,
                    importeAlicuota: alicuotaCorrespondiente.importeTotal,
                    diferencia: diferencia
                });

                // console.log('\n====== DIFERENCIA ENCONTRADA ======');
                // console.log('Número de comprobante (comprobantes):', comprobante.numero, "Longitud:", comprobante.numero.length);
                // console.log('Importe en comprobante:', comprobante.importeTotal);
                // console.log('Importe calculado de alícuotas:', alicuotaCorrespondiente.importeTotal);
                // console.log('Diferencia:', diferencia);

                // Formatear el nuevo importe
                const nuevoImporteFormateado = formatearImporte(alicuotaCorrespondiente.importeTotal);

                // Reemplazar el importe en la línea original
                return comprobante.lineaCompleta.substring(0, 108) +
                    nuevoImporteFormateado +
                    comprobante.lineaCompleta.substring(123);
            } else {
                coincidencias++;
                return comprobante.lineaCompleta;
            }
        });


        const mensaje = `
        Comprobantes procesados: ${Object.keys(comprobantes).length}
        Alícuotas procesadas: ${Object.keys(alicuotas).length}
        Coincidencias: ${coincidencias}
        Diferencias encontradas: ${contadorDeDiferencias}
        `;

        // Validar longitud de líneas
        const lineasExcedidas = validarLongitudLineas(lineasModificadas);
        const mensajeValidacion = lineasExcedidas.length > 0
            ? `\n\n\nAdvertencia: ${lineasExcedidas.length} líneas distintas al límite de 267 caracteres.\n${
                lineasExcedidas.map(linea => 
                    `\nLínea ${linea.numeroLinea} (longitud: ${linea.longitud}):\n${linea.contenido}`
                ).join('\n')
            }`
            : '\nTodas las líneas cumplen con el límite de longitud.';


           // console.log(     'libroActualizado:', lineasModificadas,"\n", 'mensaje:', mensaje.trim() +"\n"+ mensajeValidacion,"\n\n",
                // 'diferencias:', diferencias,
                // '\nlineasExcedidas:' ,lineasExcedidas)
        return {
            libroActualizado: lineasModificadas,
            mensaje: mensaje.trim() + mensajeValidacion,
            diferencias: diferencias,
            lineasExcedidas: lineasExcedidas
        };

    } catch (error) {
        console.error('Error al procesar archivos:', error);
        return {
            libroActualizado: [],
            mensaje: 'Error al procesar archivos. Consulta la consola para más detalles.'
        };
    }
}

function formatearImporte(importe) {
    // Convertir a string con 2 decimales (formato 0000000000000.00)
    const importeStr = importe.toFixed(2);

    // Eliminar el punto decimal y rellenar con ceros a la izquierda hasta 15 caracteres
    return importeStr.replace('.', '').padStart(15, '0');
}

// Agregar nueva función
function validarLongitudLineas(lineasModificadas) {
    const lineasExcedidas = [];
    
    Object.values(lineasModificadas).forEach((linea, index) => {
        if (linea.length != 267) {
            lineasExcedidas.push({
                numeroLinea: index + 1,
                longitud: linea.length,
                contenido: linea
            });
        }
    });
    
    return lineasExcedidas;
}

module.exports = generadorDeInforme;

let urlArchivos = [
    '/home/pinchechita/Documentos/Users/Luis_/Documents/Proyecot_AFIP/codigo_electron/AFIP_Electron/src/backend/libroIVA/archivos/rutaArchivoResultados.txt',
    '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025010.txt'
  ]
generadorDeInforme(urlArchivos)