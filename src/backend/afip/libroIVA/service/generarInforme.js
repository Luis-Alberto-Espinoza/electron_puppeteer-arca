// afip/libroIVA/service/generarInforme.js
// Genera informes de diferencias entre archivos de comprobantes y alicuotas

const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

/**
 * Genera un informe comparando archivos de comprobantes y alicuotas del Libro IVA
 * @param {Array} archivos - [rutaArchivoComprobante, rutaArchivoAlicuotas]
 * @returns {Object} Informe con diferencias, líneas actualizadas y mensajes
 */
function generarInforme(archivos) {
    const [rutaArchivoComprobante, rutaArchivoAlicuotas] = archivos;
    let contadorDeDiferencias = 0;
    let diferencias = [];

    try {
        // Leer los archivos
        const bufferComprobantes = fs.readFileSync(rutaArchivoComprobante);
        const archivoComprobantes = iconv.decode(bufferComprobantes, 'ISO-8859-15');
        const archivoAlicuotas = fs.readFileSync(rutaArchivoAlicuotas, 'utf8');

        let contadordelineas = 0;

        // Procesar archivo de comprobantes
        const comprobantes = {};
        archivoComprobantes.split('\n').forEach((linea, i) => {
            if (linea.trim() === '') return;
            contadordelineas++;

            const comprobante = {
                TipoDeComprobante: linea.substring(8, 11).trim(),
                PuntoDeVenta: linea.substring(11, 16).trim(),
                numero: linea.substring(16, 36).trim(),
                importeTotal: parseFloat(linea.substring(108, 123).replace(',', '.')),
                impuestosInternos: parseFloat(linea.substring(213, 228).replace(',', '.')),
                lineaCompleta: linea
            };

            const indice = comprobante.TipoDeComprobante + comprobante.PuntoDeVenta + comprobante.numero;
            comprobantes[indice] = comprobante;
        });

        // Procesar archivo de alicuotas
        const alicuotas = {};
        let indiceActual = null;
        let sumaAlicuotas = 0;
        let coincidencias = 0;

        archivoAlicuotas.split('\n').forEach(linea => {
            if (linea.trim() === '') return;

            const tipoComprobante = linea.substring(0, 3).trim();
            const puntoDeVenta = linea.substring(3, 8).trim();
            const numeroComprobante = linea.substring(8, 28).trim();
            const impuestoNeto = parseFloat(linea.substring(28, 43).replace(',', '.'));
            const impuestoLiquidado = parseFloat(linea.substring(47, 62).replace(',', '.'));

            const indice = tipoComprobante + puntoDeVenta + numeroComprobante;

            if (indice === indiceActual) {
                sumaAlicuotas += impuestoNeto + impuestoLiquidado;
            } else {
                if (indiceActual) {
                    alicuotas[indiceActual] = {
                        indice: indiceActual,
                        importeTotal: sumaAlicuotas
                    };
                }
                indiceActual = indice;
                sumaAlicuotas = impuestoNeto + impuestoLiquidado;
            }
        });

        // Guardar el ultimo comprobante procesado
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

            if (alicuotaCorrespondiente &&
                Math.abs(comprobante.importeTotal - (alicuotaCorrespondiente.importeTotal + comprobante.impuestosInternos)) != 0) {

                contadorDeDiferencias++;
                const diferencia = (alicuotaCorrespondiente.importeTotal + comprobante.impuestosInternos) - comprobante.importeTotal;

                contadorDeDiferenciasMayor1++;
                diferencias.push({
                    indice: indice,
                    tipo: comprobante.TipoDeComprobante,
                    puntoVenta: comprobante.PuntoDeVenta,
                    numero: comprobante.numero,
                    importeComprobante: comprobante.importeTotal,
                    importeAlicuotaMasImpuestoInternoEnComprobante: (alicuotaCorrespondiente.importeTotal + comprobante.impuestosInternos),
                    diferencia: diferencia
                });

                const nuevoImporteFormateado = formatearImporte(alicuotaCorrespondiente.importeTotal + comprobante.impuestosInternos);

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
        Alicuotas procesadas: ${Object.keys(alicuotas).length}
        Coincidencias: ${coincidencias}
        Diferencias encontradas: ${contadorDeDiferencias}
        `;

        // Validar longitud de lineas
        const lineasExcedidas = validarLongitudLineas(lineasModificadas);
        const mensajeValidacion = lineasExcedidas.length > 0
            ? `\n\n\nAdvertencia: ${lineasExcedidas.length} lineas distintas al limite de 267 caracteres.\n${lineasExcedidas.map(linea =>
                `\nLinea ${linea.numeroLinea} (longitud: ${linea.longitud}):\n${linea.contenido}`
            ).join('\n')}`
            : '\nTodas las lineas cumplen con el limite de longitud.';

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
            mensaje: 'Error al procesar archivos. Consulta la consola para mas detalles.'
        };
    }
}

/**
 * Formatea un importe a string de 15 caracteres con ceros a la izquierda
 */
function formatearImporte(importe) {
    const importeStr = importe.toFixed(0);
    return importeStr.replace('.', '').padStart(15, '0');
}

/**
 * Valida que las lineas tengan exactamente 267 caracteres
 */
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

module.exports = generarInforme;
