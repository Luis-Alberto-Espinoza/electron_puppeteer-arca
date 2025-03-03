const fs = require('fs');
const path = require('path');

function compararComprobantes() {
    const rutaComprobantes = path.join(__dirname, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_CBTE 30717267024-2025010.txt');
    const rutaArchivoAlicuotas = path.join(__dirname, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS 30717267024-2025010.txt');

    const lineaBuscada = 0;

    try {
        const contenidoComprobante = fs.readFileSync(rutaComprobantes, 'utf8');
        const contenidoAlicuotas = fs.readFileSync(rutaArchivoAlicuotas, 'utf8');

        let numeroComprobanteEnComprobante = "";
        let puntoDeVentaEnComprobante = "";
        let restoDocumentComprobante = "";

        let comprobante = contenidoComprobante.split('\n');
        let nroComprobante;
        let puntoDeVentaComprobante;

        comprobante.forEach((linea, index) => {
            if (index  >= lineaBuscada-1) {
                if (index  === lineaBuscada-1) {
                    nroComprobante = linea.substring(17, 36).trim();
                    puntoDeVentaComprobante = linea.substring(12, 16).trim();
                    numeroComprobanteEnComprobante = nroComprobante;
                    puntoDeVentaEnComprobante = puntoDeVentaComprobante;
                    console.log(`Comprobante: ${nroComprobante}, Punto de Venta: ${puntoDeVentaComprobante}`);
                    console.log('Linea:', linea);   
                }
                restoDocumentComprobante += linea + '\n';
            }
        });


        const lineasAlicuotas = contenidoAlicuotas.split('\n');
        let restoDelDocumentoAlicuota = "";
        let encontrado = false;
        let nroComprobanteActual;
        let puntoDeVentaComprobanteActual;
        lineasAlicuotas.forEach((linea, index) => {
            nroComprobanteActual = linea.substring(9, 28).trim();
            puntoDeVentaComprobanteActual = linea.substring(4, 8).trim();
            const importeTotal = parseFloat(linea.substring(108, 123).replace(',', '.'));
            let puntoventaActual = linea.substring(4, 8).trim();

            /* intentar buscar una linea en alicuota mediante un valor dado */
            if (nroComprobanteActual === numeroComprobanteEnComprobante && puntoDeVentaComprobanteActual === puntoDeVentaEnComprobante) {
                encontrado = true;
            }
            if (encontrado) {
                restoDelDocumentoAlicuota += linea + "\n";
            }
        });
      
        fs.writeFileSync(rutaArchivoAlicuotas, restoDelDocumentoAlicuota, 'utf8');
        fs.writeFileSync(rutaComprobantes, restoDocumentComprobante, 'utf8');

    } catch (error) {
        console.error('Error al procesar archivos:', error);
        console.log('Error al procesar archivos. Consulta la consola para más detalles.');
    }
}

compararComprobantes();