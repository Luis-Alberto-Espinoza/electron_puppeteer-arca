const path = require('path');
const fs = require('fs');
const os = require('os');

const DEFAULT_OPTIONS = {
    toleranciaY: 5,
    toleranciaXDefinicionEncabezado: 10, // Reducido para mayor precisión en multi-línea
    inicioTablaStr: 'Detalle', // Palabra clave en la segunda línea del encabezado
    footerKeywords: ['serviciossegsoc.afip.gob.ar'],
    headerKeywords: ['Mis Facilidades'],
};

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

// NUEVA FUNCIÓN para manejar encabezados multi-línea
function extraerNombresDeEncabezadoMultilinea(filaEncabezado1, filaEncabezado2, toleranciaX) {
    const allHeaderItems = [...filaEncabezado1.items, ...filaEncabezado2.items].filter(item => item.str.trim() !== '');
    const columnas = new Map();

    allHeaderItems.forEach(item => {
        const x = item.transform[4];
        let foundKey = [...columnas.keys()].find(key => Math.abs(x - key) <= toleranciaX);
        if (foundKey) {
            columnas.get(foundKey).push(item);
        } else {
            columnas.set(x, [item]);
        }
    });

    const columnasOrdenadas = [...columnas.values()].sort((a, b) => a[0].transform[4] - b[0].transform[4]);
    
    const headers = columnasOrdenadas.map(items => {
        // Ordenar por 'y' descendente para que el texto de arriba venga primero
        return items.sort((a, b) => b.transform[5] - a.transform[5]).map(i => i.str.trim()).join(' ');
    });

    const posicionesColumnas = columnasOrdenadas.map(items => items[0].transform[4]);

    return { headers, posicionesColumnas };
}

function construirTabla(filasDatos, posicionesColumnas, headers) {
    const registros = [];
    let bloqueRegistroActual = [];
    
    const detalleColumnIndex = headers.findIndex(h => h.toLowerCase() === 'detalle');
    if (detalleColumnIndex === -1) throw new Error("No se encontró la columna 'Detalle' en los encabezados.");
    
    const detalleColumnX = posicionesColumnas[detalleColumnIndex];
    const toleranciaXSimple = 15;

    filasDatos.forEach(fila => {
        const esNuevoRegistro = fila.items.some(item => 
            Math.abs(item.transform[4] - detalleColumnX) < toleranciaXSimple && item.str.trim() !== ''
        );

        if (esNuevoRegistro && bloqueRegistroActual.length > 0) {
            registros.push(bloqueRegistroActual);
            bloqueRegistroActual = [];
        }
        bloqueRegistroActual.push(fila.items);
    });
    if (bloqueRegistroActual.length > 0) {
        registros.push(bloqueRegistroActual);
    }

    const tablaFinal = registros.map(bloque => {
        const filaConsolidada = {};
        headers.forEach(h => filaConsolidada[h] = '');
        const todosLosItems = bloque.flat();

        todosLosItems.forEach(item => {
            const x = item.transform[4];
            let columnIndex = -1;

            // Encontrar en qué "zona" o "carril" de columna cae el item
            for (let i = 0; i < posicionesColumnas.length; i++) {
                const colStart = posicionesColumnas[i];
                // El final de la zona es el inicio de la siguiente columna, o infinito si es la última
                const colEnd = (i + 1 < posicionesColumnas.length) ? posicionesColumnas[i + 1] : Infinity;

                if (x >= colStart && x < colEnd) {
                    columnIndex = i;
                    break;
                }
            }

            // Si un item está ligeramente a la izquierda de la primera columna, asignarlo a ella
            if (columnIndex === -1 && x < posicionesColumnas[0]) {
                columnIndex = 0;
            }

            if (columnIndex !== -1) {
                const headerName = headers[columnIndex];
                filaConsolidada[headerName] = (filaConsolidada[headerName] + ' ' + item.str.trim()).trim();
            }
        });
        
        const ultimoHeader = headers[headers.length - 1];
        if (ultimoHeader && filaConsolidada[ultimoHeader]) {
            filaConsolidada[ultimoHeader] = filaConsolidada[ultimoHeader].replace(/\$\s*/g, '').trim();
        }
        return filaConsolidada;
    });
    return tablaFinal;
}

function convertirACsv(tabla, headers) {
    const filasCsv = [];
    if (headers && headers.length > 0) {
        filasCsv.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
    }
    tabla.forEach(filaObjeto => {
        const fila = headers.map(header => {
            const valor = filaObjeto[header] || '';
            return `"${String(valor).replace(/"/g, '""')}"`;
        });
        filasCsv.push(fila.join(','));
    });
    return filasCsv.join(os.EOL);
}

async function procesarDeudaImpagaPdf(allFilas, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Identificar y filtrar las filas de cabecera y pie de página por su contenido
    const filasFiltradas = allFilas.filter(fila => {
        const textoFila = fila.items.map(item => item.str).join('');
        if (opts.footerKeywords.some(k => textoFila.includes(k))) return false;
        if (opts.headerKeywords.some(k => textoFila.includes(k))) return false;
        return true;
    });

    const indiceSegundaLineaEncabezado = filasFiltradas.findIndex(fila => 
        fila.items.some(item => item.str.trim() === opts.inicioTablaStr)
    );

    if (indiceSegundaLineaEncabezado === -1 || indiceSegundaLineaEncabezado === 0) {
        throw new Error(`No se pudo encontrar el encabezado de la tabla ('${opts.inicioTablaStr}') o está en una posición inesperada.`);
    }

    const filasEncabezadoPDF = filasFiltradas.slice(0, indiceSegundaLineaEncabezado - 1);
    const datosEncabezado = procesarEncabezadoPDF(filasEncabezadoPDF);

    const filaEncabezado1 = filasFiltradas[indiceSegundaLineaEncabezado - 1];
    const filaEncabezado2 = filasFiltradas[indiceSegundaLineaEncabezado];
    const { headers, posicionesColumnas } = extraerNombresDeEncabezadoMultilinea(filaEncabezado1, filaEncabezado2, opts.toleranciaXDefinicionEncabezado);

    const filasDeDatosReales = filasFiltradas.slice(indiceSegundaLineaEncabezado + 1);
    
    const filasLimpias = filasDeDatosReales.filter(fila => {
        const textoFila = fila.items.map(item => item.str).join('');
        if (opts.footerKeywords.some(k => textoFila.includes(k))) return false;
        if (opts.headerKeywords.some(k => textoFila.includes(k))) return false;

        const itemsConTexto = fila.items.map(item => item.str.trim());
        if (itemsConTexto.length === 0) return false;

        // Lógica mejorada para detectar encabezados repetidos (multi-línea)
        let coincidencias = 0;
        // Se toman todas las palabras de los encabezados completos (ej: "Saldo a Cancelar($)")
        const todasLasPalabrasDeEncabezado = headers.flatMap(h => h.split(' '));
        
        itemsConTexto.forEach(textoItem => {
            if (todasLasPalabrasDeEncabezado.includes(textoItem)) {
                coincidencias++;
            }
        });

        // Si una fila tiene 3 o más palabras que también están en los encabezados,
        // es muy probable que sea un encabezado repetido y se descarta.
        if (coincidencias >= 3) {
            return false;
        }

        return true;
    });

    const tablaFinal = construirTabla(filasLimpias, posicionesColumnas, headers);

    return {
        encabezado: datosEncabezado,
        tabla: tablaFinal,
        csv: convertirACsv(tablaFinal, headers),
        headers: headers,
    };
}

if (require.main === module) {
    (async () => {
        console.log('Este script ahora es un especialista y debe ser llamado por el orquestador.');
    })();
}

module.exports = { procesarDeudaImpagaPdf };