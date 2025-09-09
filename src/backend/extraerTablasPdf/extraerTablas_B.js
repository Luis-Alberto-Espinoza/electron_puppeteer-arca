const { procesarBancoNacion } = require('./banco_nacion.js');

// Extractor de tablas de PDFs bancarios - Enfoque basado en fechas
let pdfjsLib;

// Carga robusta de pdfjs-dist
try {
    pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
} catch (e1) {
    try {
        pdfjsLib = require('pdfjs-dist');
    } catch (e2) {
        try {
            pdfjsLib = require('pdfjs-dist/build/pdf.js');
        } catch (e3) {
            throw new Error("No se pudo cargar pdfjs-dist. Instala con: npm install pdfjs-dist");
        }
    }
}

const fs = require('fs');
const path = require('path');

class PDFTableExtractor {
    constructor() {
        // Palabras clave para identificar cabeceras
        this.keyWords = {
            fecha: ['fecha', 'date', 'día', 'dia'],
            saldo: ['saldo', 'balance', 'disponible'],
            concepto: ['concepto', 'descripción', 'descripcion', 'detalle', 'detail', 'movimiento'],
            debito: ['débito', 'debito', 'debe', 'cargo', 'egreso', 'debit'],
            credito: ['crédito', 'credito', 'haber', 'abono', 'ingreso', 'credit']
        };

        // Patrón para detectar fechas: DD/MM/YYYY o DD/MM/YY
        this.datePattern = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/;
        this.tolerance = 15;

        // Variables para mantener estado entre páginas
        this.columnStructure = null; // Se establece una sola vez
        this.allRecords = []; // Acumula todos los registros
    }

    // Encuentra y establece la estructura de columnas (solo una vez)
    findAndSetColumnStructure(items) {
        const rows = this.groupItemsByY(items);
        let bestHeaderRow = null;
        let maxScore = 0;

        // Evalúa cada fila para encontrar la cabecera
        Object.entries(rows).forEach(([y, rowItems]) => {
            const score = this.evaluateHeaderRow(rowItems);

            if (score > maxScore && score >= 2) {
                maxScore = score;
                bestHeaderRow = { y: parseFloat(y), items: rowItems, score };
            }
        });

        if (bestHeaderRow) {
            // Extrae las columnas ordenadas por posición X
            const sortedItems = bestHeaderRow.items.sort((a, b) => a.x - b.x);
            const columns = [];
            const columnPositions = {};

            sortedItems.forEach((item, index) => {
                const text = item.str.trim();
                if (text.length > 0) {
                    columns.push(text);
                    columnPositions[text] = item.x;
                }
            });

            this.columnStructure = {
                columns: columns,
                positions: columnPositions,
                headerY: bestHeaderRow.y
            };

            return true;
        }

        return false;
    }

    // Evalúa si una fila es una cabecera
    evaluateHeaderRow(rowItems) {
        let score = 0;
        const texts = rowItems.map(item => item.str.trim().toLowerCase());

        // Verifica palabras clave importantes
        const hasDate = texts.some(text =>
            this.keyWords.fecha.some(keyword => text.includes(keyword))
        );
        const hasSaldo = texts.some(text =>
            this.keyWords.saldo.some(keyword => text.includes(keyword))
        );

        if (hasDate && hasSaldo) {
            score += 5; // Bonus por tener fecha Y saldo
        } else if (hasDate || hasSaldo) {
            score += 2;
        }

        // Verifica otras palabras clave
        Object.entries(this.keyWords).forEach(([category, keywords]) => {
            if (category !== 'fecha' && category !== 'saldo') {
                const hasKeyword = texts.some(text =>
                    keywords.some(keyword => text.includes(keyword))
                );
                if (hasKeyword) score += 1;
            }
        });

        return score;
    }

    // Agrupa elementos por coordenada Y
    groupItemsByY(items, tolerance = 10) {
        const groups = {};

        items.forEach(item => {
            let assignedY = null;
            const currentY = item.y;

            for (const existingY of Object.keys(groups)) {
                if (Math.abs(parseFloat(existingY) - currentY) <= tolerance) {
                    assignedY = existingY;
                    break;
                }
            }

            if (!assignedY) {
                assignedY = currentY.toString();
                groups[assignedY] = [];
            }

            groups[assignedY].push(item);
        });

        Object.values(groups).forEach(group => {
            group.sort((a, b) => a.x - b.x);
        });

        return groups;
    }


    // Reemplaza la función findDateItems por la versión que solo toma la primera fecha de cada fila
    // Reemplaza el método findDateItems completo con esta versión:

    findDateItems(items) {
        // console.log('=== DEBUG findDateItems (versión corregida) ===');
        // console.log('Total items recibidos:', items.length);

        const validDateItems = items.filter(item => {
            const text = item.str.trim();

            // Debe ser una fecha válida
            if (!this.datePattern.test(text)) return false;

            //console.log(`Evaluando fecha: "${text}" (Y=${item.y}, X=${item.x})`);

            // FILTRO: Evitar fechas en contexto de "Fecha de descarga" 
            // Buscar si hay texto antes en la misma línea Y que contenga "fecha de"
            const hasDatePrefix = items.some(otherItem =>
                Math.abs(otherItem.y - item.y) < 5 &&
                otherItem.x < item.x &&
                otherItem.str.toLowerCase().includes('fecha de')
            );

            if (hasDatePrefix) {
                // console.log(`❌ Fecha descartada por contexto "fecha de": "${text}"`);
                return false;
            }

            //  console.log(`✓ Fecha válida: "${text}"`);
            return true;
        });

        // console.log('Total fechas válidas encontradas:', validDateItems.length);
        // console.log('Fechas válidas:', validDateItems.map(item => `"${item.str.trim()}" (Y=${item.y})`));
        // console.log('=== FIN DEBUG findDateItems ===\n');

        return validDateItems;
    }



    // Procesa los elementos basándose en fechas como delimitadores
    processItemsByDateRanges(items) {

        // console.log('=== DEBUG BÁSICO ===');
        // console.log('¿Hay columnStructure?', !!this.columnStructure);
        // if (this.columnStructure) {
        //     console.log('Columnas:', this.columnStructure.columns);
        // }

        const dateItems = this.findDateItems(items);
        // console.log('Fechas encontradas:', dateItems.length);
        // dateItems.forEach(date => console.log(`- "${date.str.trim()}" en Y=${date.y}`));
        // console.log('=== FIN DEBUG ===')

        if (!this.columnStructure) {
            return { records: [], nonTableItems: [] };
        }


        // console.log('\n=== DEBUG processItemsByDateRanges ===');
        // console.log('Total items a procesar:', items.length);

        // mostrar items
        // console.log('--- DEBUG: Todos los items ---');
        //items.forEach(item => console.log(item));

        // console.log('--- FIN DEBUG ---');

        // Llenado del array de fechas:
        //const dateItems = this.findDateItems(items); // <--- AQUÍ SE LLENA EL ARRAY DE FECHAS
        // console.log('Fechas encontradas por findDateItems:', dateItems.length);

        if (dateItems.length === 0) {
            return { records: [], nonTableItems: items };
        }

        const sortedDates = dateItems.sort((a, b) => b.y - a.y);

        const records = [];
        const nonTableItems = [];
        let usedIndexes = new Set();

        for (let i = 0; i < sortedDates.length; i++) {
            //  console.log(`\n--- Procesando fecha ${i + 1}/${sortedDates.length} ---`);

            const currentDate = sortedDates[i];
            //console.log(`Fecha actual: "${currentDate.str.trim()}" en Y=${currentDate.y}`);

            // 1. Encuentra la fecha actual y su índice
            const nextDate = sortedDates[i + 1];

            // if (nextDate) {
            //     console.log(`Próxima fecha: "${nextDate.str.trim()}" en Y=${nextDate.y}`);
            // } else {
            //     console.log('Esta es la ÚLTIMA fecha');
            // }

            const dateIdx = items.findIndex(
                (item, idx) => !usedIndexes.has(idx) && this.datePattern.test(item.str.trim()) && item.y === currentDate.y && item.x === currentDate.x
            );
            if (dateIdx === -1) continue;

            // 2. Inicializa el registro con el elemento de la fecha
            let recordItems = [items[dateIdx]];
            usedIndexes.add(dateIdx);

            let minYInRecord = currentDate.y;
            let idx = dateIdx + 1;
            let itemsAdded = 0;

            while (idx < items.length) {
                const item = items[idx];

                if (i === sortedDates.length - 1) {
                    const tempRecord = this.createRecordFromItems([...recordItems, item], true);
                    const saldoValue = tempRecord['Saldo'];
                    const hasSaldo = typeof saldoValue === 'string' && saldoValue.trim().length > 0;

                    if (hasSaldo) {
                        const yDifference = Math.abs(currentDate.y - item.y);
                        if (yDifference > 15) {
                            // console.log(`  ⚠️ REGISTRO COMPLETO: Ya tiene saldo "${saldoValue}", Y cambió ${yDifference}px (fecha Y=${currentDate.y}, item Y=${item.y})`);
                            break;
                        }
                    }

                    // console.log(`  ✓ ÚLTIMO REGISTRO - "${item.str.trim()}" (saldo: "${typeof saldoValue === 'string' ? saldoValue.trim() : ''}", Y=${item.y})`);
                } else {
                    if (this.datePattern.test(item.str.trim()) && 
                        item.y !== currentDate.y) {
                        // console.log(`  ⚠️ CORTE: Nueva fecha encontrada "${item.str.trim()}"`);
                        break;
                    }
                }

                recordItems.push(item);
                usedIndexes.add(idx);
                itemsAdded++;
                idx++;
            }

            // console.log(`Se agregaron ${itemsAdded} elementos adicionales al registro`);

            // 6. Crea el registro usando createRecordFromItems
            const totalDates = sortedDates.length;
            const isEdgeRecord = (i === 0 || i === totalDates - 1) && totalDates > 2;
            const record = this.createRecordFromItems(recordItems, isEdgeRecord);

            // FIX: Verifica que el campo exista antes de llamar a trim
            const firstCol = this.columnStructure.columns[0];
            if (record[firstCol] && this.datePattern.test(record[firstCol])) {
                records.push(record);
            }

            // 8. (Ajuste reciente) Si hay elementos después de la última fecha y no son fecha, se pueden agregar como registro extra
            if (i === sortedDates.length - 1) {
                // console.log('--- DEBUG: Elementos desde idx hasta el final (última fecha) ---');
                for (let j = idx; j < items.length; j++) {
                    // console.log(items[j]);
                }
                // console.log('--- DEBUG: recordItems de la última fecha ---');
                // console.log(recordItems);

                // AJUSTE: Si hay elementos después de la última fecha y NO son fecha, crea un registro extra
                /* let extraItems = [];
                 for (let j = idx; j < items.length; j++) {
                     const item = items[j];
                     // Si el texto no es fecha y tiene contenido, lo agregamos
                     if (!this.datePattern.test(item.str.trim()) && item.str.trim()) {
                         extraItems.push(item);
                     }
                 }
                 if (extraItems.length > 0) {
                     // Crea un registro extra con estos elementos
                     const extraRecord = this.createRecordFromItems(extraItems, true);
                     // Solo lo agregamos si tiene algún campo con contenido
                     if (Object.values(extraRecord).some(val => val.trim())) {
                         records.push(extraRecord);
                         // console.log('--- DEBUG: Registro extra creado con elementos fuera de la última fecha ---');
                         // console.log(extraRecord);
                     }
                 }*/
            }
        }

        items.forEach((item, idx) => {
            if (!usedIndexes.has(idx)) nonTableItems.push(item);
        });

        return { records, nonTableItems };
    }

    // Crea un registro asignando elementos a sus columnas correspondientes

    // AJUSTE 1 y 2: Nueva versión de createRecordFromItems
    // Modifica createRecordFromItems para filtrar números de página por posición Y
    createRecordFromItems(items, isEdgeRecord = false) {
        const record = {};

        // Inicializa todas las columnas
        this.columnStructure.columns.forEach(column => {
            record[column] = '';
        });

        // Encuentra la posición Y de la fecha (primer campo)
        let fechaY = null;
        if (items.length > 0) {
            const fechaCol = this.columnStructure.columns[0];
            const fechaItem = items.find(item => {
                return this.datePattern.test(item.str.trim());
            });
            if (fechaItem) {
                fechaY = fechaItem.y;
            }
        }

        // Asigna cada elemento a su columna más cercana
        items.forEach(item => {
            let closestColumn = null;
            let minDistance = Infinity;

            // Aumenta la tolerancia para todos los registros
            const tolerance = this.tolerance * 6;
            Object.entries(this.columnStructure.positions).forEach(([column, x]) => {
                const distance = Math.abs(item.x - x);
                if (distance < minDistance && distance <= tolerance) {
                    minDistance = distance;
                    closestColumn = column;
                }
            });

            if (closestColumn) {
                // FILTRO: Si es posible número de página (ej: "1 de 240") y no está en la línea de la fecha, ignorar
                if (
                    closestColumn.toLowerCase().includes('saldo') &&
                    fechaY !== null &&
                    Math.abs(item.y - fechaY) > 2 && // No está en la misma línea que la fecha
                    /^\d+\s+de\s+\d+$/i.test(item.str.trim())
                ) {
                    return; // No asignar este item
                }

                const currentText = record[closestColumn];
                const newText = item.str.trim();

                // Concatena el texto (importante para descripciones multilínea)
                if (currentText) {
                    record[closestColumn] = `${currentText} ${newText}`;
                } else {
                    record[closestColumn] = newText;
                }
            }
        });

        // Mejorar segundo pase para campos vacíos
        Object.entries(record).forEach(([column, value]) => {
            if (!value) {
                let bestItem = null;
                let minDistance = Infinity;
                const x = this.columnStructure.positions[column];

                items.forEach(item => {
                    const distance = Math.abs(item.x - x);
                    // Verificar que el item no esté ya asignado a otra columna
                    let alreadyAssigned = false;
                    Object.entries(this.columnStructure.positions).forEach(([otherColumn, otherX]) => {
                        if (otherColumn !== column && record[otherColumn].includes(item.str.trim())) {
                            alreadyAssigned = true;
                        }
                    });

                    if (distance < minDistance && !alreadyAssigned) {
                        minDistance = distance;
                        bestItem = item;
                    }
                });

                // Aumenta la tolerancia máxima para evitar campos vacíos
                if (bestItem && minDistance < this.tolerance * 8) {
                    record[column] = bestItem.str.trim();
                }
            }
        });

        // Limpiar duplicados en campos (soluciona el problema del "Origen")
        const cleanedRecord = {};
        this.columnStructure.columns.forEach(column => {
            let text = record[column].trim().replace(/\s+/g, ' ');

            // Si este campo contiene exactamente el mismo texto que otro campo, limpiarlo
            if (column !== 'Descripción' && text) {
                const descripcionText = record['Descripción'] || '';
                // Si el campo actual está completamente contenido en Descripción, vaciarlo
                if (descripcionText.includes(text) && text.length < descripcionText.length) {
                    text = '';
                }
            }

            // --- FILTRO PARA SALDO: elimina posibles números de página al final ---
            if (
                column.toLowerCase().includes('saldo') &&
                text
            ) {
                // Si el saldo termina con un número entero pequeño (ej: "1234.56 2" o "1234,56 2")
                // y ese número es >= 1 y <= 20, lo quitamos (probable número de página)
                text = text.replace(/([0-9.,]+)\s+(\d{1,3})$/, (match, saldo, posiblePagina) => {
                    const num = parseInt(posiblePagina, 10);
                    if (num >= 1 && num <= 20) {
                        return saldo;
                    }
                    return match;
                });
            }
            // --- FIN FILTRO SALDO ---

            // Aplica el formateo solo a los campos numéricos
            if (
                column.toLowerCase().includes('saldo') ||
                column.toLowerCase().includes('saldos') ||
                column.toLowerCase().includes('debito') ||
                column.toLowerCase().includes('débito') ||
                column.toLowerCase().includes('débitos') ||
                column.toLowerCase().includes('importe') ||
                column.toLowerCase().includes('crédito') ||
                column.toLowerCase().includes('créditos') ||
                column.toLowerCase().includes('credito')
            ) {
                text = this.formatNumero(text);
            }

            cleanedRecord[column] = text;
        });

        return cleanedRecord;
    }

    // Modifica la función formatNumero para eliminar el símbolo $
    formatNumero(valor) {
        // Elimina todos los puntos (usados como separador de miles)
        // Cambia el separador decimal a coma
        // Elimina el símbolo $
        if (typeof valor !== 'string') return valor;
        let v = valor.replace(/\$/g, ''); // quita símbolo $
        v = v.replace(/\./g, ''); // quita puntos
        v = v.replace(/(\d+)(,|\.)?(\d{2})$/, (match, intPart, sep, decPart) => {
            // Si termina con dos dígitos, separador decimal puede ser punto o coma
            return `${intPart},${decPart}`;
        });
        return v.trim();
    }

    // Procesa una página del PDF
    async processPage(page, pageNum) {
        const content = await page.getTextContent();

        const items = content.items.map(item => ({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5]
        }));

        // Si no tenemos estructura de columnas, trata de encontrarla
        if (!this.columnStructure) {
            const found = this.findAndSetColumnStructure(items);
            if (!found) {
                return [];
            }
        }

        // Procesa los registros basándose en fechas
        const { records, nonTableItems } = this.processItemsByDateRanges(items);

        return records;
    }

    // Función principal para extraer datos
    async extractFromPDF(filePath) {
        try {
            this.columnStructure = null;
            this.allRecords = [];

            const loadingTask = pdfjsLib.getDocument(filePath);
            const pdf = await loadingTask.promise;

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const pageRecords = await this.processPage(page, pageNum);
                this.allRecords = this.allRecords.concat(pageRecords);
            }

            let tempCsvPath = null;
            // === NUEVO: Exportar registros a .csv en la misma carpeta y nombre del PDF ===
            if (this.allRecords.length > 0) {
                const pdfDir = path.dirname(filePath); // Carpeta del PDF de entrada
                const pdfBase = path.basename(filePath, path.extname(filePath)); // Nombre base del PDF
                tempCsvPath = path.join(pdfDir, `${pdfBase}.csv`); // Ruta final del CSV
                const headers = Object.keys(this.allRecords[0]);
                const csvRows = [headers.join(',')];
                this.allRecords.forEach(record => {
                    const row = headers.map(header => {
                        const value = (record[header] || '').toString();
                        return value.includes(',') || value.includes('"') ?
                            `"${value.replace(/"/g, '""')}"` : value;
                    });
                    csvRows.push(row.join(','));
                });
                fs.writeFileSync(tempCsvPath, csvRows.join('\n'), 'utf8');
            }
            // === FIN NUEVO ===

            console.log('Registros generados:', this.allRecords.length);
            //si es 0 llamar a la funcion del banco_nacion.js

            // Retorna los registros encontrados

            if (this.allRecords.length === 0) {
                // Llama a la función del banco_nacion.js
                const retorno = await procesarBancoNacion(filePath);

                // Si hay datos, guarda el CSV usando exportResults
                if (retorno && retorno.length > 0) {
                    const pdfDir = path.dirname(filePath);
                    const pdfBase = path.basename(filePath, path.extname(filePath));
                    const tempCsvPath = path.join(pdfDir, `${pdfBase}_banco_nacion.csv`);
                    this.exportResults(retorno, tempCsvPath, 'csv');
                    return { success: true, data: retorno, csvPath: tempCsvPath };
                } else {
                    return { success: false, error: 'No se encontraron registros en ningún método.' };
                }
            }

            // Devuelve también la ruta del CSV en el resultado
            return { success: true, data: this.allRecords, csvPath: tempCsvPath };
        } catch (error) {
            return { success: false, error: { message: error.message } };
        }
    }

    // Exporta resultados a diferentes formatos
    exportResults(records, outputPath, format = 'json') {
        try {
            let content;

            switch (format.toLowerCase()) {
                case 'json':
                    content = JSON.stringify(records, null, 2);
                    break;

                case 'csv':
                    if (records.length === 0) {
                        content = '';
                        break;
                    }

                    const headers = Object.keys(records[0]);
                    const csvRows = [headers.join(',')];

                    records.forEach(record => {
                        const row = headers.map(header => {
                            const value = (record[header] || '').toString();
                            return value.includes(',') || value.includes('"') ?
                                `"${value.replace(/"/g, '""')}"` : value;
                        });
                        csvRows.push(row.join(','));
                    });

                    content = csvRows.join('\n');
                    break;

                case 'txt':
                    content = records.map((record, index) => {
                        const recordText = Object.entries(record)
                            .filter(([key, value]) => value && value.trim())
                            .map(([key, value]) => `${key}: ${value}`)
                            .join('\n');
                        return `=== REGISTRO ${index + 1} ===\n${recordText}`;
                    }).join('\n\n');
                    break;

                default:
                    throw new Error(`Formato no soportado: ${format}`);
            }

            fs.writeFileSync(outputPath, content, 'utf8');
            return true;
        } catch (error) {
            return false;
        }
    }

    // Agrupa elementos en registros basados en fechas
    groupItemsByRecords(items) {
        // Ordena por Y descendente (de arriba a abajo)
        const sorted = items.slice().sort((a, b) => b.y - a.y);
        const records = [];
        let currentRecord = [];
        for (const item of sorted) {
            if (this.datePattern.test(item.str.trim())) {
                // Si ya hay un registro, lo guardo
                if (currentRecord.length > 0) records.push(currentRecord);
                currentRecord = [item];
            } else {
                currentRecord.push(item);
            }
        }
        if (currentRecord.length > 0) records.push(currentRecord);
        return records;
    }
}

// Función de uso
async function processPDFs(inputPath, outputDir = './output') {
    const extractor = new PDFTableExtractor();

    try {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        let files = [];

        if (fs.statSync(inputPath).isDirectory()) {
            files = fs.readdirSync(inputPath)
                .filter(file => file.toLowerCase().endsWith('.pdf'))
                .map(file => path.join(inputPath, file));
        } else if (inputPath.toLowerCase().endsWith('.pdf')) {
            files = [inputPath];
        }

        for (const filePath of files) {
            const fileName = path.basename(filePath, '.pdf');
            const result = await extractor.extractFromPDF(filePath);

            // Puedes comentar este bloque, el código no se rompe, solo no se exportan los archivos
            /*
            if (result.success && result.data.length > 0) {
                // Los archivos se guardan en outputDir
                const jsonPath = path.join(outputDir, `${fileName}.json`);
                const csvPath = path.join(outputDir, `${fileName}.csv`);
                const txtPath = path.join(outputDir, `${fileName}.txt`);
                extractor.exportResults(result.data, jsonPath, 'json');
                extractor.exportResults(result.data, csvPath, 'csv');
                extractor.exportResults(result.data, txtPath, 'txt');
            }
            */
        }
    } catch (error) {
        // Silenciado
    }
}

// Exportar para uso
module.exports = { PDFTableExtractor, processPDFs };

// Uso:
// const { processPDFs } = require('./pdf-extractor');
// processPDFs('./mi-extracto.pdf', './output/');

/*
// Nueva función para procesar con fallback
const { procesarBancoNacion } = require('./banco_nacion.js');
async function procesarPDFConFallback(pdfPath) {
    const extractor = new PDFTableExtractor();
    const resultado = await extractor.extractFromPDF(pdfPath);

    if (resultado.data && resultado.data.length > 0) {
        // Registros encontrados, retorna normalmente
        return { success: true, registros: resultado.data, metodo: 'extraerTablas_B' };
    } else {
        // Si no hay registros, intenta con banco_nacion.js como función
        try {
            const registros = await procesarBancoNacion(pdfPath);
            if (registros && registros.length > 0) {
                return { success: true, registros, metodo: 'banco_nacion' };
            } else {
                return { success: false, error: 'No se encontraron registros en ningún método.' };
            }
        } catch (e) {
            return { success: false, error: 'No se pudo leer registros alternativos.' };
        }
    }
}
*/