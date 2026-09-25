const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse'); // Import csv-parse

async function convertCsvToExcel(csvString, excelFilePath) {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Datos');

        // Use csv-parse to parse the CSV string
        const records = await new Promise((resolve, reject) => {
            parse(csvString, {
                delimiter: ',', // Assuming comma is the delimiter
                quote: '"',     // Assuming double quote is the quote character
                escape: '"',    // Assuming double quote is the escape character for quotes
                trim: true,     // Trim spaces around values
                skip_empty_lines: true // Skip empty lines
            }, (err, output) => {
                if (err) reject(err);
                resolve(output);
            });
        });

        records.forEach(row => {
            const processedRowData = row.map(cell => {
                if (typeof cell !== 'string') {
                    return { value: cell, type: ExcelJS.ValueType.String };
                }

                let cleanedValue = cell.trim()
                                   .replace(/['`\u2018\u2019]/g, '')
                                   .replace(/[\x00-\x1F\x7F]/g, '');

                const numericCandidate = cleanedValue.replace(/\./g, '').replace(/,/g, '.');
                const num = parseFloat(numericCandidate);

                if (!isNaN(num) && /^[-\u2212]?\d+(\.\d+)?$/.test(numericCandidate)) { // Account for both hyphen-minus and MINUS SIGN
                    return { value: num, type: ExcelJS.ValueType.Number };
                }

                if (cleanedValue.match(/^\d{2}\/\d{2}\/\d{2,4}$/)) {
                    const [day, month, year] = cleanedValue.split('/');
                    const date = new Date(year.length === 2 ? `20${year}` : year, month - 1, day);
                    if (!isNaN(date.getTime())) {
                        return { value: date, type: ExcelJS.ValueType.Date };
                    }
                }

                return { value: cleanedValue, type: ExcelJS.ValueType.String };
            });

            const newRow = worksheet.addRow([]); // Add an empty row first
            processedRowData.forEach((cellData, index) => {
                const cell = newRow.getCell(index + 1); // ExcelJS cells are 1-indexed
                cell.value = cellData.value;
                cell.type = cellData.type;

                // Optional: Apply number format for numeric cells
                if (cellData.type === ExcelJS.ValueType.Number) {
                    cell.numFmt = '#,##0.00'; // Example format: 123,456.78
                }
                // Optional: Apply date format for date cells
                if (cellData.type === ExcelJS.ValueType.Date) {
                    cell.numFmt = 'dd/mm/yyyy'; // Example format: 01/01/2024
                }
            });
        });

        // Ensure the directory exists
        const dir = path.dirname(excelFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write to Excel file
        await workbook.xlsx.writeFile(excelFilePath);
        console.log(`✓ Archivo Excel guardado en: ${excelFilePath}`);
        return { exito: true, rutaExcel: excelFilePath };
    } catch (error) {
        console.error(`Error al convertir CSV a Excel: ${error.message}`);
        return { exito: false, error: `Fallo al convertir a Excel: ${error.message}` };
    }
}

module.exports = { convertCsvToExcel };