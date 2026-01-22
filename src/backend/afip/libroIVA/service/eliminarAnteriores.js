// afip/libroIVA/service/eliminarAnteriores.js
// Elimina lineas anteriores de los archivos del Libro IVA

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

// Ruta a la carpeta de datos
const DATA_PATH = path.join(__dirname, '..', 'data');

/**
 * Compara comprobantes y elimina lineas relacionadas a partir de un numero especifico
 * @param {Object} data - Datos de la operacion
 * @param {number} data.numeroEliminar - Numero de linea a partir de la cual eliminar
 */
function compararComprobantes(data) {
    const rutaComprobantes = path.join(DATA_PATH, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_CBTE__1.txt');
    const rutaArchivoAlicuotas = path.join(DATA_PATH, 'copias', 'LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS__1.txt');

    const lineaBuscada = data.numeroEliminar;
    console.log("[Eliminar Anteriores] Linea buscada:", lineaBuscada);

    try {
        // Leer el contenido de los archivos
        const contenidoComprobante = fs.readFileSync(rutaComprobantes, 'utf8');
        const contenidoAlicuotas = fs.readFileSync(rutaArchivoAlicuotas, 'utf8');

        let numeroComprobanteEnComprobante = "";
        let puntoDeVentaEnComprobante = "";
        let restoDocumentComprobante = "";

        // Procesar el archivo de comprobantes
        let comprobante = contenidoComprobante.split('\n');

        comprobante.forEach((linea, index) => {
            if (index >= lineaBuscada - 1) {
                if (index === lineaBuscada - 1) {
                    const nroComprobante = linea.substring(17, 36).trim();
                    const puntoDeVentaComprobante = linea.substring(12, 16).trim();
                    numeroComprobanteEnComprobante = nroComprobante;
                    puntoDeVentaEnComprobante = puntoDeVentaComprobante;
                    console.log(`[Eliminar Anteriores] Comprobante: ${nroComprobante}, Punto de Venta: ${puntoDeVentaComprobante}`);
                }
                restoDocumentComprobante += linea + '\n';
            }
        });

        // Procesar el archivo de alicuotas
        const lineasAlicuotas = contenidoAlicuotas.split('\n');
        let restoDelDocumentoAlicuota = "";
        let encontrado = false;

        lineasAlicuotas.forEach((linea) => {
            const nroComprobanteActual = linea.substring(9, 28).trim();
            const puntoDeVentaComprobanteActual = linea.substring(4, 8).trim();

            if (nroComprobanteActual === numeroComprobanteEnComprobante &&
                puntoDeVentaComprobanteActual === puntoDeVentaEnComprobante) {
                encontrado = true;
            }
            if (encontrado) {
                restoDelDocumentoAlicuota += linea + "\n";
            }
        });

        // Codificar y escribir los archivos
        const alicuotasCodificado = iconv.encode(restoDelDocumentoAlicuota, 'ISO-8859-1');
        const comprobantesCodificado = iconv.encode(restoDocumentComprobante, 'ISO-8859-1');

        const rutaSalidaAlicuotas = path.join(DATA_PATH, 'copias', 'ALICUOTAS_recortado.txt');
        const rutaSalidaComprobantes = path.join(DATA_PATH, 'copias', 'CBTE_recortado.txt');

        fs.writeFileSync(rutaSalidaAlicuotas, alicuotasCodificado);
        fs.writeFileSync(rutaSalidaComprobantes, comprobantesCodificado);

        console.log("[Eliminar Anteriores] Archivos guardados correctamente");

    } catch (error) {
        console.error('Error al procesar archivos:', error);
        throw error;
    }
}

module.exports = { compararComprobantes };
