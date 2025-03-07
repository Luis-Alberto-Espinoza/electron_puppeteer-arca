const fs = require('fs');
const path = require('path');

function generadorDeInforme(archivos) {
    // console.log("Archivos recibidos:", archivos);
    const [rutaArchivoComprobante, rutaArchivoAlicuotas] = archivos;
    let contadorDeDiferencias = 0;
    let diferencias = [];

    try {
        // Leer los archivos
        const archivoComprobantes = fs.readFileSync(rutaArchivoComprobante, 'utf8');
        const archivoAlicuotas = fs.readFileSync(rutaArchivoAlicuotas, 'utf8');
        // console.log("Archivos leídos correctamente.");

        // Procesar archivo de comprobantes
        const comprobantes = {};
        archivoComprobantes.split('\n').forEach(linea => {
            if (linea.trim() === '') return; // Ignorar líneas vacías
            
            const comprobante = {
                numero: linea.substring(16, 36).trim(),
                importeTotal: parseFloat(linea.substring(108, 123).replace(',', '.')),
                lineaCompleta: linea
            };
            
            comprobantes[comprobante.numero] = comprobante;
        });
        // console.log("Archivo de comprobantes procesado.");

        // Procesar archivo de alícuotas
        const alicuotas = {};
        let numeroComprobanteActual = null;
        let sumaAlicuotas = 0;

        archivoAlicuotas.split('\n').forEach(linea => {
            if (linea.trim() === '') return; // Ignorar líneas vacías
            
            const numeroComprobante = linea.substring(8, 28).trim();
            const impuestoNeto = parseFloat(linea.substring(28, 43).replace(',', '.'));
            const impuestoLiquidado = parseFloat(linea.substring(47, 62).replace(',', '.'));

            // console.log("\nLinea ejemplo\n", linea);
            // console.log("Número de comprobante (alícuotas):", numeroComprobante, "Longitud:", numeroComprobante.length);
            // console.log("Impuesto Neto:", impuestoNeto, "Impuesto Liquidado:", impuestoLiquidado, "Total:", (impuestoNeto + impuestoLiquidado));

            if (numeroComprobante === numeroComprobanteActual) {
                // Seguimos en el mismo comprobante, acumular
                sumaAlicuotas += impuestoNeto + impuestoLiquidado;
            } else {
                // Nuevo comprobante, guardar el anterior si existe
                if (numeroComprobanteActual) {
                    if (!alicuotas[numeroComprobanteActual]) {
                        alicuotas[numeroComprobanteActual] = {
                            numero: numeroComprobanteActual,
                            importeTotal: sumaAlicuotas
                        };
                    } else {
                        alicuotas[numeroComprobanteActual].importeTotal = sumaAlicuotas;
                    }
                }
                
                // Iniciar con el nuevo comprobante
                numeroComprobanteActual = numeroComprobante;
                sumaAlicuotas = impuestoNeto + impuestoLiquidado;
            }
        });
        
        // Guardar el último comprobante procesado
        if (numeroComprobanteActual) {
            alicuotas[numeroComprobanteActual] = {
                numero: numeroComprobanteActual,
                importeTotal: sumaAlicuotas
            };
        }
        // console.log("Archivo de alícuotas procesado.");

        // Comparar y modificar comprobantes si es necesario
        const lineasModificadas = Object.values(comprobantes).map(comprobante => {
            const alicuotaCorrespondiente = alicuotas[comprobante.numero];
            // Solo modificar si existe en alícuotas y hay diferencia
            if (alicuotaCorrespondiente && 
                Math.abs(comprobante.importeTotal - alicuotaCorrespondiente.importeTotal) != 0 ) {
                    contadorDeDiferencias++;
                const diferencia = alicuotaCorrespondiente.importeTotal - comprobante.importeTotal;
                diferencias.push({
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
                return comprobante.lineaCompleta;
            }
        });

        // Generar estadísticas
        let errores = 0;
        let coincidencias = 0;

        Object.values(comprobantes).forEach(comprobante => {
            const alicuotaCorrespondiente = alicuotas[comprobante.numero];
            
            if (alicuotaCorrespondiente && 
                Math.abs(comprobante.importeTotal - alicuotaCorrespondiente.importeTotal) > 1) {
                errores++;
            } else if (alicuotaCorrespondiente) {
                coincidencias++;
            }
        });

        const mensaje = `
        Comprobantes procesados: ${Object.keys(comprobantes).length}
        Alícuotas procesadas: ${Object.keys(alicuotas).length}
        Coincidencias: ${coincidencias}
        Diferencias encontradas: ${errores}
        `;

        // // Ordenar las diferencias y obtener las 10 más altas
        // diferencias.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
        // const top10Diferencias = diferencias.slice(0, 10);

        // diferencias.forEach((diferencia, index) => {
        //     console.log(`${index + 1}. Número de comprobante: ${parseInt(diferencia.numero)}`);
        //     console.log(`   Importe en comprobante: ${diferencia.importeComprobante}`);
        //     console.log(`   Importe calculado de alícuotas: ${diferencia.importeAlicuota}`);
        //     console.log(`   Diferencia: ${diferencia.diferencia}`);
        // });

        // console.log("contador de diferencias:", contadorDeDiferencias);
        // console.log(mensaje.trim());

        return {
            libroActualizado: lineasModificadas,
            mensaje: mensaje.trim(),
            //top10Diferencias: top10Diferencias,
            diferencias: diferencias
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

module.exports = generadorDeInforme;