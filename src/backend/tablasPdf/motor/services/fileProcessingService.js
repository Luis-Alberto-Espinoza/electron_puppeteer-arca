const path = require('path');
const { convertCsvToExcel } = require('../utils/csvToExcelConverter');
const ExcelJS = require('exceljs');

// FUNCIÓN DE LIMPIEZA CENTRALIZADA
function cleanCellData(value) {
    if (typeof value !== 'string') {
        return value;
    }
    // Elimina apóstrofes, comillas simples, comillas dobles, comillas invertidas, comillas tipográficas y caracteres de control no imprimibles.
    // Maneja múltiples formatos: ', ", `, ', ', ", "
    let cleaned = value.trim()
        .replace(/^['"`'\u2018\u2019\u201C\u201D]+/g, '') // Eliminar al inicio
        .replace(/['"`'\u2018\u2019\u201C\u201D]+$/g, '') // Eliminar al final
        .replace(/[\x00-\x1F\x7F]/g, ''); // Eliminar caracteres de control

    // Detectar fechas en formato DD/MM/YY o DD/MM/YYYY y normalizar como cadena
    const dateMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (dateMatch) {
        let [, day, month, year] = dateMatch;
        if (year.length === 2) year = `20${year}`;

        // Normalizar a DD/MM/YYYY como cadena para evitar problemas con horas
        const dd = day.padStart(2, '0');
        const mm = month.padStart(2, '0');
        const yyyy = year;

        // Devolver como string normalizado sin apóstrofe
        return `${dd}/${mm}/${yyyy}`;
    }

    // Detectar fechas en formato YYYY/MM o YYYY/M y normalizar como cadena (NO convertir a Date)
    const ymMatch = cleaned.match(/^(\d{4})\/(\d{1,2})$/);
    if (ymMatch) {
        const [, year, month] = ymMatch;
        const mm = month.padStart ? month.padStart(2, '0') : (month.length === 1 ? `0${month}` : month);
        cleaned = `${year}/${mm}`;
    }

    // Se detectaron patrones de fecha pero NO convertir a Date para evitar problemas de zona horaria
    // y que Excel muestre horas inesperadas. Mantener como cadena limpia.
    // Si en el futuro se requiere conversión a Date, hacerlo con manejo explícito de zonas horarias.

    // Manejar números con signos + o - al inicio (con o sin espacio)
    // Ejemplos: "+ 123.45", "- 123.45", "+123.45", "-123.45"
    const signedNumberMatch = cleaned.match(/^([+\-\u2212])\s*(.+)$/);
    if (signedNumberMatch) {
        const sign = signedNumberMatch[1] === '+' ? '' : '-'; // El + no es necesario, el - sí
        const numberPart = signedNumberMatch[2];
        // Procesar la parte numérica: quitar separador de miles y convertir coma decimal a punto
        const numericCandidate = numberPart.replace(/\./g, '').replace(/,/g, '.');
        const num = parseFloat(numericCandidate);

        if (!isNaN(num) && /^\d+(\.\d+)?$/.test(numericCandidate)) {
            return sign === '-' ? -num : num;
        }
    }

    // Intentar normalizar y parsear números sin signo explícito: quitar separador de miles y convertir coma decimal a punto
    const numericCandidate = cleaned.replace(/\./g, '').replace(/,/g, '.');
    const num = parseFloat(numericCandidate);

    // Si parseFloat devuelve número y el formato corresponde a un número válido, devolver Number
    if (!isNaN(num) && /^[-\u2212]?\d+(\.\d+)?$/.test(numericCandidate)) {
        return num;
    }

    return cleaned; // Si no es numérico ni fecha, devolver la cadena limpiada
}

async function convertStructuredDataToExcel(datosParaGuardar, suggestedFileName, originalPdfPath) {
    const outputDir = path.dirname(originalPdfPath);
    const excelFileName = suggestedFileName.replace(/\.csv$/, '.xlsx');
    const excelFilePath = path.join(outputDir, excelFileName);

    const workbook = new ExcelJS.Workbook();
    let hayDatos = false;

    // Función para convertir fecha DD/MM/YYYY a número serial de Excel
    const dateToExcelSerial = (day, month, year) => {
        // Excel cuenta los días desde el 1 de enero de 1900 (serial = 1)
        // Nota: Excel tiene un bug donde cuenta 1900 como año bisiesto
        const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // 30 de diciembre de 1899
        const date = new Date(Date.UTC(year, month - 1, day));
        const diffTime = date - excelEpoch;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    };

    // Función auxiliar para añadir filas limpiando los datos y aplicar formato de fecha
    const addRowsToSheet = (worksheet, data) => {
        data.forEach((row, rowIndex) => {
            const cleanedRow = {};
            for (const key in row) {
                // APLICAR LA LIMPIEZA A CADA CELDA
                cleanedRow[key] = cleanCellData(row[key]);
            }
            const excelRow = worksheet.addRow(cleanedRow);

            // Aplicar formato de fecha y alineación a todas las celdas
            excelRow.eachCell((cell, colNumber) => {
                // Aplicar formato de fecha a celdas que contienen fechas en formato string DD/MM/YYYY
                if (typeof cell.value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(cell.value)) {
                    // Convertir string DD/MM/YYYY a número serial de Excel
                    const [day, month, year] = cell.value.split('/').map(n => parseInt(n, 10));
                    const serialNumber = dateToExcelSerial(day, month, year);

                    // Asignar el número serial y el formato de fecha
                    cell.value = serialNumber;
                    cell.numFmt = 'dd/mm/yyyy';
                }

                // Determinar alineación según el tipo de dato
                // Números y fechas: alineación a la derecha
                // Texto: alineación a la izquierda
                if (typeof cell.value === 'number') {
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                } else if (typeof cell.value === 'string') {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                } else {
                    cell.alignment = { horizontal: 'right', vertical: 'middle' };
                }
            });
        });
    };

    if (datosParaGuardar.hojaUnica && Array.isArray(datosParaGuardar.tablas) && datosParaGuardar.tablas.length > 0) {
        // Lógica para UNA sola hoja con todas las tablas apiladas y separadas.
        // Cada sección: fila de título (negrita) + filas Concepto/Valor + fila en blanco.
        console.log(`\n=== Excel: Apilando ${datosParaGuardar.tablas.length} tabla(s) en una sola hoja ===`);
        const worksheet = workbook.addWorksheet('Datos');
        let maxCols = 2;

        datosParaGuardar.tablas.forEach((tabla, idx) => {
            const datosTabla = tabla.datos;
            if (!Array.isArray(datosTabla) || datosTabla.length === 0) return;

            // Fila de título de la sección (en negrita)
            const tituloRow = worksheet.addRow([tabla.titulo || `Tabla ${idx + 1}`]);
            tituloRow.getCell(1).font = { bold: true };
            tituloRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

            // Filas de datos (Concepto en col A, Valor en col B, etc.)
            datosTabla.forEach(fila => {
                if (typeof fila !== 'object' || fila === null) return;
                const valores = Object.keys(fila).map(k => cleanCellData(fila[k]));
                maxCols = Math.max(maxCols, valores.length);
                const excelRow = worksheet.addRow(valores);
                excelRow.eachCell((cell) => {
                    if (typeof cell.value === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(cell.value)) {
                        const [day, month, year] = cell.value.split('/').map(n => parseInt(n, 10));
                        cell.value = dateToExcelSerial(day, month, year);
                        cell.numFmt = 'dd/mm/yyyy';
                    }
                    if (typeof cell.value === 'number') {
                        cell.alignment = { horizontal: 'right', vertical: 'middle' };
                    } else {
                        cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    }
                });
            });

            // Fila en blanco de separación entre secciones
            worksheet.addRow([]);
        });

        // Autoajustar el ancho de cada columna al contenido
        for (let c = 1; c <= maxCols; c++) {
            let maxLength = 10;
            worksheet.getColumn(c).eachCell({ includeEmpty: false }, (cell) => {
                const cellValue = cell.value ? cell.value.toString() : '';
                maxLength = Math.max(maxLength, cellValue.length);
            });
            worksheet.getColumn(c).width = maxLength + 3;
        }

        hayDatos = true;
    } else if (Array.isArray(datosParaGuardar.tablas) && datosParaGuardar.tablas.length > 0) {
        // Lógica para múltiples hojas
        console.log(`\n=== Excel: Creando ${datosParaGuardar.tablas.length} hoja(s) separada(s) ===`);
        datosParaGuardar.tablas.forEach(tabla => {
            const datosHoja = tabla.datos;
            const nombreHoja = tabla.titulo;
            if (nombreHoja && Array.isArray(datosHoja) && datosHoja.length > 0) {
                const firstRow = datosHoja.find(row => typeof row === 'object' && row !== null);
                if (firstRow) {
                    const nombreHojaLimpio = nombreHoja.replace(/[\"\/*?[\]]/g, '').substring(0, 31);
                    console.log(`  - Creando hoja: "${nombreHojaLimpio}" (${datosHoja.length} registros)`);
                    const worksheet = workbook.addWorksheet(nombreHojaLimpio);
                    // Inicialmente sin ancho fijo
                    worksheet.columns = Object.keys(firstRow).map(key => ({ header: key, key: key }));

                    // Alinear las cabeceras a la izquierda (son texto descriptivo)
                    const headerRow = worksheet.getRow(1);
                    headerRow.eachCell((cell) => {
                        cell.alignment = { horizontal: 'left', vertical: 'middle' };
                        cell.font = { bold: true }; // Opcional: poner las cabeceras en negrita
                    });

                    addRowsToSheet(worksheet, datosHoja); // Usar la función que limpia

                    // Autoajustar el ancho de las columnas al contenido
                    worksheet.columns.forEach((column, index) => {
                        let maxLength = 0;
                        column.eachCell({ includeEmpty: false }, (cell) => {
                            const cellValue = cell.value ? cell.value.toString() : '';
                            maxLength = Math.max(maxLength, cellValue.length);
                        });
                        // Añadir un pequeño margen (2 caracteres) para que no quede tan apretado
                        column.width = maxLength + 2;
                    });

                    hayDatos = true;
                }
            }
        });
    } else {
        // Lógica para una sola hoja
        const datos = datosParaGuardar.tabla || datosParaGuardar.datos;
        if (Array.isArray(datos) && datos.length > 0) {
            const firstRow = datos.find(row => typeof row === 'object' && row !== null);
            if (firstRow) {
                const worksheet = workbook.addWorksheet("Datos");
                // Inicialmente sin ancho fijo
                worksheet.columns = Object.keys(firstRow).map(key => ({ header: key, key: key }));

                // Alinear las cabeceras a la izquierda (son texto descriptivo)
                const headerRow = worksheet.getRow(1);
                headerRow.eachCell((cell) => {
                    cell.alignment = { horizontal: 'left', vertical: 'middle' };
                    cell.font = { bold: true }; // Opcional: poner las cabeceras en negrita
                });

                addRowsToSheet(worksheet, datos); // Usar la función que limpia

                // Autoajustar el ancho de las columnas al contenido
                worksheet.columns.forEach((column, index) => {
                    let maxLength = 0;
                    column.eachCell({ includeEmpty: false }, (cell) => {
                        const cellValue = cell.value ? cell.value.toString() : '';
                        maxLength = Math.max(maxLength, cellValue.length);
                    });
                    // Añadir un pequeño margen (2 caracteres) para que no quede tan apretado
                    column.width = maxLength + 3;
                });

                hayDatos = true;
            }
        }
    }

    if (!hayDatos) {
        return { exito: false, error: "No se encontraron datos estructurados válidos para guardar en Excel." };
    }

    try {
        await workbook.xlsx.writeFile(excelFilePath);
        return { exito: true, rutaExcel: excelFilePath };
    } catch (writeError) {
        return { exito: false, error: `Error al escribir el archivo Excel: ${writeError.message}` };
    }
}

async function processAndConvertPdfOutput(csvContent, suggestedFileName, originalPdfPath) {
    try {
        const outputDir = path.dirname(originalPdfPath); // Usar el mismo directorio del PDF de entrada
        const excelFileName = suggestedFileName.replace(/\.csv$/, '.xlsx');
        const excelFilePath = path.join(outputDir, excelFileName);

        const conversionResult = await convertCsvToExcel(csvContent, excelFilePath);

        if (conversionResult.exito) {
            return { exito: true, rutaExcel: conversionResult.rutaExcel };
        } else {
            return { exito: false, error: conversionResult.error || 'Error desconocido durante la conversión a Excel.' };
        }
    } catch (error) {
        console.error(`Fallo en processAndConvertPdfOutput: ${error.message}`);
        return { exito: false, error: `Fallo en el servicio de procesamiento: ${error.message}` };
    }
}

module.exports = { processAndConvertPdfOutput, convertStructuredDataToExcel };
