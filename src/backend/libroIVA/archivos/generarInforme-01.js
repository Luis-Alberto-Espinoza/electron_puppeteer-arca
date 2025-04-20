const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

function generadorDeInforme(archivos, archivosModificados = null) {  
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

        let sumador = 0;
        let contadordelineas = 0;
        // Procesar archivo de comprobantes
        const comprobantes = {};
        // console.log("inicio de archivoComprobantes.split('\n').forEach")
        archivoComprobantes.split('\n').forEach((linea, i) => {
            if (linea.trim() === '') return; // Ignorar líneas vacías
            contadordelineas++
            const comprobante = {
                TipoDeComprobante: linea.substring(8, 11).trim(),
                PuntoDeVenta: linea.substring(11, 16).trim(),
                numero: linea.substring(16, 36).trim(),
                importeTotal: parseFloat(linea.substring(108, 123).replace(',', '.')),
                impuestosInternos: parseFloat(linea.substring(213, 228).replace(',', '.')),
                lineaCompleta: linea
            };
            // if(i === 634 || i === 1058 || i === 5447 ){ 000000000515918 FINAL DE LOS FINALES SUMADOR ,  909  de  6580
            //     console.log('linea:', i, 'linea:', linea);
            // }
            // if (comprobante.impuestosInternos != 0) {
            //     // console.log("$$$$$$$ ===> ", linea)
            //     sumador++;
            //     console.log("$$$$$$$ ===> ", comprobante.numero)


            // }
            const indice = comprobante.TipoDeComprobante + comprobante.PuntoDeVenta + comprobante.numero;
            comprobantes[indice] = comprobante;
        });
        // console.log("FINAL DE LOS FINALES SUMADOR , ", sumador ," de ", contadordelineas)

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

        let contadorDeDiferenciasMayor1 = 0;

        // Comparar y modificar comprobantes si es necesario
        const lineasModificadas = Object.values(comprobantes).map(comprobante => {
            const indice = comprobante.TipoDeComprobante + comprobante.PuntoDeVenta + comprobante.numero;
            const alicuotaCorrespondiente = alicuotas[indice];
            // Solo modificar si existe en alícuotas y hay diferencia
            if (alicuotaCorrespondiente &&
                Math.abs(comprobante.importeTotal - (alicuotaCorrespondiente.importeTotal + comprobante.impuestosInternos)) != 0) {
                contadorDeDiferencias++;
                const diferencia = (alicuotaCorrespondiente.importeTotal + comprobante.impuestosInternos) - comprobante.importeTotal;
                // if (diferencia > 1){

                    contadorDeDiferenciasMayor1 ++;
                    diferencias.push({
                        indice: indice,
                        tipo: comprobante.TipoDeComprobante,
                        puntoVenta: comprobante.PuntoDeVenta,
                        numero: comprobante.numero,
                        importeComprobante: comprobante.importeTotal,
                        importeAlicuotaMasImpuestoInternoEnCompŕobante: (alicuotaCorrespondiente.importeTotal+ comprobante.impuestosInternos),
                        diferencia: diferencia
                    });
                    
                // }
                // console.log('\n====== DIFERENCIA ENCONTRADA ======');
                // console.log('Número de comprobante (comprobantes):', comprobante.numero, "Longitud:", comprobante.numero.length);
                // console.log('Importe en comprobante:', comprobante.importeTotal);
                // console.log('Importe calculado de alícuotas:', alicuotaCorrespondiente.importeTotal);
                // console.log('Diferencia:', diferencia);

                // Formatear el nuevo importe
                const nuevoImporteFormateado = formatearImporte(alicuotaCorrespondiente.importeTotal+ comprobante.impuestosInternos);

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
// console.log(mensaje +"\n diferencias mayores a uno : ", contadorDeDiferenciasMayor1,"\n" , diferencias)
        // Validar longitud de líneas
        const lineasExcedidas = validarLongitudLineas(lineasModificadas);
        const mensajeValidacion = lineasExcedidas.length > 0
            ? `\n\n\nAdvertencia: ${lineasExcedidas.length} líneas distintas al límite de 267 caracteres.\n${lineasExcedidas.map(linea =>
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
    const importeStr = importe.toFixed(0);

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

//let urlArchivos = [
    // '/home/pinchechita/Documentos/Users/Luis_/Documents/Proyecot_AFIP/codigo_electron/AFIP_Electron/src/backend/libroIVA/archivos/rutaArchivoResultados.txt',
    // '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_CBTE 30717267024-2025020_F.TXT',
    // '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025020_F.txt'
   // '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_CBTE 30717267024-2025020.TXT',
   // '/home/pinchechita/Descargas/LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025020.txt'
//]
//console.log(generadorDeInforme(urlArchivos))

//