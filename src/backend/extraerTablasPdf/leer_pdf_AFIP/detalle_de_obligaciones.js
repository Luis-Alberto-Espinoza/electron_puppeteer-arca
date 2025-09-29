const path = require('path');
const fs = require('fs');
const os = require('os');

// NOTA: La importación y configuración de pdfjs-dist se eliminan.

const DEFAULT_OPTIONS = {
    toleranciaY: 5,
    toleranciaX: 15,
    inicioTablaTitleStr: 'Detalle de Obligaciones Regularizadas',
    inicioTablaHeadersStr: 'Año',
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
                filaTabla[columnIndex] = (filaTabla[columnIndex] + ' ' + item.str.trim()).trim();
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

async function procesarObligacionesPdf(allFilas, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

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
        console.log('Este script ahora es un especialista y debe ser llamado por el orquestador.');
        console.log('Para probarlo, ejecute el orquestador (extraerTablas_B_Manager.js) con la ruta a un PDF de obligaciones.');
    })();
}

module.exports = { procesarObligacionesPdf };
