const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');

// FIJACIÓN DE RUTAS PARA COMPATIBILIDAD CON ELECTRON
const basePath = path.join(__dirname, '../../../node_modules/pdfjs-dist');
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(basePath, 'build/pdf.worker.js');
pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = `https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/`;

/**
 * Clase base para extraer tablas de documentos PDF de manera genérica,
 * basándose en la detección de fechas y cabeceras.
 */
class PDFTableExtractor {
    constructor() {
        this.keyWords = {
            fecha: ['fecha', 'date', 'día', 'dia'],
            saldo: ['saldo', 'balance', 'disponible'],
            concepto: ['concepto', 'descripción', 'descripcion', 'detalle', 'detail', 'movimiento'],
            debito: ['débito', 'debito', 'debe', 'cargo', 'egreso', 'debit'],
            credito: ['crédito', 'credito', 'haber', 'abono', 'ingreso', 'credit']
        };
        this.datePattern = /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/;
        this.tolerance = 15;
        this.columnStructure = null;
        this.allRecords = [];
    }

    findAndSetColumnStructure(items) {
        const rows = this.groupItemsByY(items);
        let bestHeaderRow = null;
        let maxScore = 0;

        Object.entries(rows).forEach(([y, rowItems]) => {
            const score = this.evaluateHeaderRow(rowItems);
            if (score > maxScore && score >= 2) {
                maxScore = score;
                bestHeaderRow = { y: parseFloat(y), items: rowItems, score };
            }
        });

        if (bestHeaderRow) {
            const sortedItems = bestHeaderRow.items.sort((a, b) => a.x - b.x);
            const columns = [];
            const columnPositions = {};

            sortedItems.forEach((item) => {
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

    evaluateHeaderRow(rowItems) {
        let score = 0;
        const texts = rowItems.map(item => item.str.trim().toLowerCase());
        const hasDate = texts.some(text => this.keyWords.fecha.some(keyword => text.includes(keyword)));
        const hasSaldo = texts.some(text => this.keyWords.saldo.some(keyword => text.includes(keyword)));

        if (hasDate && hasSaldo) score += 5;
        else if (hasDate || hasSaldo) score += 2;

        Object.entries(this.keyWords).forEach(([category, keywords]) => {
            if (category !== 'fecha' && category !== 'saldo') {
                if (texts.some(text => keywords.some(keyword => text.includes(keyword)))) score += 1;
            }
        });
        return score;
    }

    groupItemsByY(items, tolerance = 10) {
        const groups = {};
        items.forEach(item => {
            let assignedY = Object.keys(groups).find(existingY => Math.abs(parseFloat(existingY) - item.y) <= tolerance);
            if (!assignedY) {
                assignedY = item.y.toString();
                groups[assignedY] = [];
            }
            groups[assignedY].push(item);
        });
        Object.values(groups).forEach(group => group.sort((a, b) => a.x - b.x));
        return groups;
    }

    findDateItems(items) {
        return items.filter(item => {
            const text = item.str.trim();
            if (!this.datePattern.test(text)) return false;
            const hasDatePrefix = items.some(otherItem =>
                Math.abs(otherItem.y - item.y) < 5 &&
                otherItem.x < item.x &&
                otherItem.str.toLowerCase().includes('fecha de')
            );
            return !hasDatePrefix;
        });
    }

    processItemsByDateRanges(items) {
        if (!this.columnStructure) return { records: [], nonTableItems: [] };

        const dateItems = this.findDateItems(items);
        if (dateItems.length === 0) return { records: [], nonTableItems: items };

        const sortedDates = dateItems.sort((a, b) => b.y - a.y);
        const records = [];
        let usedIndexes = new Set();

        for (let i = 0; i < sortedDates.length; i++) {
            const currentDate = sortedDates[i];
            const dateIdx = items.findIndex((item, idx) => !usedIndexes.has(idx) && this.datePattern.test(item.str.trim()) && item.y === currentDate.y && item.x === currentDate.x);
            if (dateIdx === -1) continue;

            let recordItems = [items[dateIdx]];
            usedIndexes.add(dateIdx);
            let idx = dateIdx + 1;

            while (idx < items.length) {
                const item = items[idx];
                if (i === sortedDates.length - 1) {
                    const tempRecord = this.createRecordFromItems([...recordItems, item], true);
                    const saldoValue = tempRecord['Saldo'];
                    if (typeof saldoValue === 'string' && saldoValue.trim().length > 0) {
                        if (Math.abs(currentDate.y - item.y) > 15) break;
                    }
                } else {
                    if (this.datePattern.test(item.str.trim()) && item.y !== currentDate.y) break;
                }
                recordItems.push(item);
                usedIndexes.add(idx);
                idx++;
            }

            const record = this.createRecordFromItems(recordItems, (i === 0 || i === sortedDates.length - 1) && sortedDates.length > 2);
            const firstCol = this.columnStructure.columns[0];
            if (record[firstCol] && this.datePattern.test(record[firstCol])) {
                records.push(record);
            }
        }

        const nonTableItems = items.filter((_, idx) => !usedIndexes.has(idx));
        return { records, nonTableItems };
    }

    createRecordFromItems(items, isEdgeRecord = false) {
        const record = {};
        this.columnStructure.columns.forEach(column => record[column] = '');

        let fechaY = items.find(item => this.datePattern.test(item.str.trim()))?.y || null;

        items.forEach(item => {
            let closestColumn = null;
            let minDistance = Infinity;
            const tolerance = this.tolerance * 6;

            Object.entries(this.columnStructure.positions).forEach(([column, x]) => {
                const distance = Math.abs(item.x - x);
                if (distance < minDistance && distance <= tolerance) {
                    minDistance = distance;
                    closestColumn = column;
                }
            });

            if (closestColumn) {
                if (closestColumn.toLowerCase().includes('saldo') && fechaY !== null && Math.abs(item.y - fechaY) > 2 && /^\d+\s+de\s+\d+$/i.test(item.str.trim())) {
                    return;
                }
                record[closestColumn] = (record[closestColumn] ? record[closestColumn] + ' ' : '') + item.str.trim();
            }
        });

        Object.entries(record).forEach(([column, value]) => {
            if (!value) {
                let bestItem = null;
                let minDistance = Infinity;
                const x = this.columnStructure.positions[column];
                items.forEach(item => {
                    const distance = Math.abs(item.x - x);
                    let alreadyAssigned = Object.entries(this.columnStructure.positions).some(([otherColumn, otherX]) => otherColumn !== column && record[otherColumn].includes(item.str.trim()));
                    if (distance < minDistance && !alreadyAssigned) {
                        minDistance = distance;
                        bestItem = item;
                    }
                });
                if (bestItem && minDistance < this.tolerance * 8) {
                    record[column] = bestItem.str.trim();
                }
            }
        });

        const cleanedRecord = {};
        this.columnStructure.columns.forEach(column => {
            let text = record[column].trim().replace(/\s+/g, ' ');
            if (column !== 'Descripción' && text && (record['Descripción'] || '').includes(text) && text.length < (record['Descripción'] || '').length) {
                text = '';
            }
            if (column.toLowerCase().includes('saldo') && text) {
                text = text.replace(/([0-9.,]+)\s+(\d{1,3})$/, (match, saldo, posiblePagina) => {
                    const num = parseInt(posiblePagina, 10);
                    return (num >= 1 && num <= 20) ? saldo : match;
                });
            }
            if (['saldo', 'saldos', 'valor', 'debito', 'débito', 'débitos', 'importe', 'crédito', 'créditos', 'credito'].some(k => column.toLowerCase().includes(k))) {
                text = this.formatNumero(text);
            }
            cleanedRecord[column] = text;
        });
        return cleanedRecord;
    }

    formatNumero(valor) {
        if (typeof valor !== 'string') return valor;
        let v = valor.replace(/\$/g, '').replace(/\./g, '');
        v = v.replace(/(\d+)(,|\.)?(\d{2})$/, (match, intPart, sep, decPart) => `${intPart},${decPart}`);
        return v.trim();
    }

    async processPage(page) {
        const content = await page.getTextContent();
        const items = content.items.map(item => ({ str: item.str, x: item.transform[4], y: item.transform[5] }));

        if (!this.columnStructure) {
            if (!this.findAndSetColumnStructure(items)) return [];
        }

        const { records } = this.processItemsByDateRanges(items);
        return records;
    }

    async extractFromPDF(filePath) {
        this.columnStructure = null;
        this.allRecords = [];
        const loadingTask = pdfjsLib.getDocument(filePath);
        const pdf = await loadingTask.promise;

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const pageRecords = await this.processPage(page, pageNum);
            this.allRecords = this.allRecords.concat(pageRecords);
        }
        return this.allRecords;
    }
}

module.exports = { PDFTableExtractor };