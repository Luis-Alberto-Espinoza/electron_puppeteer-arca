const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// Importar la clase base genérica y los módulos especialistas
const { PDFTableExtractor } = require('./lectorBasePdf.js');
const { procesarBancoNacion } = require('./banco_nacion.js');
const { procesarPlanDePago } = require('./planDePago_extraeTabla.js');
const { procesarConstanciaFiscal } = require('./constancia_fiscal.js');

// --- REGLAS DE SELECCIÓN DEL ROUTER ---
const REGLAS_DE_SELECCION = {
    // Para Plan de Pago, necesitamos que al menos 5 de estas palabras clave estén presentes.
    planDePago: {
        procesador: procesarPlanDePago,
        palabrasClave: ['NÚMERO:', 'CANTIDAD CUOTAS:', 'VIGENTE', 'IMPORTE CUOTA:', 'ESTADO:', 'IMPUESTO:', 'TIPO:', 'MONTO A FINANCIAR:'],
        umbral: 5
    },
    // Para Banco Nación, somos estrictos: deben estar las 4.
    bancoNacion: {
        procesador: procesarBancoNacion,
        palabrasClave: ['Fecha:', 'Últimos movimientos', 'Fecha', 'Comprobante'],
        umbral: 4
    },
    // Para Constancia Fiscal, con 3 de estas es suficiente para estar seguros.
    constanciaFiscal: {
        procesador: procesarConstanciaFiscal,
        palabrasClave: ['ADMINISTRACIÓN TRIBUTARIA MENDOZA', 'INFORMACIÓN GENERAL - SITUACIÓN FISCAL', 'CUIT:', 'Razón Social:'],
        umbral: 3
    }
};

/**
 * Lee los primeros N items de la primera página de un PDF.
 * @param {string} filePath - Ruta al archivo PDF.
 * @param {number} limite - Número de items a leer.
 * @returns {Promise<Array|null>} Un array de items de texto o null si hay error.
 */
async function leerPrimerosItems(filePath, limite) {
    try {
        const loadingTask = pdfjsLib.getDocument(filePath);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const content = await page.getTextContent();
        return content.items.slice(0, limite);
    } catch (error) {
        console.error(`Error al leer los primeros items del PDF: ${error.message}`);
        return null;
    }
}

/**
 * Analiza los items de texto y decide qué procesador especialista usar.
 * @param {Array} items - Los items de texto del PDF.
 * @returns {Function|string} La función del procesador especialista o el string 'generico'.
 */
function seleccionarProcesador(items) {
    const textosPresentes = items.map(item => item.str.trim());

    for (const reglaNombre in REGLAS_DE_SELECCION) {
        const regla = REGLAS_DE_SELECCION[reglaNombre];
        let coincidencias = 0;

        // Contar cuántas palabras clave de la regla se encuentran en los textos del PDF
        for (const palabraClave of regla.palabrasClave) {
            if (textosPresentes.some(textoPDF => textoPDF.includes(palabraClave))) {
                coincidencias++;
            }
        }
        
        if (coincidencias >= regla.umbral) {
            console.log(`Regla cumplida: [${reglaNombre}] con ${coincidencias} coincidencias. Se usará su procesador especialista.`);
            return regla.procesador;
        }
    }

    console.log('Ninguna regla de especialista cumplida. Se intentará con el método genérico.');
    return 'generico';
}

/**
 * Orquesta el procesamiento de un archivo PDF, usando un router para seleccionar el método correcto.
 * @param {string} filePath - La ruta al archivo PDF a procesar.
 * @returns {Promise<Object>} Un objeto con el resultado del procesamiento.
 */
async function procesarPdfConFallback(filePath) {
    console.log(`Iniciando procesamiento orquestado para: ${filePath}`);

    const primerosItems = await leerPrimerosItems(filePath, 90);
    if (!primerosItems) {
        return { exito: false, error: 'No se pudo leer el archivo PDF para análisis inicial.' };
    }

    const procesadorSeleccionado = seleccionarProcesador(primerosItems);

    let resultado;
    let metodoUsado;

    if (typeof procesadorSeleccionado === 'function') {
        // --- Ejecutar el especialista seleccionado por el router ---
        metodoUsado = procesadorSeleccionado.name;
        try {
            resultado = await procesadorSeleccionado(filePath);
        } catch (error) {
            console.error(`El especialista seleccionado [${metodoUsado}] falló: ${error.message}`);
            resultado = null;
        }
    } else {
        // --- Si ningún especialista coincide, usar el genérico como última opción ---
        metodoUsado = 'generico';
        try {
            const extractorGenerico = new PDFTableExtractor();
            const registros = await extractorGenerico.extractFromPDF(filePath);
            if (registros && registros.length > 0) {
                const rutaCsv = guardarCsvGenerico(registros, filePath);
                resultado = { datos: registros, rutaCsv: rutaCsv }; // Creamos un objeto resultado compatible
            } else {
                resultado = null;
            }
        } catch (error) {
            console.error(`El extractor genérico falló: ${error.message}`);
            resultado = null;
        }
    }

    // --- Procesar el resultado final ---
    if (resultado && resultado.datos && resultado.datos.length > 0) {
        console.log(`Éxito con el método: [${metodoUsado}]`);
        
        // Si el resultado vino de un especialista, el CSV ya está en `textoCsv`.
        // Si vino del genérico, la ruta ya está en `rutaCsv`.
        let rutaFinalCsv = resultado.rutaCsv;
        if (resultado.textoCsv) {
            const pdfDir = path.dirname(filePath);
            const pdfBase = path.basename(filePath, path.extname(filePath));
            rutaFinalCsv = path.join(pdfDir, `${pdfBase}_${metodoUsado}.csv`);
            fs.writeFileSync(rutaFinalCsv, resultado.textoCsv, 'utf8');
            console.log(`CSV guardado por especialista en: ${rutaFinalCsv}`);
        }

        return { exito: true, metodo: metodoUsado, datos: resultado.datos, rutaCsv: rutaFinalCsv };
    } else {
        console.error(`Todos los métodos de extracción fallaron para el archivo: ${path.basename(filePath)}`);
        return { exito: false, error: 'No se pudieron extraer datos con ninguno de los métodos disponibles.' };
    }
}

/**
 * Guarda un array de registros genéricos en un archivo CSV.
 * @param {Array<Object>} registros - Los registros a guardar.
 * @param {string} pdfFilePath - La ruta del PDF original para nombrar el CSV.
 * @returns {string} La ruta al archivo CSV guardado.
 */
function guardarCsvGenerico(registros, pdfFilePath) {
    if (!registros || registros.length === 0) return '';
    const cabeceras = Object.keys(registros[0]);
    const filasCsv = [cabeceras.join(',')];
    registros.forEach(registro => {
        const fila = cabeceras.map(cabecera => {
            const valor = registro[cabecera] || '';
            return `"${String(valor).replace(/"/g, '""')}"`;
        });
        filasCsv.push(fila.join(','));
    });
    const contenidoCsv = filasCsv.join('\n');
    const pdfDir = path.dirname(pdfFilePath);
    const pdfBase = path.basename(pdfFilePath, path.extname(pdfFilePath));
    const csvPath = path.join(pdfDir, `${pdfBase}_generico.csv`);
    fs.writeFileSync(csvPath, contenidoCsv, 'utf8');
    console.log(`CSV genérico guardado en: ${csvPath}`);
    return csvPath;
}

// Exportamos la función orquestadora principal directamente.
module.exports = procesarPdfConFallback;
