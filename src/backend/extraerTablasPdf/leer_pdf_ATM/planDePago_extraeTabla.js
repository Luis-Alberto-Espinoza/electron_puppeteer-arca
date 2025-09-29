const path = require('path');
const fs = require('fs');

// NOTA: La importación y configuración de pdfjs-dist se eliminan.

// ================================
// CONFIGURACIÓN
// ================================
const CONFIG = {
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
// La función ahora recibe 'allFilas' del orquestador.
async function procesarPlanDePago(allFilas) {
    try {
        // El contenido de las páginas ya viene procesado en allFilas.
        const contenidoPaginas = organizarFilasPorPagina(allFilas);

        const encabezadoDocumento = extraerEncabezadoDocumento(contenidoPaginas[0]);
        const todasLasTablas = buscarTodasLasTablas(contenidoPaginas);
        
        let tablasLimpias = limpiarYProcesarTablas(todasLasTablas);
        let tablasTituladas = corregirTitulosDeContinuacion(tablasLimpias);
        const tablasConsolidadas = consolidarTablas(tablasTituladas);
        
        const textoCsv = generarTextoCsvPlanDePago(encabezadoDocumento, tablasConsolidadas);

        return {
            datos: tablasConsolidadas.flatMap(tabla => tabla.datos),
            csv: textoCsv, // Estandarizado a 'csv'
            tablas: tablasConsolidadas
        };
        
    } catch (error) {
        console.error('❌ Error en procesamiento de Plan de Pago:', error);
        return null;
    }
}

// Nueva función para reconstruir la estructura por páginas que este módulo esperaba
function organizarFilasPorPagina(allFilas) {
    // Este especialista tiene una estructura interna compleja que espera los datos
    // organizados por página. Reconstruimos esa estructura.
    // NOTA: Esta función asume que las filas vienen ordenadas por página y luego por Y.
    // El orquestador no garantiza el orden por página, así que esto es una simplificación.
    // Una versión más robusta necesitaría que el orquestador pase el número de página con cada fila.
    const paginasMap = new Map();
    // Como no tenemos número de página, lo tratamos todo como una gran página 1.
    const paginaUnica = {
        numero: 1,
        items: allFilas.flatMap(fila => fila.items),
        itemsPorY: {},
        yKeys: []
    };

    allFilas.forEach(fila => {
        const y = fila.y.toFixed(2);
        if (!paginaUnica.itemsPorY[y]) {
            paginaUnica.itemsPorY[y] = [];
        }
        paginaUnica.itemsPorY[y].push(...fila.items);
    });

    paginaUnica.yKeys = Object.keys(paginaUnica.itemsPorY).sort((a, b) => b - a);
    return [paginaUnica];
}


// ================================
// MÓDULO: EXTRACCIÓN DE CONTENIDO (Simplificado)
// ================================
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
    if (encabezados.length === 0) return -1;
    if (encabezados.length === 1) return 0;

    for (let i = 0; i < encabezados.length; i++) {
        const colActualX = encabezados[i].x;
        if (i === 0) {
            const puntoMedio = (colActualX + encabezados[i + 1].x) / 2;
            if (itemX < puntoMedio) return i;
        } else if (i === encabezados.length - 1) {
            const puntoMedio = (encabezados[i - 1].x + colActualX) / 2;
            if (itemX >= puntoMedio) return i;
        } else {
            const puntoMedioAnterior = (encabezados[i - 1].x + colActualX) / 2;
            const puntoMedioSiguiente = (colActualX + encabezados[i + 1].x) / 2;
            if (itemX >= puntoMedioAnterior && itemX < puntoMedioSiguiente) return i;
        }
    }
    return -1;
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
            if (cuotaKey && conceptoKey && fila[cuotaKey] && typeof fila[cuotaKey] === 'string') {
                const parts = fila[cuotaKey].trim().split(/\s+/);
                if (parts.length > 1 && !isNaN(parts[0])) {
                    const cuotaValue = parts[0];
                    const conceptoValue = parts.slice(1).join(' ');
                    fila[cuotaKey] = cuotaValue;
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

// ================================
// EJECUCIÓN PRINCIPAL Y EXPORTACIÓN
// ================================
if (require.main === module) {
    (async () => {
        console.log('Este script ahora es un especialista y debe ser llamado por el orquestador.');
        console.log('Para probarlo, ejecute el orquestador (extraerTablas_B.js) con la ruta a un PDF de plan de pago.');
    })();
}

module.exports = { procesarPlanDePago, generarTextoCsvPlanDePago };

// ================================
// FIN DEL CÓDIGO
// ================================
