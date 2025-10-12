const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// --- Configuración de PDF.js (Centralizada aquí) ---
// La ruta base ahora se construye dinámicamente en la función principal,
// pero dejamos una configuración por defecto para el worker.
// Esta línea será sobreescrita por la lógica dentro de procesarPdfConFallback.
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.js');

// --- Importar los módulos especialistas ---
const { PDFTableExtractor } = require('./leer_pdf_Bancos/lectorBasePdf.js');
const { procesarBancoNacion } = require('./leer_pdf_Bancos/banco_nacion.js');
const { procesarPlanDePago } = require('./leer_pdf_ATM/planDePago_extraeTabla.js');
const { procesarConstanciaFiscal } = require('./leer_pdf_ATM/constancia_fiscal.js');
const { procesarDeudaPdf } = require('./leer_pdf_AFIP/detalle_de_deuda.js');
const { procesarDeudaImpagaPdf } = require('./leer_pdf_AFIP/Detalle_de_Deuda_Impaga.js');
const { procesarObligacionesPdf } = require('./leer_pdf_AFIP/detalle_de_obligaciones.js');
const { procesarPlanDePagoPdf } = require('./leer_pdf_AFIP/detalle_pagos_estado_1.js');  
const { procesarPlanDePagoPdf2 } = require('./leer_pdf_AFIP/detalle_pagos_estado_2.js');
const { procesarImputacionesDeCuota } = require('./leer_pdf_AFIP/detalle_de_imputaciones_de_cuota.js');
const { procesarCarrilRodriguezPena } = require('./leer_pdf_Bancos/carril_rodriguez_pena.js');

const NOMBRE_ESPECIALISTAS = {
    'procesarDeudaPdf': 'Detalle_de_Deuda_Impaga',
    'procesarImputacionesDeCuota': 'Detalle_de_Imputaciones_de_cuota',
    'procesarObligacionesPdf': 'Detalle_Obligaciones_Regularizadas_Impositivas',
    'procesarDeudaImpagaPdf': 'detalle_deuda',
    'procesarPlanDePagoPdf2': 'Detalle_plan_pago_estado',
    'procesarPlanDePagoPdf': 'detalle_pagos_estado'
};

// --- REGLAS DE SELECCIÓN DEL ROUTER ---
const REGLAS_DE_SELECCION = {
    planDePago: {//plan de pago de atm
        procesador: procesarPlanDePago,
        palabrasClave: ['NÚMERO:', 'CANTIDAD CUOTAS:', 'VIGENTE', 'IMPORTE CUOTA:', 'ESTADO:', 'IMPUESTO:', 'TIPO:', 'MONTO A FINANCIAR:'],
        umbral: 5
    },
    bancoNacion: {// banco nacion 
        procesador: procesarBancoNacion,
        palabrasClave: ['Fecha:', 'Últimos movimientos', 'Fecha', 'Comprobante'],
        umbral: 4
    },
    carrilRodriguezPena: {
        procesador: procesarCarrilRodriguezPena,
        palabrasClave: ['CARRIL RODRIGUEZ', 'CUENTA CORRIENTE BANCARIA', 'Periodo del Extracto', '396 GODOY CRUZ'],
        umbral: 3
    },
    constanciaFiscal: {// constancia fiscal 
        procesador: procesarConstanciaFiscal,
        palabrasClave: ['ADMINISTRACIÓN TRIBUTARIA MENDOZA', 'INFORMACIÓN GENERAL - SITUACIÓN FISCAL', 'CUIT:', 'Razón Social:'],
        umbral: 3
    },
    detalleDeuda: {// numero 4
        procesador: procesarDeudaPdf,
        palabrasClave: ['Detalle de Deuda Impaga', 'Periodo', 'Subconcepto', 'Concepto', 'Importe'],
        umbral: 4
    },
    deudaImpaga: {// numero 3
        procesador: procesarDeudaImpagaPdf,
        palabrasClave: ['Detalle', 'Ant./Cta', 'Establ.', 'Subcpto.', 'Cancelar($)'],
        umbral: 4
    },
    detalleObligaciones: {// numero 2
        procesador: procesarObligacionesPdf,
        palabrasClave: ['Detalle de Obligaciones Regularizadas', 'subconcepto', 'fh. Vto.', 'monto obligación($)', 'total pagos($)'],
        umbral: 4
    },
    planDePago2: {// numero 5
        procesador: procesarPlanDePagoPdf2,
        palabrasClave: ['Cuota', 'Vencimiento', 'Capital($)', 'Financiero($)', 'Total($)'],
        umbral: 5
    },
    planDePago1: {// numero 6
        procesador: procesarPlanDePagoPdf,
        palabrasClave: ['Cuota N°', 'Vencimiento', 'Capital($)', 'Interés Financiero($)', 'Total($)', 'Estado de Cuota'], 
        umbral: 4
    },
    detalleImputaciones: { // numero 0
        procesador: procesarImputacionesDeCuota,
        palabrasClave: ['Detalle de Imputaciones de cuota', 'Cancela($)'],
        umbral: 2
    }
};

async function parsePdfToRows(filePath) {
    try {
        const loadingTask = pdfjsLib.getDocument(filePath);
        const pdf = await loadingTask.promise;
        let allFilas = [];
        for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
            const page = await pdf.getPage(numPagina);
            const content = await page.getTextContent();
            const filasMap = new Map();
            content.items.forEach(item => {
                const y = item.transform[5];
                const yExistente = [...filasMap.keys()].find(key => Math.abs(y - key) <= 5);
                if (yExistente) {
                    filasMap.get(yExistente).push(item);
                } else {
                    filasMap.set(y, [item]);
                }
            });
            const filasDePagina = [...filasMap.entries()]
                .sort((a, b) => b[0] - a[0])
                .map(([y, filaItems]) => ({ y, items: filaItems.sort((a, b) => a.transform[4] - b.transform[4]) }));
            allFilas.push(...filasDePagina);
        }
        return allFilas;
    } catch (error) {
        console.error(`Error al parsear el PDF: ${error.message}`);
        return null;
    }
}

function seleccionarProcesador(allFilas) {
    const filasDeAnalisis = allFilas.slice(0, 20);
    const textosPresentes = filasDeAnalisis.flatMap(fila => fila.items.map(item => item.str.trim()));
    for (const reglaNombre in REGLAS_DE_SELECCION) {
        const regla = REGLAS_DE_SELECCION[reglaNombre];
        let coincidencias = 0;
        for (const palabraClave of regla.palabrasClave) {
            if (textosPresentes.some(textoPDF => textoPDF.includes(palabraClave))) {
                coincidencias++;
            }
        }
        if (coincidencias >= regla.umbral) {
            console.log(`Regla cumplida: [${reglaNombre}]. Usando su procesador especialista.`);
            return regla.procesador;
        }
    }
    console.log('Ninguna regla de especialista cumplida. Intentando con método genérico.');
    return 'generico';
}

function extraerCuit(allFilas) {
    for (const fila of allFilas.slice(0, 25)) { // Buscar en las primeras 25 líneas
        for (let i = 0; i < fila.items.length; i++) {
            const item = fila.items[i];
            if (item.str.trim().toUpperCase() === 'CUIT:') {
                // Buscar el valor en los siguientes items de la misma línea
                for (let j = i + 1; j < fila.items.length; j++) {
                    const cuitValue = fila.items[j].str.trim();
                    // Un CUIT válido tiene al menos 11 dígitos
                    if (cuitValue && cuitValue.replace(/-/g, '').length >= 11) {
                        return cuitValue;
                    }
                }
            }
        }
    }
    return null; // Si no se encuentra
}

async function procesarPdfConFallback(filePath, options = {}) {
    // Configuración dinámica de la ruta del worker de PDF.js
    const projectRoot = options.projectRoot || process.cwd();
    const workerSrcPath = path.join(projectRoot, 'node_modules/pdfjs-dist/build/pdf.worker.js');
    
    if (!fs.existsSync(workerSrcPath)) {
        throw new Error(`El archivo worker de PDF.js no se encuentra en la ruta esperada: ${workerSrcPath}`);
    }
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrcPath;
    pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = path.join(projectRoot, 'node_modules/pdfjs-dist/standard_fonts/');

    console.log(`Iniciando procesamiento orquestado para: ${filePath}`);

    const allFilas = await parsePdfToRows(filePath);
    if (!allFilas) {
        return { exito: false, error: 'No se pudo leer y parsear el archivo PDF.' };
    }

    const cuitGeneral = extraerCuit(allFilas);
    const procesadorSeleccionado = seleccionarProcesador(allFilas);

    let resultado;
    let metodoUsado;

    if (typeof procesadorSeleccionado === 'function') {
        metodoUsado = procesadorSeleccionado.name;
        try {
            resultado = await procesadorSeleccionado(allFilas);
        } catch (error) {
            console.error(`El especialista [${metodoUsado}] falló: ${error.message}`);
            resultado = null;
        }
    } else {
        metodoUsado = 'generico';
        try {
            const extractorGenerico = new PDFTableExtractor();
            const registros = await extractorGenerico.extractFromPDF(filePath);
            if (registros && registros.length > 0) {
                const cabeceras = Object.keys(registros[0]);
                const filasCsv = [cabeceras.join(',')];
                registros.forEach(registro => {
                    const fila = cabeceras.map(cabecera => `"${String(registro[cabecera] || '').split('"').join('""')}"`);
                    filasCsv.push(fila.join(','));
                });
                resultado = { datos: registros, csv: filasCsv.join('\n') };
            } else {
                resultado = null;
            }
        } catch (error) {
            console.error(`El extractor genérico falló: ${error.message}`);
            resultado = null;
        }
    }

    if (resultado && resultado.csv) {
        console.log(`Éxito con el método: [${metodoUsado}]`);
        
        // Priorizar el CUIT del especialista si lo devuelve, si no, usar el extraído en general.
        const cuitFinal = (resultado.encabezado && resultado.encabezado.cuit) || cuitGeneral;
        const cuitSuffix = cuitFinal ? `_${cuitFinal.replace(/-/g, '')}` : '';

        let csvFileName;
        if (NOMBRE_ESPECIALISTAS[metodoUsado]) {
            // Usar el nombre de archivo específico del especialista
            const baseName = NOMBRE_ESPECIALISTAS[metodoUsado];
            csvFileName = `${baseName}${cuitSuffix}.csv`;
        } else {
            // Usar el nombre de archivo por defecto
            const pdfBaseName = path.basename(filePath, path.extname(filePath));
            csvFileName = `${pdfBaseName}${cuitSuffix}.csv`;
        }

        const outputDir = options.outputDir || path.dirname(filePath);
        const rutaCsv = path.join(outputDir, csvFileName);

        try {
            fs.writeFileSync(rutaCsv, resultado.csv, 'utf8');
            console.log(`✓ Archivo CSV guardado en: ${rutaCsv}`);
            return { exito: true, metodo: metodoUsado, rutaCsv: rutaCsv, datos: resultado.tabla || resultado.datos, tablas: resultado.tablas, cuit: cuitFinal, allFilas: allFilas };
        } catch (writeError) {
            console.error(`Error al guardar el archivo CSV: ${writeError.message}`);
            return { exito: false, error: `Fallo al escribir el archivo: ${writeError.message}` };
        }
    } else {
        console.error(`Todos los métodos de extracción fallaron para: ${path.basename(filePath)}`);
        return { exito: false, error: 'No se pudieron extraer datos con ninguno de los métodos disponibles.', cuit: cuitGeneral };
    }
}

if (require.main === module) {
    (async () => {
        const filePathArg = process.argv[2];
        if (!filePathArg) {
            console.error("Error: Debes proporcionar la ruta a un archivo PDF como argumento.");
            console.log("Uso: node src/backend/extraerTablasPdf/extraerTablas_B_Manager.js <ruta_al_pdf>");
            return;
        }

        const filePath = path.resolve(filePathArg);
        console.log("\n--- MODO PRUEBA ---");
        
        const resultado = await procesarPdfConFallback(filePath, { outputDir: __dirname });

        if (resultado && resultado.exito) {
            console.log(`\n🎉 PRUEBA COMPLETADA CON ÉXITO.`);
            console.log(`Archivo de salida: ${resultado.rutaCsv}`);
        } else {
            console.error('\n❌ La prueba falló.');
            if(resultado.error) console.error(`Motivo: ${resultado.error}`);
        }
    })();
}

module.exports = procesarPdfConFallback;
