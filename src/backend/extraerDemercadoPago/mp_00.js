const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

// Configuración de archivos
const ARCHIVO_ENTRADA = './src/backend/extraerDemercadoPago/carpetaDePelotudeces/download_250603232632.pdf'; // Cambia por el nombre de tu archivo PDF
const ARCHIVO_SALIDA = './src/backend/extraerDemercadoPago/carpetaDePelotudeces/entradas_mercadopago.csv';

async function procesarEstadoCuenta() {
    try {
        // Leer el archivo PDF
        console.log('Leyendo archivo PDF:', ARCHIVO_ENTRADA);
        const dataBuffer = fs.readFileSync(ARCHIVO_ENTRADA);
        
        // Extraer texto del PDF
        console.log('Extrayendo texto del PDF...');
        const data = await pdf(dataBuffer);
        const contenido = data.text;
        
        console.log('Texto extraído correctamente. Procesando...');
        
        // Dividir en líneas
        const lineas = contenido.split('\n');
        
        // Array para almacenar las entradas
        const entradas = [];
        
        // Procesar cada línea
        for (let i = 0; i < lineas.length; i++) {
            const linea = lineas[i].trim();
            
            // Saltar líneas vacías o encabezados
            if (!linea || linea.includes('Fecha') || linea.includes('DETALLE') || linea.includes('===')) {
                continue;
            }
            
            // Buscar patrones de fecha (DD-MM-YYYY o DD/MM/YYYY)
            const patronFecha = /(\d{2}[-\/]\d{2}[-\/]\d{4})/;
            const matchFecha = linea.match(patronFecha);
            
            if (matchFecha) {
                // Extraer fecha
                const fecha = matchFecha[1].replace(/\//g, '-'); // Normalizar formato
                
                // Buscar valores monetarios en la línea
                // Patrón para capturar valores con $ y posibles signos negativos
                const patronValor = /\$\s*([-]?\s*[\d,]+\.?\d*)/g;
                let matchValor;
                const valoresEnLinea = [];
                
                while ((matchValor = patronValor.exec(linea)) !== null) {
                    const valorStr = matchValor[1].replace(/\s/g, '').replace(/,/g, '');
                    const valor = parseFloat(valorStr);
                    if (!isNaN(valor)) {
                        valoresEnLinea.push(valor);
                    }
                }
                
                // Identificar entradas (valores positivos)
                for (const valor of valoresEnLinea) {
                    if (valor > 0) {
                        // Extraer descripción (texto entre fecha y primer valor monetario)
                        const partes = linea.split(patronFecha);
                        let descripcion = '';
                        
                        if (partes.length > 1) {
                            // Tomar la parte después de la fecha y limpiarla
                            descripcion = partes[1]
                                .replace(/\$[\d,.-\s]+/g, '') // Remover valores monetarios
                                .replace(/\s+/g, ' ') // Normalizar espacios
                                .trim();
                        }
                        
                        entradas.push({
                            fecha: fecha,
                            descripcion: descripcion || 'Sin descripción',
                            valor: valor
                        });
                        
                        console.log(`Entrada encontrada: ${fecha} - $${valor.toFixed(2)} - ${descripcion}`);
                    }
                }
            }
        }
        
        // Crear CSV
        console.log(`\nGenerando archivo CSV con ${entradas.length} entradas...`);
        let csvContent = 'Fecha,Descripcion,Valor\n';
        
        entradas.forEach(entrada => {
            // Escapar comillas en la descripción
            const descripcionLimpia = entrada.descripcion.replace(/"/g, '""');
            csvContent += `${entrada.fecha},"${descripcionLimpia}",${entrada.valor.toFixed(2)}\n`;
        });
        
        // Escribir archivo CSV
        fs.writeFileSync(ARCHIVO_SALIDA, csvContent, 'utf8');
        
        // Resumen
        const totalEntradas = entradas.reduce((sum, entrada) => sum + entrada.valor, 0);
        
        console.log('\n=== RESUMEN ===');
        console.log(`Archivo procesado: ${ARCHIVO_ENTRADA}`);
        console.log(`Entradas encontradas: ${entradas.length}`);
        console.log(`Total de ingresos: $${totalEntradas.toFixed(2)}`);
        console.log(`Archivo CSV generado: ${ARCHIVO_SALIDA}`);
        
        // Mostrar primeras 5 entradas como ejemplo
        if (entradas.length > 0) {
            console.log('\n=== PRIMERAS ENTRADAS ===');
            entradas.slice(0, 5).forEach((entrada, index) => {
                console.log(`${index + 1}. ${entrada.fecha} - $${entrada.valor.toFixed(2)} - ${entrada.descripcion}`);
            });
        }
        
    } catch (error) {
        console.error('Error al procesar el archivo:', error.message);
        
        if (error.code === 'ENOENT') {
            console.log('\nAsegúrate de que el archivo existe y el nombre es correcto.');
            console.log(`Buscando: ${path.resolve(ARCHIVO_ENTRADA)}`);
        }
    }
}

// Función alternativa para procesar PDFs grandes línea por línea
async function procesarPDFGrande() {
    try {
        console.log('Procesando PDF grande:', ARCHIVO_ENTRADA);
        const dataBuffer = fs.readFileSync(ARCHIVO_ENTRADA);
        const data = await pdf(dataBuffer);
        const contenido = data.text;
        
        const lineas = contenido.split('\n');
        const entradas = [];
        let csvContent = 'Fecha,Descripcion,Valor\n';
        
        for (const linea of lineas) {
            const patronFecha = /(\d{2}[-\/]\d{2}[-\/]\d{4})/;
            const matchFecha = linea.match(patronFecha);
            
            if (matchFecha) {
                const fecha = matchFecha[1].replace(/\//g, '-');
                const patronValor = /\$\s*([-]?\s*[\d,]+\.?\d*)/g;
                let matchValor;
                
                while ((matchValor = patronValor.exec(linea)) !== null) {
                    const valorStr = matchValor[1].replace(/\s/g, '').replace(/,/g, '');
                    const valor = parseFloat(valorStr);
                    
                    if (!isNaN(valor) && valor > 0) {
                        const partes = linea.split(patronFecha);
                        const descripcion = partes.length > 1 ? 
                            partes[1].replace(/\$[\d,.-\s]+/g, '').replace(/\s+/g, ' ').trim() : 
                            'Sin descripción';
                        
                        const entrada = { fecha, descripcion, valor };
                        entradas.push(entrada);
                        
                        const descripcionLimpia = descripcion.replace(/"/g, '""');
                        csvContent += `${fecha},"${descripcionLimpia}",${valor.toFixed(2)}\n`;
                    }
                }
            }
        }
        
        fs.writeFileSync(ARCHIVO_SALIDA, csvContent, 'utf8');
        
        const totalEntradas = entradas.reduce((sum, entrada) => sum + entrada.valor, 0);
        console.log(`Procesamiento completado. ${entradas.length} entradas encontradas.`);
        console.log(`Total de ingresos: ${totalEntradas.toFixed(2)}`);
        console.log(`Archivo CSV generado: ${ARCHIVO_SALIDA}`);
        
    } catch (error) {
        console.error('Error al procesar el PDF:', error.message);
    }
}

// Ejecutar el procesador
console.log('=== PROCESADOR DE ESTADO DE CUENTA MERCADOPAGO (PDF) ===\n');

// Usar la función apropiada según el tamaño del archivo
// Para archivos grandes, usar procesarPDFGrande()
// Para archivos normales, usar procesarEstadoCuenta()

procesarEstadoCuenta().catch(error => {
    console.error('Error:', error.message);
}); // Cambia por procesarPDFGrande() si es necesario