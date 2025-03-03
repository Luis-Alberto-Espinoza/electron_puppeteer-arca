const fs = require('fs');
const path = require('path');

function generaInforme() {
    const rutaArchivoComprobante = path.join(__dirname, 'copiasDos', 'LIBRO_IVA_DIGITAL_Comprobante_CBTE 30717267024-2025010.txt');
    const rutaArchivoAlicuotas = path.join(__dirname, 'copiasDos', 'LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025010.txt');
    const rutaArchivoResultados = path.join(__dirname, 'copias', 'resultadosDEComparar.txt');

    try {
        // Leer los archivos
        const archivoComprobantes = fs.readFileSync(rutaArchivoComprobante, 'utf8');
        const archivoAlicuotas = fs.readFileSync(rutaArchivoAlicuotas, 'utf8');

        // Procesar archivo de comprobantes
        const comprobantes = {};
        archivoComprobantes.split('\n').forEach(linea => {
            if (linea.trim() === '') return; // Ignorar líneas vacías
            
            const comprobante = {
                numero: linea.substring(17, 36).trim(),
                importeTotal: parseFloat(linea.substring(108, 123).replace(',', '.')),
                lineaCompleta: linea
            };
            
            comprobantes[comprobante.numero] = comprobante;
        });

        // Procesar archivo de alícuotas
        const alicuotas = {};
        let numeroComprobanteActual = null;
        let sumaAlicuotas = 0;

        archivoAlicuotas.split('\n').forEach(linea => {
            if (linea.trim() === '') return; // Ignorar líneas vacías
            
            const numeroComprobante = linea.substring(9, 28).trim();
            const impuestoNeto = parseFloat(linea.substring(28, 43).replace(',', '.'));
            const impuestoLiquidado = parseFloat(linea.substring(47, 62).replace(',', '.'));
            
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

        // Comparar y modificar comprobantes si es necesario
        const lineasModificadas = Object.values(comprobantes).map(comprobante => {
            const alicuotaCorrespondiente = alicuotas[comprobante.numero];
            
            // Solo modificar si existe en alícuotas y hay diferencia
            if (alicuotaCorrespondiente && 
                Math.abs(comprobante.importeTotal - alicuotaCorrespondiente.importeTotal) > 0.01) {
                
                console.log('\n====== DIFERENCIA ENCONTRADA ======');
                console.log('Número de comprobante:', comprobante.numero);
                console.log('Importe en comprobante:', comprobante.importeTotal);
                console.log('Importe calculado de alícuotas:', alicuotaCorrespondiente.importeTotal);
                console.log('Diferencia:', alicuotaCorrespondiente.importeTotal - comprobante.importeTotal);
                
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

        console.log(mensaje);

        return {
            libroActualizado: lineasModificadas,
            mensaje: mensaje.trim()
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

module.exports = { generaInforme };