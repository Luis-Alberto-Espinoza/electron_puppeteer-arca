const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');
const fs = require('fs');

// FIJACIÓN DE RUTAS PARA COMPATIBILIDAD CON ELECTRON
const basePath = path.join(__dirname, '../../../node_modules/pdfjs-dist');
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(basePath, 'build/pdf.worker.js');
pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = path.join(basePath, 'standard_fonts/');

// --- LÓGICA DE EXTRACCIÓN SECUENCIAL INTELIGENTE ---

/**
 * Verifica si un texto tiene el formato de la primera parte de una fecha (dd/mm).
 * @param {string} str El texto a verificar.
 * @returns {boolean}
 */
function esInicioDeFecha(str) {
    if (!str) return false;
    return /^\d{2}\/\d{2}$/.test(str.trim());
}

/**
 * Verifica si un texto tiene el formato de la segunda parte de una fecha (/yyyy).
 * @param {string} str El texto a verificar.
 * @returns {boolean}
 */
function esFinalDeFecha(str) {
    if (!str) return false;
    return /^\/\d{4}$/.test(str.trim());
}

/**
 * Procesa una lista de items de texto que pertenecen a una única fila lógica.
 * @param {string} fecha - La fecha completa del registro.
 * @param {Array<string>} itemsDeFila - Los items de texto de la fila (sin la fecha).
 * @returns {Object} El objeto de registro construido.
 */
function construirRegistroDesdeSecuencia(fecha, itemsDeFila) {
    const registro = {
        Fecha: fecha,
        Comprobante: '',
        Concepto: '',
        Importe: '',
        Saldo: ''
    };

    // Extraer importes primero, que suelen estar al final.
    const importes = itemsDeFila.filter(esImporteMonetario);
    if (importes.length >= 2) {
        registro.Importe = formatearImporte(importes[importes.length - 2]);
        registro.Saldo = formatearImporte(importes[importes.length - 1]);
    } else if (importes.length === 1) {
        registro.Importe = formatearImporte(importes[0]);
    }

    // Filtrar los items que no son importes para encontrar el concepto y comprobante.
    const noImportes = itemsDeFila.filter(item => !esImporteMonetario(item));

    // El primer elemento numérico suele ser el comprobante.
    const indiceComprobante = noImportes.findIndex(item => /^\d{4,8}[A-Z]*$/.test(item));

    if (indiceComprobante !== -1) {
        registro.Comprobante = noImportes[indiceComprobante];
        // El resto son el concepto.
        registro.Concepto = noImportes.filter((_, idx) => idx !== indiceComprobante).join(' ');
    } else {
        // Si no hay comprobante, todo es concepto.
        registro.Concepto = noImportes.join(' ');
    }

    return registro;
}

/**
 * Procesa todas las páginas de un PDF, extrayendo registros con una lógica secuencial.
 * @param {pdfjs.PDFDocumentProxy} pdf - El documento PDF cargado.
 * @returns {Promise<Array<Object>>} Una promesa que resuelve a un array de registros.
 */
async function procesarPDF(pdf) {
    let todosLosItems = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        // Añadir los items de esta página a la lista global
        todosLosItems.push(...content.items);
    }

    // Limpiar y filtrar solo los textos visibles
    const textos = todosLosItems.map(item => item.str.trim()).filter(str => str !== '' && str !== '$');

    const registros = [];
    let i = 0;
    while (i < textos.length) {
        // ESTADO 1: Buscando inicio de fecha (dd/mm)
        if (esInicioDeFecha(textos[i]) && (i + 1 < textos.length) && esFinalDeFecha(textos[i + 1])) {
            // ESTADO 2: Fecha encontrada, acumulando datos de la fila
            const fecha = textos[i] + textos[i + 1];
            const itemsDeFila = [];
            let j = i + 2; // Empezar a buscar después de la fecha completa

            // Acumular hasta encontrar el próximo inicio de fecha o el final
            while (j < textos.length && !esInicioDeFecha(textos[j])) {
                itemsDeFila.push(textos[j]);
                j++;
            }

            // ESTADO 3: Fin de fila detectado, construir el registro
            if (itemsDeFila.length > 0) {
                const registro = construirRegistroDesdeSecuencia(fecha, itemsDeFila);
                registros.push(registro);
            }

            // Mover el índice principal a donde terminó la búsqueda de esta fila
            i = j;
        } else {
            // Si no es un inicio de fecha, simplemente avanzar
            i++;
        }
    }
    return registros;
}

function esImporteMonetario(str) {
    const patterns = [
        /^\$?\s*-?\d{1,3}(\.\d{3})*,\d{2}$/,
        /^\$?\s*-?\d{1,3}(\.\d{3})*\.\d{2}$/,
        /^\$?\s*-?\d+,\d{2}$/,
        /^\$?\s*-?\d+\.\d{2}$/
    ];
    return patterns.some(pattern => pattern.test(str.trim()));
}

function formatearImporte(str) {
    let numero = str.replace(/\$|\s/g, '');
    if (numero.includes(',') && numero.lastIndexOf('.') < numero.lastIndexOf(',')) {
        numero = numero.replace(/\./g, '').replace(',', '.');
    } else if (!numero.includes('.') && numero.includes(',')) {
        numero = numero.replace(',', '.');
    }
    const valor = parseFloat(numero);
    if (isNaN(valor)) return str;
    return valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- FUNCIONES PÚBLICAS Y DE EXPORTACIÓN ---

function generarTextoCsvBancoNacion(registros) {
    if (!registros || registros.length === 0) {
        return '';
    }
    const cabeceras = ['Fecha', 'Comprobante', 'Concepto', 'Importe', 'Saldo'];
    const filasCsv = [cabeceras.join(',')];
    registros.forEach(registro => {
        const fila = cabeceras.map(cabecera => {
            const valor = registro[cabecera] || '';
            return `"${valor.toString().replace(/"/g, '""')}"`;
        });
        filasCsv.push(fila.join(','));
    });
    return filasCsv.join('\n');
}

async function procesarBancoNacion(filePath) {
    try {
        const loadingTask = pdfjsLib.getDocument(filePath);
        const pdf = await loadingTask.promise;
        const registros = await procesarPDF(pdf);
        
        const textoCsv = generarTextoCsvBancoNacion(registros);

        return {
            datos: registros,
            textoCsv: textoCsv
        };
    } catch (err) {
        console.error(`Error al procesar PDF de Banco Nación: ${err.message}`);
        return null;
    }
}

// --- BLOQUE DE EJECUCIÓN INDEPENDIENTE ---

if (require.main === module) {
    (async () => {
        console.log('Ejecutando [banco_nacion.js] en modo de prueba independiente...');
        
        const rutaDePrueba = '/home/pinchechita/Descargas/8-25-4.pdf';
        const archivoJsonSalida = 'registros_nacion.json';
        const archivoCsvSalida = 'registros_nacion.csv';

        console.log(`Procesando archivo: ${rutaDePrueba}`);
        const resultado = await procesarBancoNacion(rutaDePrueba);

        if (resultado && resultado.datos.length > 0) {
            console.log(`Se encontraron ${resultado.datos.length} registros.`);
            
            fs.writeFileSync(archivoJsonSalida, JSON.stringify(resultado.datos, null, 2), 'utf8');
            console.log(`✓ Archivo JSON de prueba guardado en: ${archivoJsonSalida}`);

            fs.writeFileSync(archivoCsvSalida, resultado.textoCsv, 'utf8');
            console.log(`✓ Archivo CSV de prueba guardado en: ${archivoCsvSalida}`);
        } else {
            console.log('No se pudo procesar el PDF o no se encontraron registros.');
        }
    })();
}

// --- EXPORTACIONES DEL MÓDULO ---

module.exports = { 
    procesarBancoNacion, 
    generarTextoCsvBancoNacion 
};