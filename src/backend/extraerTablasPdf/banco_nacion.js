const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');
const fs = require('fs');

const ruta = '/home/pinchechita/Descargas/8-25-4.pdf';
const pdfPath = path.join(ruta);

const archivoJSON = 'registros_nacion.json';
const archivoCSV = 'registros_nacion.csv';

async function leerPDF() {
    try {
        const loadingTask = pdfjsLib.getDocument(pdfPath);
        const pdf = await loadingTask.promise;

        // console.log(`PDF cargado. Número de páginas: ${pdf.numPages}`);
        // Procesar todas las páginas y extraer registros
        const registros = await procesarPDF(pdf);
        // Exportar resultados
        exportarResultados(registros);
    } catch (err) {
        console.error('Error al leer el PDF:', err);
    }
}

async function procesarPDF(pdf) {
    let registros = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        // console.log(`\nProcesando página ${pageNum}...`);
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        // Limpiar items eliminando "$" solos y espacios vacíos
        const itemsLimpios = limpiarItems(content.items);
        // Buscar registros en esta página
        const registrosPagina = extraerRegistrosDePagina(itemsLimpios, pageNum);
        registros = registros.concat(registrosPagina);
    }
    return registros;
}

function limpiarItems(items) {
    return items.filter(item => {
        const str = item.str ? item.str.trim() : '';
        // Eliminar items vacíos o que solo contengan "$"
        return str !== '' && str !== '$';
    });
}

function extraerRegistrosDePagina(items, pageNum) {
    const registros = [];
    // Buscar cabeceras para determinar posiciones
    const posicionesCabeceras = encontrarCabeceras(items);
    // console.log(`Posiciones cabeceras página ${pageNum}:`, posicionesCabeceras);
    // Buscar registros basándose en fechas
    for (let i = 0; i < items.length - 1; i++) {
        const item = items[i];
        const siguiente = items[i + 1];
        if (esFormatoFecha(item.str, siguiente.str)) {
            const registro = construirRegistro(items, i, posicionesCabeceras);
            if (registro) {
                registros.push(registro);
                // console.log(`Registro encontrado:`, registro);
            }
        }
    }
    return registros;
}

function encontrarCabeceras(items) {
    const cabeceras = ['Fecha', 'Comprobante', 'Concepto', 'Importe', 'Saldo'];
    const posiciones = {};
    cabeceras.forEach(cabecera => {
        const encontrado = items.find(item => 
            item.str && item.str.trim().toLowerCase().includes(cabecera.toLowerCase())
        );
        if (encontrado && encontrado.transform) {
            posiciones[cabecera] = {
                x: encontrado.transform[4],
                y: encontrado.transform[5]
            };
        }
    });
    return posiciones;
}

function construirRegistro(items, startIdx, posiciones) {
    try {
        const fechaCompleta = items[startIdx].str.trim() + items[startIdx + 1].str.trim();
        // Buscar los siguientes elementos válidos después de la fecha
        const elementosRestantes = [];
        let idx = startIdx + 2;
        // Recoger los próximos elementos no vacíos
        while (elementosRestantes.length < 10 && idx < items.length) {
            const item = items[idx];
            if (item.str && item.str.trim() !== '') {
                elementosRestantes.push({
                    str: item.str.trim(),
                    x: item.transform ? item.transform[4] : 0,
                    y: item.transform ? item.transform[5] : 0
                });
            }
            idx++;
        }
        // Construir registro basándose en los elementos encontrados
        const registro = {
            Fecha: fechaCompleta,
            Comprobante: '',
            Concepto: '',
            Importe: '',
            Saldo: ''
        };
        // Análisis inteligente de los elementos
        let conceptoParts = [];
        let importeEncontrado = false;
        let saldoEncontrado = false;
        for (let i = 0; i < elementosRestantes.length; i++) {
            const elemento = elementosRestantes[i];
            const str = elemento.str;
            // Detectar número de comprobante (números de 4-8 dígitos, puede incluir letras al final)
            if (!registro.Comprobante && /^\d{4,8}[A-Z]*$/.test(str)) {
                registro.Comprobante = str;
                continue;
            }
            // Detectar importes (números con formato monetario)
            if (esImporteMonetario(str)) {
                if (!importeEncontrado) {
                    registro.Importe = formatearImporte(str);
                    importeEncontrado = true;
                } else if (!saldoEncontrado) {
                    registro.Saldo = formatearImporte(str);
                    saldoEncontrado = true;
                }
                continue;
            }
            // Si no es comprobante ni importe, es parte del concepto
            if (!importeEncontrado) {
                conceptoParts.push(str);
            }
        }
        // Unir las partes del concepto
        registro.Concepto = conceptoParts.join(' ').trim();
        // Validar que el registro tenga al menos fecha y algún dato más
        if (registro.Fecha && (registro.Comprobante || registro.Concepto)) {
            return registro;
        }
        return null;
    } catch (error) {
        // console.error('Error construyendo registro:', error);
        return null;
    }
}

function esFormatoFecha(itemStr, siguienteStr) {
    if (!itemStr || !siguienteStr) return false;
    
    const tieneFormatoFecha = /^\d{2}\/\d{2}$/.test(itemStr.trim()); // dd/mm
    const siguienteEsAnio = /^\/\d{4}$/.test(siguienteStr.trim());   // /aaaa
    
    return tieneFormatoFecha && siguienteEsAnio;
}

function esImporteMonetario(str) {
    // Detectar formatos como: $1.234.567,89, 1.234.567,89, $1234567.89, etc.
    const patterns = [
        /^\$?\s*-?\d{1,3}(\.\d{3})*,\d{2}$/,  // $1.234.567,89
        /^\$?\s*-?\d{1,3}(\.\d{3})*\.\d{2}$/,  // $1.234.567.89
        /^\$?\s*-?\d+,\d{2}$/,                 // $1234,89
        /^\$?\s*-?\d+\.\d{2}$/                 // $1234.89
    ];
    
    return patterns.some(pattern => pattern.test(str.trim()));
}

function formatearImporte(str) {
    // Remover $ y espacios
    let numero = str.replace(/\$|\s/g, '');
    
    // Si tiene puntos como separadores de miles y coma como decimal
    if (numero.includes(',') && numero.lastIndexOf('.') < numero.lastIndexOf(',')) {
        // Formato: 1.234.567,89 -> quitar puntos y cambiar coma por punto temporalmente
        numero = numero.replace(/\./g, '').replace(',', '.');
        // Convertir a float y luego formatear con coma decimal
        const valor = parseFloat(numero);
        return valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    
    // Si solo tiene puntos (formato americano)
    if (numero.includes('.') && !numero.includes(',')) {
        const valor = parseFloat(numero);
        return valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    
    // Si solo tiene comas
    if (numero.includes(',') && !numero.includes('.')) {
        const valor = parseFloat(numero.replace(',', '.'));
        return valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    
    // Fallback: devolver como está pero sin $
    return numero;
}

function exportarResultados(registros) {
    if (registros.length === 0) {
        // console.log('No se encontraron registros válidos.');
        return;
    }
    // Exportar a JSON
    fs.writeFileSync(archivoJSON, JSON.stringify(registros, null, 2), 'utf8');
    // console.log(`\nArchivo ${archivoJSON} creado con ${registros.length} registros.`);
    // Exportar a CSV
    const headers = ['Fecha', 'Comprobante', 'Concepto', 'Importe', 'Saldo'];
    const csvRows = [headers.join(',')];
    registros.forEach(registro => {
        const row = headers.map(header => {
            const value = registro[header] || '';
            // Escapar comillas dobles en CSV
            return `"${value.toString().replace(/"/g, '""')}"`;
        });
        csvRows.push(row.join(','));
    });
    fs.writeFileSync(archivoCSV, csvRows.join('\n'), 'utf8');
    // console.log(`Archivo ${archivoCSV} creado con ${registros.length} registros.`);
    // Mostrar resumen
    // console.log('\n=== RESUMEN DE PROCESAMIENTO ===');
    // console.log(`Total de registros procesados: ${registros.length}`);
    if (registros.length > 0) {
        // console.log('\nPrimeros 3 registros:');
        // registros.slice(0, 3).forEach((reg, idx) => {
        //     console.log(`${idx + 1}:`, reg);
        // });
    }
}

// Procesar el PDF de Banco Nación
async function procesarBancoNacion(pdfPath) {
    try {
        const loadingTask = pdfjsLib.getDocument(pdfPath);
        const pdf = await loadingTask.promise;
        const registros = await procesarPDF(pdf);
        exportarResultados(registros);
        return registros;
    } catch (err) {
        return [];
    }
}

// Exporta la función para uso externo
module.exports = { procesarBancoNacion };