const fs = require('fs/promises');
const path = require('path');
const procesarPdfConFallback = require('../extraerTablasPdf/extraerTablas_B_Manager.js');
// Se importa el nuevo convertidor inteligente y se elimina el antiguo.
const { convertStructuredDataToExcel } = require('../services/fileProcessingService.js');

async function processBatch(folderPath, projectRoot) {
    const results = [];
    try {
        const files = await fs.readdir(folderPath);
        const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');

        if (pdfFiles.length === 0) {
            return { success: false, message: 'No se encontraron archivos PDF en la carpeta seleccionada.', results: [] };
        }

        for (const pdfFile of pdfFiles) {
            const filePath = path.join(folderPath, pdfFile);
            console.log(`[Batch Processor JS] Procesando: ${filePath}`);
            try {
                // 1. Extraer datos estructurados del PDF.
                const resultadoExtraccion = await procesarPdfConFallback(filePath, {
                    projectRoot: projectRoot,
                });

                let finalResult;
                // 2. Si la extracción es exitosa, pasar los datos estructurados al nuevo convertidor.
                if (resultadoExtraccion.exito) {
                    // Si el especialista ya generó su propio Excel (formato multi-hoja),
                    // usarlo directamente y no invocar al convertidor genérico.
                    if (resultadoExtraccion.excelPath) {
                        finalResult = {
                            fileName: pdfFile,
                            filePath: filePath,
                            success: true,
                            outputPath: resultadoExtraccion.excelPath,
                            error: null,
                            cuit: resultadoExtraccion.cuit || null
                        };
                    } else {
                        const resultadoConversion = await convertStructuredDataToExcel(
                            resultadoExtraccion,
                            resultadoExtraccion.suggestedFileName,
                            filePath
                        );

                        if (resultadoConversion.exito) {
                            finalResult = {
                                fileName: pdfFile,
                                filePath: filePath,
                                success: true,
                                outputPath: resultadoConversion.rutaExcel,
                                error: null,
                                cuit: resultadoExtraccion.cuit || null
                            };
                        } else {
                            throw new Error(resultadoConversion.error || 'Error en la conversión a Excel.');
                        }
                    }
                } else {
                    throw new Error(resultadoExtraccion.error || 'La extracción de datos del PDF falló.');
                }
                results.push(finalResult);

            } catch (error) {
                console.error(`[Batch Processor JS] Error al procesar ${pdfFile}: ${error.message}`);
                results.push({
                    fileName: pdfFile,
                    filePath: filePath,
                    success: false,
                    outputPath: null,
                    error: error.message,
                    cuit: null
                });
            }
        }
        return { success: true, message: `Procesamiento por lotes completado para ${pdfFiles.length} archivos.`, results: results };

    } catch (error) {
        console.error(`[Batch Processor JS] Error al leer la carpeta ${folderPath}: ${error.message}`);
        return { success: false, message: `Error al leer la carpeta: ${error.message}`, results: [] };
    }
}

module.exports = { processBatch };