const path = require('path');


/*
   credicop3: {
        procesador: procesarCredicop2,
        palabrasClave: ['EURO', 'Sucursal 115 −', 'Sucursal 315 − Lavalle', 'Cuenta','Corriente Comercial', 'Corriente − Modulo 1', 'CUIT 30−57142135−2'],
        umbral: 3
    }
        */

// Helper para limpiar y normalizar valores numéricos
function cleanAndParseNumber(value) {
    if (typeof value !== 'string') return value;
    let cleaned = value.trim()
                       .replace(/['`\u2018\u2019]/g, '') // Remove all occurrences of these quotes
                       .replace(/[\x00-\x1F\x7F]/g, ''); // Remove non-printable ASCII control characters

    const numericCandidate = cleaned.replace(/\./g, '').replace(/,/g, '.'); // Remove thousands separator, replace decimal comma with dot
    const num = parseFloat(numericCandidate);

    if (!isNaN(num) && /^[-\u2212]?\d+(\.\d+)?$/.test(numericCandidate)) {
        return num;
    }
    return cleaned; // Return cleaned string if not a number
}

// Helper para parsear fechas
function parseDate(dateString) {
    if (!dateString) return null;
    const match = dateString.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
    if (match) {
        let [_, day, month, year] = match;
        if (year.length === 2) year = `20${year}`;
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return null;
}

// --- DEFINICIÓN DE DISEÑO DE TABLAS PARA CREDICOP3 (HARDCODED) ---
const MAPA_DE_DISEÑO_CREDICOP3 = {
    columnas: [
        { nombre: "Fecha",       inicioX: 25,  finX: 72 }, // Ajustado de JSON
        { nombre: "Comprobante", inicioX: 72,  finX: 100 },
        { nombre: "Descripcion", inicioX: 100, finX: 363 }, // Rango amplio para la descripción
        { nombre: "Debito",      inicioX: 363, finX: 440 },
        { nombre: "Credito",     inicioX: 440, finX: 520 },
        { nombre: "Saldo",       inicioX: 520, finX: 600 } // Hasta el final de la página
    ]
};

function encontrarColumnaPorLayout(itemX, layout) {
    const columna = layout.columnas.find(c => itemX >= c.inicioX && itemX < c.finX);
    return columna ? columna.nombre : null;
}

function convertirFilaAObjeto(lineaItems, layout) {
    const registro = {};
    layout.columnas.forEach(c => registro[c.nombre] = '');

    lineaItems.forEach(item => {
        const colName = encontrarColumnaPorLayout(item.transform[4], layout);
        if (colName && item.str.trim()) {
            registro[colName] = (registro[colName] ? registro[colName] + ' ' : '') + item.str.trim();
        }
    });

    // Post-procesamiento y normalización
    for (const key in registro) {
        if (key.toLowerCase().includes('debito') || key.toLowerCase().includes('credito') || key.toLowerCase().includes('saldo')) {
            registro[key] = cleanAndParseNumber(registro[key]);
        } else {
            registro[key] = registro[key].trim().replace(/\s+/g, ' ');
        }
    }

    return Object.values(registro).some(v => v) ? registro : null;
}

async function procesarCredicop3(allFilas) {
    if (!allFilas || allFilas.length === 0) {
        return { exito: false, error: 'No se recibieron datos del PDF.' };
    }

    const allLines = allFilas;
    const registros = [];
    const regexFecha = /^\d{2}\/\d{2}\/\d{2}/;
    const errors = [];

    const headerKeywords = ['FECHA', 'COMBTE', 'DESCRIPCION', 'DEBITO', 'CREDITO', 'SALDO'];
    let headerLineIndex = -1;
    for (let i = 0; i < allLines.length; i++) {
        if (!allLines[i] || !Array.isArray(allLines[i].items)) continue;
        
        const lineText = allLines[i].items.map(item => item.str.toUpperCase()).join(' ');
        if (headerKeywords.every(keyword => lineText.includes(keyword))) {
            headerLineIndex = i;
            break; // Use the first header found
        }
    }

    if (headerLineIndex === -1) {
        errors.push('No se pudo encontrar el encabezado de la tabla en el documento.');
        return { exito: false, error: errors.join('; ') };
    }

    let dataRows = allLines.slice(headerLineIndex + 1);

    const saldoAnteriorData = [];
    const saldoAnteriorIndex = dataRows.findIndex(line => {
        if (!line || !Array.isArray(line.items)) return false;
        const lineText = line.items.map(item => item.str).join(' ').toUpperCase();
        return lineText.includes('SALDO') && lineText.includes('ANTERIOR');
    });

    if (saldoAnteriorIndex !== -1) {
        const saldoLineItems = dataRows[saldoAnteriorIndex].items;
        const registroSaldo = convertirFilaAObjeto(saldoLineItems, MAPA_DE_DISEÑO_CREDICOP3);

        if (registroSaldo && (registroSaldo.Saldo || registroSaldo.Saldo === 0)) {
            saldoAnteriorData.push({
                Fecha: '', Comprobante: '', Descripcion: 'SALDO ANTERIOR',
                Debito: '', Credito: '', Saldo: registroSaldo.Saldo
            });
            dataRows.splice(saldoAnteriorIndex, 1);
        }
    }

    let i = 0;
    let lastProcessedAllLinesIndex = -1; // Index relative to allLines

    while (i < dataRows.length) {
        const filaActual = dataRows[i];
        if (!filaActual || !Array.isArray(filaActual.items) || filaActual.items.length === 0) {
            i++;
            continue;
        }

        const primerItemEnFila = filaActual.items.find(item => item.str.trim() !== '');
        if (primerItemEnFila && regexFecha.test(primerItemEnFila.str.trim())) {
            const itemsDelRegistro = [...filaActual.items];
            let temp_i = i; // Temporary index to track merged lines
            
            let j = i + 1;
            if (j < dataRows.length) {
                const siguienteFila = dataRows[j];
                if (siguienteFila && Array.isArray(siguienteFila.items) && siguienteFila.items.length > 0) {
                    const siguientePrimerItem = siguienteFila.items.find(item => item.str.trim() !== '');
                    if (siguientePrimerItem && !regexFecha.test(siguientePrimerItem.str.trim())) {
                        
                        const yDistance = Math.abs(filaActual.y - siguienteFila.y);
                        const xDistance = Math.abs(primerItemEnFila.transform[4] - siguientePrimerItem.transform[4]);

                        if (yDistance < 25 && xDistance < 15) { // Condición de proximidad vertical Y horizontal
                            itemsDelRegistro.push(...siguienteFila.items);
                            temp_i++; // Mark line as consumed for this record
                        }
                    }
                }
            }

            const registroProcesado = convertirFilaAObjeto(itemsDelRegistro, MAPA_DE_DISEÑO_CREDICOP3);
            if (registroProcesado) {
                registros.push(registroProcesado);
                // Update the master index of the last processed row
                lastProcessedAllLinesIndex = headerLineIndex + 1 + temp_i;
            }
            i = temp_i + 1; // Move main index past all consumed lines
        } else {
            i++;
        }
    }

    const finalRecords = [...saldoAnteriorData, ...registros];

    if (finalRecords.length === 0) {
        errors.push('No se encontraron datos válidos en la tabla.');
        return { exito: false, error: errors.join('; ') };
    }

    // --- EXTRACCIÓN DE INFORMACIÓN ADICIONAL (REVISED LOGIC) ---
    const infoAdicional = [];
    const headerAndFooterKeywords = [
        'credicoop', 'página', 'pagina', 'cuit', 'corriente comercial', 'sucursal', 
        'www.bancocredicoop.coop', 'saldo anterior', 'fecha', 'combte', 
        'descripcion', 'debito', 'credito', 'saldo', 'comprobante'
    ];

    if (lastProcessedAllLinesIndex !== -1) {
        const candidateRows = allLines.slice(lastProcessedAllLinesIndex + 1);
        for (const fila of candidateRows) {
            const lineaTexto = fila.items.map(item => item.str).join(' ').trim();
            
            // Skip empty lines or lines that are just a number (page numbers)
            if (!lineaTexto || /^\d+$/.test(lineaTexto)) {
                continue;
            }

            const lineaTextoLower = lineaTexto.toLowerCase();
            const isHeaderOrFooter = headerAndFooterKeywords.some(keyword => lineaTextoLower.includes(keyword));
            
            if (!isHeaderOrFooter) {
                infoAdicional.push({ "Informacion Adicional": lineaTexto });
            }
        }
    }

    const tablas = [{
        titulo: 'Movimientos',
        datos: finalRecords
    }];

    if (infoAdicional.length > 0) {
        tablas.push({
            titulo: 'Info Adicional',
            datos: infoAdicional
        });
    }

    return {
        exito: true,
        tablas: tablas,
        suggestedFileName: 'Credicop_Extracto.xlsx'
    };
}

module.exports = { procesarCredicop3 };