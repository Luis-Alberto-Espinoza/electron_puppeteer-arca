//lee el numero 2
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Configuración de PDF.js
const basePath = path.join(__dirname, '../../../node_modules/pdfjs-dist');
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(basePath, 'build/pdf.worker.js');
pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = path.join(basePath, 'standard_fonts/');

const DEFAULT_OPTIONS = {
    toleranciaY: 5,
    toleranciaX: 15,
    inicioTablaTitleStr: 'Detalle de Obligaciones Regularizadas - Obligaciones Impositivas',
    inicioTablaHeadersStr: 'Año',
};

function agruparItemsPorFilas(items, toleranciaY) {
    const filasMap = new Map();
    items.forEach(item => {
        const y = item.transform[5];
        const yExistente = [...filasMap.keys()].find(key => Math.abs(y - key) <= toleranciaY);
        if (yExistente) {
            filasMap.get(yExistente).push(item);
        } else {
            filasMap.set(y, [item]);
        }
    });
    return [...filasMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([y, filaItems]) => ({ y, items: filaItems.sort((a, b) => a.transform[4] - b.transform[4]) }));
}

function procesarEncabezadoPDF(filasEncabezado) {
    const datosEncabezado = {};
    filasEncabezado.forEach(fila => {
        const itemsConTexto = fila.items.filter(item => item.str.trim() !== '');
        itemsConTexto.forEach((item, index) => {
            const texto = item.str.trim();
            if (texto.endsWith(':')) {
                const label = texto.slice(0, -1).replace(/\s+/g, '_').toLowerCase();
                if (itemsConTexto[index + 1]) {
                    datosEncabezado[label] = itemsConTexto[index + 1].str.trim();
                }
            }
        });
    });
    return datosEncabezado;
}

function definirColumnasDesdeEncabezado(filasEncabezado, toleranciaX) {
    const columnas = new Map();
    const allHeaderItems = filasEncabezado.flatMap(fila => fila.items.filter(item => item.str.trim() !== ''));
    allHeaderItems.forEach(item => {
        const x = item.transform[4];
        let foundKey = [...columnas.keys()].find(key => Math.abs(x - key) <= toleranciaX);
        if (foundKey) {
            const value = columnas.get(foundKey);
            value.textos.push(item.str.trim());
            value.x_coords.push(x);
        } else {
            columnas.set(x, { textos: [item.str.trim()], x_coords: [x] });
        }
    });
    const columnasOrdenadas = [...columnas.values()].sort((a, b) => a.x_coords[0] - b.x_coords[0]);
    const headers = columnasOrdenadas.map(value => value.textos.join(' '));
    const posicionesColumnas = columnasOrdenadas.map(value => value.x_coords.reduce((a, b) => a + b, 0) / value.x_coords.length);
    return { headers, posicionesColumnas };
}

function construirTabla(filasDatos, posicionesColumnas) {
    const registros = [];
    let registroActualItems = [];
    filasDatos.forEach(fila => {
        const primerItemConTexto = fila.items.find(item => item.str.trim() !== '');
        const primerTexto = primerItemConTexto ? primerItemConTexto.str.trim() : '';
        const esNuevoRegistro = /^\d{4}$/.test(primerTexto);
        if (esNuevoRegistro && registroActualItems.length > 0) {
            registros.push(registroActualItems);
            registroActualItems = [];
        }
        registroActualItems.push(...fila.items);
    });
    if (registroActualItems.length > 0) {
        registros.push(registroActualItems);
    }
    return registros.map(registroItems => {
        const filaTabla = new Array(posicionesColumnas.length).fill('');
        const itemsConContenido = registroItems.filter(item => item.str.trim() !== '');
        itemsConContenido.forEach(item => {
            const x = item.transform[4];
            let indiceColumnaMasCercana = -1;
            let distanciaMinima = Infinity;
            posicionesColumnas.forEach((posCol, i) => {
                const dist = Math.abs(x - posCol);
                if (dist < distanciaMinima) {
                    distanciaMinima = dist;
                    indiceColumnaMasCercana = i;
                }
            });
            if (indiceColumnaMasCercana !== -1) {
                filaTabla[indiceColumnaMasCercana] = (filaTabla[indiceColumnaMasCercana] + ' ' + item.str.trim()).trim();
            }
        });
        return { columnas: filaTabla };
    });
}

function convertirACsv(tabla, headers) {
    const filasCsv = [];
    if (headers && headers.length > 0) {
        filasCsv.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
    }
    tabla.forEach(fila => {
        const columnasCsv = fila.columnas.map(celda => `"${String(celda).replace(/"/g, '""')}"`); 
        filasCsv.push(columnasCsv.join(','));
    });
    return filasCsv.join(os.EOL);
}

async function procesarObligacionesPdf(filePath, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    if (!fs.existsSync(filePath)) throw new Error(`Archivo no encontrado: ${filePath}`);

    const loadingTask = pdfjsLib.getDocument(filePath);
    const pdf = await loadingTask.promise;
    
    let allFilas = [];
    for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
        const page = await pdf.getPage(numPagina);
        const content = await page.getTextContent();
        const filasDePagina = agruparItemsPorFilas(content.items, opts.toleranciaY);
        allFilas.push(...filasDePagina);
    }

    const indiceTituloTabla = allFilas.findIndex(fila => fila.items.some(item => item.str.includes(opts.inicioTablaTitleStr)));
    if (indiceTituloTabla === -1) throw new Error("No se encontró el título de la tabla.");

    const indiceInicioEncabezadoTabla = allFilas.findIndex(fila => fila.items.some(item => item.str.trim() === opts.inicioTablaHeadersStr));
    if (indiceInicioEncabezadoTabla === -1) throw new Error("No se encontró el encabezado de la tabla.");

    const filasEncabezadoPDF = allFilas.slice(0, indiceTituloTabla);
    const datosEncabezado = procesarEncabezadoPDF(filasEncabezadoPDF);

    const tituloTabla = allFilas[indiceTituloTabla].items.map(item => item.str.trim()).join(' ');

    const filasEncabezadoTabla = allFilas.slice(indiceInicioEncabezadoTabla, indiceInicioEncabezadoTabla + 1);
    const { headers, posicionesColumnas } = definirColumnasDesdeEncabezado(filasEncabezadoTabla, opts.toleranciaX);

    const filasDeDatosReales = allFilas.slice(indiceInicioEncabezadoTabla + 1);
    const filasLimpias = filasDeDatosReales.filter(fila => {
        const textoFila = fila.items.map(item => item.str).join('');
        if (textoFila.includes('https://') || textoFila.includes('Mis Facilidades')) return false;
        const itemsConTexto = fila.items.filter(item => item.str.trim() !== '');
        let coincidenciasDeEncabezado = 0;
        const textosItems = itemsConTexto.map(i => i.str.trim());
        textosItems.forEach(texto => {
            if (headers.some(h => h.includes(texto) && texto.length > 2)) {
                coincidenciasDeEncabezado++;
            }
        });
        return coincidenciasDeEncabezado < 3;
    });

    const tablaFinal = construirTabla(filasLimpias, posicionesColumnas);
    const csvContent = convertirACsv(tablaFinal, headers);

    return {
        datosEncabezado,
        tituloTabla,
        tabla: tablaFinal,
        csv: csvContent,
        resumen: { headers, totalRegistros: tablaFinal.length }
    };
}

if (require.main === module) {
    (async () => {
        const filePathArg = process.argv[2];
        if (!filePathArg) {
            console.error("Por favor, proporciona la ruta a un archivo PDF como argumento.");
            return;
        }
        const filePath = path.resolve(filePathArg);
        console.log(`📄 Procesando archivo PDF: ${filePath}`);

        try {
            const resultado = await procesarObligacionesPdf(filePath);
            const cuit = resultado.datosEncabezado.cuit || 'SIN_CUIT';
            const csvFilename = `Detalle_de_Obligaciones_${cuit}.csv`;
            const csvPath = path.join(__dirname, csvFilename);
            fs.writeFileSync(csvPath, resultado.csv, 'utf8');
            console.log(`✓ CSV guardado: ${csvPath}`);

            console.log(`🎉 PROCESO COMPLETADO`);
            console.log(`--- Datos del Encabezado ---`);
            console.log(resultado.datosEncabezado);
            console.log(`--- Título de la Tabla ---`);
            console.log(resultado.tituloTabla);
            console.log(`--- Resumen de la Tabla ---`);
            console.log(`Detectados ${resultado.resumen.headers.length} encabezados: ${resultado.resumen.headers.join(' | ')}`);
            console.log(`📊 Total de registros procesados: ${resultado.resumen.totalRegistros}`);

        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            console.error(error.stack);
        }
    })();
}

module.exports = { procesarObligacionesPdf };
