const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');


// Función principal para comparar comprobantes y eliminar líneas relacionadas
function compararComprobantes(data) {
    // Rutas de los archivos de comprobantes y alícuotas
    const rutaComprobantes = path.join(__dirname, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_CBTE__1.txt');
    const rutaArchivoAlicuotas = path.join(__dirname, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS__1.txt');

    const lineaBuscada = data.numeroEliminar; // Línea específica a buscar en el archivo de comprobantes
    console.log("Línea buscada:", lineaBuscada);
    console.log("Ruta comprobantes:", data);
    try {
        // Leer el contenido de los archivos
        const contenidoComprobante = fs.readFileSync(rutaComprobantes, 'utf8');
        const contenidoAlicuotas = fs.readFileSync(rutaArchivoAlicuotas, 'utf8');

        let numeroComprobanteEnComprobante = "";
        let puntoDeVentaEnComprobante = "";
        let restoDocumentComprobante = "";

        // Procesar el archivo de comprobantes
        let comprobante = contenidoComprobante.split('\n');
        let nroComprobante;
        let puntoDeVentaComprobante;

        comprobante.forEach((linea, index) => {
            if (index >= lineaBuscada - 1) {
                if (index === lineaBuscada - 1) {
                    // Extraer número de comprobante y punto de venta
                    nroComprobante = linea.substring(17, 36).trim();
                    puntoDeVentaComprobante = linea.substring(12, 16).trim();
                    numeroComprobanteEnComprobante = nroComprobante;
                    puntoDeVentaEnComprobante = puntoDeVentaComprobante;
                    console.log(`Comprobante: ${nroComprobante}, Punto de Venta: ${puntoDeVentaComprobante}`);
                    console.log('Linea:', linea);   
                }
                // Guardar el resto del documento excluyendo la línea buscada
                restoDocumentComprobante += linea + '\n';
            }
        });

        // Procesar el archivo de alícuotas
        const lineasAlicuotas = contenidoAlicuotas.split('\n');
        let restoDelDocumentoAlicuota = "";
        let encontrado = false;
        let nroComprobanteActual;
        let puntoDeVentaComprobanteActual;

        lineasAlicuotas.forEach((linea, index) => {
            // Extraer número de comprobante y punto de venta de la línea actual
            nroComprobanteActual = linea.substring(9, 28).trim();
            puntoDeVentaComprobanteActual = linea.substring(4, 8).trim();

            // Verificar si la línea coincide con el comprobante buscado
            if (nroComprobanteActual === numeroComprobanteEnComprobante && puntoDeVentaComprobanteActual === puntoDeVentaEnComprobante) {
                encontrado = true;
            }
            if (encontrado) {
                // Guardar el resto del documento excluyendo las líneas relacionadas
                restoDelDocumentoAlicuota += linea + "\n";
            }
        });

        restoDelDocumentoAlicuota= iconv.encode(restoDelDocumentoAlicuota, 'ISO-8859-1');
        restoDocumentComprobante= iconv.encode(restoDocumentComprobante, 'ISO-8859-1');


        // Escribir los archivos actualizados
        fs.writeFileSync("xxe_" + rutaArchivoAlicuotas , restoDelDocumentoAlicuota);
        fs.writeFileSync("xxe_" + rutaComprobantes, restoDocumentComprobante);

    } catch (error) {
        // Manejo de errores
        console.error('Error al procesar archivos:', error);
        console.log('Error al procesar archivos. Consulta la consola para más detalles.');
    }
}

// Exportar correctamente
module.exports = { compararComprobantes };