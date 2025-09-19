// ================================
// EXTRACTOR MODULARIZADO DE TABLAS PDF
// ================================

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');
const fs = require('fs');

// FIJACIÓN DE RUTAS PARA COMPATIBILIDAD CON ELECTRON
const basePath = path.join(__dirname, '../../../node_modules/pdfjs-dist');
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(basePath, 'build/pdf.worker.js');
pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = path.join(basePath, 'standard_fonts/');

// ================================
// CONFIGURACIÓN
// ================================
const CONFIG = {
    rutaPDF: '/home/pinchechita/Downloads/descargasATM/constanciaDeCumplimientoFiscal/plan_pago.pdf',
    archivoJSON: 'planDePago_archivo.json',
    archivoCSV: 'planDePago_archivo.csv',
    archivoEncabezado: 'encabezadoDocumento.txt',
    
    palabrasClaveTablasTablas: [
        "OBLIGACIONES",
        "CUOTAS DE LA FORMA DE PAGO",
        "DETALLE DE PAGOS", 
        "PLAN DE PAGO",
        "CRONOGRAMA",
        "CUOTAS",
        "PAGOS",
        "TABLA"
    ],

    palabrasClaveExclusion: [
        "CANTIDAD CUOTAS",
        "IMPORTE CUOTA"
    ],

    lineasExclusionFooter: [
        "Ante cualquier consulta"
    ],
    
    maxLineasEncabezado: 15,
    minElementosFila: 2,
    maxElementosFila: 8,
    buscarEncabezadosHasta: 6
};

// ================================
// FUNCIÓN ORGANIZADORA PRINCIPAL
// ================================
async function procesarPlanDePago(filePath, options = { saveFiles: false }) {
    try {
        const pathToProcess = filePath || CONFIG.rutaPDF;
        // console.log(`🚀 Iniciando procesamiento de PDF para Plan de Pago: ${pathToProcess}`);
        
        const pdf = await cargarPDF(pathToProcess);
        // console.log(`📄 PDF cargado: ${pdf.numPages} páginas`);
        const contenidoPaginas = await extraerContenidoTodasPaginas(pdf);
        const encabezadoDocumento = extraerEncabezadoDocumento(contenidoPaginas[0]);
        const todasLasTablas = buscarTodasLasTablas(contenidoPaginas);
        
        let tablasLimpias = limpiarYProcesarTablas(todasLasTablas);
        let tablasTituladas = corregirTitulosDeContinuacion(tablasLimpias);
        const tablasConsolidadas = consolidarTablas(tablasTituladas);
        
        if (options.saveFiles) {
            await guardarTodosLosResultados(encabezadoDocumento, tablasConsolidadas);
            mostrarResumenProcesamiento(tablasConsolidadas);
        }
        
        // console.log('✅ Procesamiento de Plan de Pago completado exitosamente');

        const textoCsv = generarTextoCsvPlanDePago(encabezadoDocumento, tablasConsolidadas);

        return {
            datos: tablasConsolidadas.flatMap(tabla => tabla.datos),
            textoCsv: textoCsv
        };
        
    } catch (error) {
        console.error('❌ Error en procesamiento de Plan de Pago:', error);
        return null;
    }
}

// ================================
// MÓDULO: CARGA DE PDF
// ================================
async function cargarPDF(pdfPath) {
    const loadingTask = pdfjsLib.getDocument(pdfPath);
    const pdf = await loadingTask.promise;
    console.log(`📄 PDF cargado: ${pdf.numPages} páginas`);
    return pdf;
}

// ================================
// MÓDULO: EXTRACCIÓN DE CONTENIDO
// ================================
async function extraerContenidoTodasPaginas(pdf) {
    const contenidoPaginas = [];
    for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
        const page = await pdf.getPage(numPagina);
        const content = await page.getTextContent();
        const contenidoPagina = {
            numero: numPagina,
            items: content.items,
            itemsPorY: organizarItemsPorCoordenadas(content.items),
            totalElementos: content.items.length
        };
        contenidoPagina.yKeys = Object.keys(contenidoPagina.itemsPorY).sort((a, b) => b - a);
        contenidoPaginas.push(contenidoPagina);
    }
    return contenidoPaginas;
}

function organizarItemsPorCoordenadas(items) {
    const itemsPorY = {};
    items.forEach(item => {
        const y = item.transform[5].toFixed(2);
        if (!itemsPorY[y]) itemsPorY[y] = [];
        itemsPorY[y].push(item);
    });
    Object.keys(itemsPorY).forEach(y => {
        itemsPorY[y].sort((a, b) => a.transform[4] - b.transform[4]);
    });
    return itemsPorY;
}

// ================================
// MÓDULO: EXTRACCIÓN DE ENCABEZADO
// ================================
function extraerEncabezadoDocumento(primeraPagina) {
    const lineasEncabezado = [];
    if (!primeraPagina) return '';
    const maxLineas = Math.min(CONFIG.maxLineasEncabezado, primeraPagina.yKeys.length);
    for (let i = 0; i < maxLineas; i++) {
        const y = primeraPagina.yKeys[i];
        const textoLinea = primeraPagina.itemsPorY[y].map(item => item.str).join(' ').trim();
        const textoLineaUpper = textoLinea.toUpperCase();
        const esExclusion = (CONFIG.palabrasClaveExclusion || []).some(p => textoLineaUpper.includes(p.toUpperCase()));
        const esTituloTabla = CONFIG.palabrasClaveTablasTablas.some(p => textoLineaUpper.includes(p.toUpperCase()));
        if (!esExclusion && (esTituloTabla || esFilaDeEncabezados(textoLinea.toLowerCase()))) break;
        if (textoLinea) lineasEncabezado.push(textoLinea);
    }
    return lineasEncabezado.join('\n');
}

// ================================
// MÓDULO: BÚSQUEDA DE TABLAS
// ================================
function buscarTodasLasTablas(contenidoPaginas) {
    let todasLasTablas = [];
    contenidoPaginas.forEach(pagina => {
        const tablasEnPagina = buscarTablasEnPagina(pagina);
        todasLasTablas = todasLasTablas.concat(tablasEnPagina);
    });
    return todasLasTablas;
}

function buscarTablasEnPagina(pagina) {
    const tablasEncontradas = [];
    let i = 0;
    while (i < pagina.yKeys.length) {
        const y = pagina.yKeys[i];
        const textoLinea = pagina.itemsPorY[y].map(item => item.str).join(' ').trim().toUpperCase();
        const esExclusion = (CONFIG.palabrasClaveExclusion || []).some(p => textoLinea.includes(p.toUpperCase()));
        if (esExclusion) { i++; continue; }
        const palabraEncontrada = CONFIG.palabrasClaveTablasTablas.find(p => textoLinea.includes(p.toUpperCase()));
        if (palabraEncontrada) {
            const tabla = extraerTablaCompleta(pagina, i, textoLinea);
            if (tabla && tabla.datos.length > 0) {
                tablasEncontradas.push(tabla);
                i = tabla.ultimoIndice + 1;
            } else { i++; }
        } else if (pagina.numero > 1 && esFilaDeEncabezados(textoLinea.toLowerCase())) {
            const tabla = extraerTablaCompleta(pagina, i - 1, "TABLA CONTINUADA");
            if (tabla && tabla.datos.length > 0) {
                tabla.pagina = pagina.numero;
                tablasEncontradas.push(tabla);
                i = tabla.ultimoIndice + 1;
            } else { i++; }
        } else { i++; }
    }
    return tablasEncontradas;
}

// ================================
// MÓDULO: EXTRACCIÓN DE TABLA INDIVIDUAL
// ================================
function extraerTablaCompleta(pagina, indiceInicio, titulo) {
    const infoEncabezados = encontrarEncabezadosTabla(pagina, indiceInicio);
    if (!infoEncabezados) return null;
    const datosTabla = extraerDatosTabla(pagina, infoEncabezados);
    return {
        titulo: titulo,
        pagina: pagina.numero,
        encabezados: infoEncabezados.encabezados,
        datos: datosTabla.filas,
        ultimoIndice: datosTabla.ultimoIndice
    };
}

function encontrarEncabezadosTabla(pagina, indiceInicio) {
    for (let j = indiceInicio + 1; j < Math.min(indiceInicio + CONFIG.buscarEncabezadosHasta, pagina.yKeys.length); j++) {
        const y = pagina.yKeys[j];
        const filaItems = pagina.itemsPorY[y];
        if (filaItems.length >= 3) {
            const textoFila = filaItems.map(item => item.str).join(' ').toLowerCase();
            if (esFilaDeEncabezados(textoFila) || j === indiceInicio + 1) {
                const encabezados = crearEncabezadosConCoordenadas(filaItems);
                return { encabezados, indiceEncabezados: j, indiceDatos: j + 1 };
            }
        }
    }
    return null;
}

function esFilaDeEncabezados(texto) {
    const palabras = ['período', 'cuota','concepto', 'total', 'boletos', 'fecha vencimiento', 'fecha', 'vencimiento', 'capital', 'interes', 'numero', 'importe', 'saldo', 'periodo', 'monto', 'obligacion', 'tipo', 'descripcion', 'valor', 'estado'];
    return palabras.filter(p => texto.includes(p)).length >= 3;
}

function crearEncabezadosConCoordenadas(items) {
    return items.map(item => ({ text: item.str.trim(), x: item.transform[4] })).filter(item => item.text.length > 0);
}

function extraerDatosTabla(pagina, infoEncabezados) {
    const filas = [];
    let ultimoIndice = infoEncabezados.indiceDatos - 1;
    for (let j = infoEncabezados.indiceDatos; j < pagina.yKeys.length; j++) {
        const y = pagina.yKeys[j];
        const filaItems = pagina.itemsPorY[y];
        const textoCompleto = filaItems.map(item => item.str).join(' ');
        if ((CONFIG.lineasExclusionFooter || []).some(f => textoCompleto.includes(f))) break;
        if (!esFilaValidaParaTabla(filaItems, infoEncabezados.encabezados)) break;
        if (esInicioDeNuevaTabla(textoCompleto.toUpperCase()) && filas.length > 0) break;
        filas.push(convertirFilaAObjeto(filaItems, infoEncabezados.encabezados));
        ultimoIndice = j;
    }
    return { filas, ultimoIndice };
}

function esFilaValidaParaTabla(filaItems, encabezados) {
    return filaItems.length >= CONFIG.minElementosFila && filaItems.length <= CONFIG.maxElementosFila;
}

function esInicioDeNuevaTabla(texto) {
    return CONFIG.palabrasClaveTablasTablas.some(p => texto.includes(p.toUpperCase()));
}

function convertirFilaAObjeto(filaItems, encabezados) {
    const filaObj = {};
    const valoresPorColumna = new Array(encabezados.length).fill('');
    filaItems.forEach(item => {
        const colIndex = encontrarColumnaParaItem(item.transform[4], encabezados);
        if (colIndex !== -1 && colIndex < valoresPorColumna.length) {
            valoresPorColumna[colIndex] = (valoresPorColumna[colIndex] ? valoresPorColumna[colIndex] + ' ' : '') + item.str.trim();
        }
    });
    encabezados.forEach((enc, index) => {
        let valor = valoresPorColumna[index] || '';
        if (index >= encabezados.length - 2) valor = formatearNumero(valor);
        filaObj[enc.text] = valor;
    });
    return filaObj;
}

function encontrarColumnaParaItem(itemX, encabezados) {
    // Asume que 'encabezados' está ordenado por X, lo cual es cierto por cómo se construye.
    if (encabezados.length === 0) return -1;
    if (encabezados.length === 1) return 0;

    for (let i = 0; i < encabezados.length; i++) {
        const colActualX = encabezados[i].x;

        if (i === 0) {
            // Primera columna: su zona va desde el inicio hasta el punto medio con la siguiente.
            const puntoMedio = (colActualX + encabezados[i + 1].x) / 2;
            if (itemX < puntoMedio) {
                return i;
            }
        } else if (i === encabezados.length - 1) {
            // Última columna: su zona va desde el punto medio con la anterior hasta el final.
            const puntoMedio = (encabezados[i - 1].x + colActualX) / 2;
            if (itemX >= puntoMedio) {
                return i;
            }
        } else {
            // Columnas intermedias: su zona está entre dos puntos medios.
            const puntoMedioAnterior = (encabezados[i - 1].x + colActualX) / 2;
            const puntoMedioSiguiente = (colActualX + encabezados[i + 1].x) / 2;
            if (itemX >= puntoMedioAnterior && itemX < puntoMedioSiguiente) {
                return i;
            }
        }
    }

    return -1; // No debería ocurrir si los encabezados están bien definidos.
}

// ================================
// MÓDULO: LIMPIEZA Y PROCESAMIENTO
// ================================
function corregirTitulosDeContinuacion(tablas) {
    let ultimoTituloReal = null;
    return tablas.map(tabla => {
        if (tabla.titulo !== 'TABLA CONTINUADA') {
            ultimoTituloReal = tabla.titulo;
            return tabla;
        } else if (ultimoTituloReal) {
            return { ...tabla, titulo: ultimoTituloReal };
        }
        return tabla;
    });
}

function consolidarTablas(tablas) {
    if (!tablas || tablas.length === 0) return [];
    const consolidadas = [];
    let tablaActual = null;
    for (const tabla of tablas) {
        if (tablaActual && tabla.titulo === tablaActual.titulo) {
            tablaActual.datos.push(...tabla.datos);
        } else {
            tablaActual = JSON.parse(JSON.stringify(tabla));
            consolidadas.push(tablaActual);
        }
    }
    return consolidadas;
}

function limpiarYProcesarTablas(tablas) {
    return tablas.map(tabla => {
        const datosLimpios = tabla.datos.map(fila => {
            const cuotaKey = Object.keys(fila).find(k => k.toLowerCase() === 'cuota');
            const conceptoKey = Object.keys(fila).find(k => k.toLowerCase() === 'concepto');

            // Parche para corregir la asignación de Concepto a la columna Cuota
            if (cuotaKey && conceptoKey && fila[cuotaKey] && typeof fila[cuotaKey] === 'string') {
                const parts = fila[cuotaKey].trim().split(/\s+/);
                if (parts.length > 1 && !isNaN(parts[0])) {
                    const cuotaValue = parts[0];
                    const conceptoValue = parts.slice(1).join(' ');
                    
                    fila[cuotaKey] = cuotaValue;
                    // Si Concepto ya tenía algo (poco probable), lo concatenamos
                    fila[conceptoKey] = fila[conceptoKey] ? conceptoValue + ' ' + fila[conceptoKey] : conceptoValue;
                }
            }

            return fila;
        });

        return { ...tabla, datos: datosLimpios };
    });
}

// ================================
// MÓDULO: GUARDADO DE RESULTADOS
// ================================
function convertirArrayACSV(data) {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    for (const row of data) {
        const values = headers.map(header => {
            const val = ('' + (row[header] || '')).replace(/"/g, '""');
            return `"${val}"`;
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
}

function generarTextoCsvPlanDePago(encabezadoDocumento, tablas) {
    let textoCsv = '=== ENCABEZADO DEL DOCUMENTO ===\n"Clave","Valor"\n';
    const lineasEncabezado = encabezadoDocumento.split('\n');
    lineasEncabezado.forEach(linea => {
        let clave = '', valor = '';
        const dosPuntosIndex = linea.indexOf(':');
        if (dosPuntosIndex !== -1) {
            clave = linea.substring(0, dosPuntosIndex).trim();
            valor = linea.substring(dosPuntosIndex + 1).trim();
        } else {
            valor = linea.trim();
        }
        textoCsv += `"${clave.replace(/"/g, '""')}","${valor.replace(/"/g, '""')}"\n`;
    });
    textoCsv += '\n';
    tablas.forEach((tabla, index) => {
        textoCsv += `=== ${tabla.titulo} ===\n`;
        textoCsv += `Página: ${Array.isArray(tabla.pagina) ? tabla.pagina.join(', ') : tabla.pagina}\n`;
        if (tabla.datos.length > 0) {
            textoCsv += convertirArrayACSV(tabla.datos) + '\n';
        } else {
            textoCsv += 'Sin datos\n';
        }
        if (index < tablas.length - 1) textoCsv += '\n';
    });
    return textoCsv;
}

async function guardarTodosLosResultados(encabezadoDocumento, tablas) {
    const resultadoJSON = {
        encabezadoDocumento,
        totalTablas: tablas.length,
        fechaProcesamiento: new Date().toISOString(),
        tablas
    };
    fs.writeFileSync(CONFIG.archivoJSON, JSON.stringify(resultadoJSON, null, 2), 'utf8');
    console.log(`   ✓ JSON guardado: ${CONFIG.archivoJSON}`);
    
    const textoCsv = generarTextoCsvPlanDePago(encabezadoDocumento, tablas);
    fs.writeFileSync(CONFIG.archivoCSV, textoCsv, 'utf8');
    console.log(`   ✓ CSV guardado: ${CONFIG.archivoCSV}`);
}

// ================================
// MÓDULO: UTILIDADES
// ================================
function formatearNumero(str) {
    if (!str || typeof str !== 'string') return str;
    str = str.replace(/\s/g, '');
    if (str.includes('.') && str.includes(',') && str.indexOf('.') > str.indexOf(',')) {
        return str.replace(/,/g, '').replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    if (str.includes('.') && !str.includes(',')) {
        const partes = str.split('.');
        if (partes.length === 2 && partes[1].length <= 2) return str.replace('.', ',');
    }
    return str;
}

function mostrarResumenProcesamiento(tablas) {
    console.log('\n📊 RESUMEN DE PROCESAMIENTO');
    console.log('=====================================');
    console.log(`Total de tablas procesadas: ${tablas.length}`);
    tablas.forEach((tabla, index) => {
        console.log(`${index + 1}. "${tabla.titulo}"`);
        console.log(`   📄 Página: ${tabla.pagina}`);
        console.log(`   📝 Filas: ${tabla.datos.length}`);
        console.log(`   🏷️  Columnas: ${tabla.encabezados.map(h => h.text).join(', ')}`);
        console.log('');
    });
}

// ================================
// EJECUCIÓN PRINCIPAL Y EXPORTACIÓN
// ================================
if (require.main === module) {
    (async () => {
        await procesarPlanDePago(null, { saveFiles: true });
    })();
}

module.exports = { procesarPlanDePago, generarTextoCsvPlanDePago };

// ================================
// FIN DEL CÓDIGO
// ================================