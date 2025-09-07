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

const LOG_PATH = path.join(__dirname, 'extraccion_pdf_debug.log');
function logToFile(...args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a, null, 2) : a)).join(' ');
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
}

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
        logToFile('PDFTableExtractor instanciado');
    }

    // Encuentra y establece la estructura de columnas (solo una vez)
    findAndSetColumnStructure(items) {
        logToFile('\n🔍 BUSCANDO ESTRUCTURA DE COLUMNAS...');

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

        console.log('Mejor fila de c&&&&&&&&&&&&becera:', bestHeaderRow);
        logToFile(`Mejor fila de cab&&&&&&&&&&&&cera: Y=${bestHeaderRow ? bestHeaderRow.y : 'N/A'}, Puntuación=${maxScore}`);


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

            logToFile(`✅ ESTRUCTURA DE COLUMNAS ESTABLECIDA: Columnas: [${columns.join(', ')}], Cabecera en Y: ${bestHeaderRow.y}`);

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

    // Encuentra elementos que contienen fechas
    findDateItems(items) {
        return items.filter(item => {
            const text = item.str.trim();
            return this.datePattern.test(text);
        });
    }

    // Procesa los elementos basándose en fechas como delimitadores
    processItemsByDateRanges(items) {
        logToFile('\n📊 PROCESANDO ELEMENTOS POR RANGOS DE FECHAS...');

        if (!this.columnStructure) {
            console.log('❌ No hay estructura de columnas definida');
            return { records: [], nonTableItems: [] };
        }

        // Encuentra todos los elementos que contienen fechas
        const dateItems = this.findDateItems(items);
        logToFile(`📅 Encontradas ${dateItems.length} fechas en esta página`);

        if (dateItems.length === 0) {
            console.log('⚠️ No se encontraron fechas en esta página');
            return { records: [], nonTableItems: items };
        }

        // Ordena las fechas de arriba a abajo (Y mayor a menor en PDF)
        const sortedDates = dateItems.sort((a, b) => b.y - a.y);

        const records = [];
        const nonTableItems = [];
        let usedIndexes = new Set();

        // Para cada fecha, busca el bloque que comienza con esa fecha
        for (let i = 0; i < sortedDates.length; i++) {
            const currentDate = sortedDates[i];
            const nextDate = sortedDates[i + 1];

            // Encuentra el índice del elemento de la fecha en items
            const dateIdx = items.findIndex(
                (item, idx) => !usedIndexes.has(idx) && this.datePattern.test(item.str.trim()) && item.y === currentDate.y && item.x === currentDate.x
            );
            if (dateIdx === -1) continue;

            // Incluye hasta 3 líneas (elementos agrupados por Y) después de la fecha, o hasta la siguiente fecha
            let recordItems = [items[dateIdx]];
            usedIndexes.add(dateIdx);

            let linesAdded = 0;
            let idx = dateIdx + 1;
            while (linesAdded < 3 && idx < items.length) {
                const item = items[idx];
                // Si es la siguiente fecha, termina el registro
                if (this.datePattern.test(item.str.trim()) && item.y !== currentDate.y) break;
                recordItems.push(item);
                usedIndexes.add(idx);
                // Si el siguiente item está en una nueva línea Y, cuenta como una línea más
                if (idx > 0 && Math.abs(item.y - items[idx - 1].y) > 2) linesAdded++;
                idx++;
            }

            // AJUSTE: Detectar edge records de manera más precisa
            const totalDates = sortedDates.length;
            const isEdgeRecord = (i === 0 || i === totalDates - 1) && totalDates > 2;
            
            // Asigna los elementos a columnas
            const record = this.createRecordFromItems(recordItems, isEdgeRecord);

            // Solo guarda si el registro comienza con una fecha válida
            if (this.datePattern.test(record[this.columnStructure.columns[0]])) {
                records.push(record);
                logToFile(`   ✅ Registro creado con ${Object.keys(record).length} campos`);
                Object.entries(record).forEach(([field, value]) => {
                    if (value.trim()) {
                        const truncated = value.length > 30 ? value.substring(0, 27) + '...' : value;
                        logToFile(`      ${field}: "${truncated}"`);
                    }
                });
            }
        }

        // Guarda los elementos que no fueron usados en ningún registro
        items.forEach((item, idx) => {
            if (!usedIndexes.has(idx)) nonTableItems.push(item);
        });

        return { records, nonTableItems };
    }

    // Crea un registro asignando elementos a sus columnas correspondientes

    createRecordFromItems(items, isEdgeRecord = false) {
        const record = {};

        // Inicializa todas las columnas
        this.columnStructure.columns.forEach(column => {
            record[column] = '';
        });

        // Asigna cada elemento a su columna más cercana
        items.forEach(item => {
            let closestColumn = null;
            let minDistance = Infinity;

            // Encuentra la columna más cercana por posición X
            Object.entries(this.columnStructure.positions).forEach(([column, x]) => {
                // AJUSTE: Reducir tolerancia para edge records en lugar de aumentarla
                const tolerance = isEdgeRecord ? this.tolerance * 2 : this.tolerance * 3;
                const distance = Math.abs(item.x - x);
                if (distance < minDistance && distance <= tolerance) {
                    minDistance = distance;
                    closestColumn = column;
                }
            });

            if (closestColumn) {
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


        // Segundo pase: para campos vacíos, buscar el texto más cercano aunque esté fuera de tolerancia
        Object.entries(record).forEach(([column, value]) => {
            if (!value) {
                let bestItem = null;
                let minDistance = Infinity;
                const x = this.columnStructure.positions[column];

                items.forEach(item => {
                    const distance = Math.abs(item.x - x);
                    // AJUSTE: Verificar que el item no esté ya asignado a otra columna
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

                // AJUSTE: Reducir tolerancia máxima para evitar asignaciones incorrectas
                if (bestItem && minDistance < this.tolerance * 5) {
                    record[column] = bestItem.str.trim();
                }
            }
        });


        // Limpia el registro
        Object.keys(record).forEach(key => {
            record[key] = record[key].trim().replace(/\s+/g, ' ');
        });

        return record;
    }

    // Procesa una página del PDF
    async processPage(page, pageNum) {
        logToFile(`\n📄 ===== PÁGINA ${pageNum} =====`);

        const content = await page.getTextContent();

        const items = content.items.map(item => ({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5]
        }));

        logToFile(`📊 Total elementos de texto: ${items.length}`);

        // Si no tenemos estructura de columnas, trata de encontrarla
        if (!this.columnStructure) {
            const found = this.findAndSetColumnStructure(items);
            if (!found) {
                logToFile('⚠️ No se encontró estructura de columnas en esta página');
                return [];
            }
        }

        // Procesa los registros basándose en fechas
        const { records, nonTableItems } = this.processItemsByDateRanges(items);
        //crear un objeto date para tener una marca de tiempo
        const timestamp = new Date().toISOString();

        // Puedes guardar o tratar nonTableItems después si lo necesitas
        logToFile(`✅\n\n ==>> ${timestamp} Página ${pageNum} completada: ${records.length} registros, ${nonTableItems.length} elementos fuera de tabla`);
        return records;
    }

    // Función principal para extraer datos
    async extractFromPDF(filePath) {
        try {
            logToFile(`\n🔍 PROCESANDO: ${filePath}`);

            // Reinicia el estado para este PDF
            this.columnStructure = null;
            this.allRecords = [];

            const loadingTask = pdfjsLib.getDocument(filePath);
            const pdf = await loadingTask.promise;

            logToFile(`📖 PDF tiene ${pdf.numPages} página(s)`);

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const pageRecords = await this.processPage(page, pageNum);
                this.allRecords = this.allRecords.concat(pageRecords);
            }

            logToFile(`\n🎉 PROCESO COMPLETADO: 📊 Total registros extraídos: ${this.allRecords.length}`);
            if (this.columnStructure) {
                logToFile(`   📋 Estructura de columnas: [${this.columnStructure.columns.join(', ')}]`);
            }
            if (this.allRecords.length > 0) {
                logToFile('\n📈 ESTADÍSTICAS:');
                logToFile(`   Primer registro: ${JSON.stringify(this.allRecords[0], null, 2).substring(0, 200)}...`);
                logToFile(`   Último registro: ${JSON.stringify(this.allRecords[this.allRecords.length - 1], null, 2).substring(0, 200)}...`);
            }
            return { success: true, data: this.allRecords };
        } catch (error) {
            logToFile('❌ ERROR:', error);
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
            logToFile(`📁 Resultados exportados a: ${outputPath}`);
            return true;
        } catch (error) {
            logToFile('❌ Error exportando:', error);
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
    console.log(`Iniciando procesamiento de PDF(s) en: ${outputDir}`);
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

        console.log(`🚀 INICIANDO PROCESAMIENTO DE ${files.length} ARCHIVO(S)...\n`);

        for (const filePath of files) {
            const fileName = path.basename(filePath, '.pdf');
            const result = await extractor.extractFromPDF(filePath);

            if (result.success && result.data.length > 0) {
                // Exporta en múltiples formatos
                const jsonPath = path.join(outputDir, `${fileName}.json`);
                const csvPath = path.join(outputDir, `${fileName}.csv`);
                const txtPath = path.join(outputDir, `${fileName}.txt`);
                extractor.exportResults(result.data, jsonPath, 'json');
                extractor.exportResults(result.data, csvPath, 'csv');
                extractor.exportResults(result.data, txtPath, 'txt');

                // Imprime las rutas en consola
            } else {
                console.error(`❌ Error procesando ${filePath}:`,
                    result.error ? result.error.message : 'No se extrajeron registros');
            }
        }
        console.log(`✅ ${fileName}: ${result.data.length} registros procesados`);
        console.log(`   Archivos exportados:`);
        console.log(`      JSON: ${jsonPath}`);
        console.log(`      CSV:  ${csvPath}`);
        console.log(`      TXT:  ${txtPath}`);

        console.log('\n🎉 TODOS LOS ARCHIVOS PROCESADOS');

    } catch (error) {
        console.error('❌ Error general:', error);
    }
}

// Exportar para uso
module.exports = { PDFTableExtractor, processPDFs };

// Uso:
// const { processPDFs } = require('./pdf-extractor');
// processPDFs('./mi-extracto.pdf', './output/');