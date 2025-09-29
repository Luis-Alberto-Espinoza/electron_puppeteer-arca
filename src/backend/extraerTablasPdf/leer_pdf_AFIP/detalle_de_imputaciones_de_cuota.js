const path = require('path');
const fs = require('fs');
const os = require('os');

const DEFAULT_OPTIONS = {
    toleranciaY: 5,
    toleranciaX: 15,
    inicioTablaStr: 'Cuota',
    footerKeywords: ['https://serviciossegsoc.afip.gob.ar', 'Página'],
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

function definirColumnasDesdeEncabezado(filaEncabezado, toleranciaX) {
    const columnas = new Map();
    const allHeaderItems = filaEncabezado.items.filter(item => item.str.trim() !== '');
    allHeaderItems.forEach(item => {
        const x = item.transform[4];
        let foundKey = [...columnas.keys()].find(key => Math.abs(x - key) <= toleranciaX);
        if (foundKey) {
            const value = columnas.get(foundKey);
            value.textos.push(item.str.trim());
        } else {
            columnas.set(x, { textos: [item.str.trim()], x_coords: [x] });
        }
    });
    const columnasOrdenadas = [...columnas.values()].sort((a, b) => a.x_coords[0] - b.x_coords[0]);
    const headers = columnasOrdenadas.map(value => value.textos.join(' '));
    const posicionesColumnas = columnasOrdenadas.map(value => value.x_coords[0]);
    return { headers, posicionesColumnas };
}

function construirTabla(filasDatos, posicionesColumnas, headers) {
    const registros = [];
    let bloqueRegistroActual = [];

    // 1. Agrupar filas que pertenecen al mismo registro
    filasDatos.forEach(fila => {
        const primerItemConTexto = fila.items.find(item => item.str.trim() !== '');
        const primerTexto = primerItemConTexto ? primerItemConTexto.str.trim() : '';
        
        // Un nuevo registro empieza si el primer texto visible no está vacío y es un número (la cuota)
        if (primerTexto && !isNaN(primerTexto)) {
            if (bloqueRegistroActual.length > 0) {
                registros.push(bloqueRegistroActual);
            }
            bloqueRegistroActual = [];
        }
        bloqueRegistroActual.push(fila.items);
    });
    if (bloqueRegistroActual.length > 0) {
        registros.push(bloqueRegistroActual);
    }

    // 2. Procesar cada bloque de registro para consolidarlo en una sola fila
    const tablaFinal = registros.map(bloque => {
        const filaConsolidada = {};
        headers.forEach(h => filaConsolidada[h] = ''); // Inicializar fila

        const todosLosItems = bloque.flat();

        todosLosItems.forEach(item => {
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
                const headerName = headers[indiceColumnaMasCercana];
                filaConsolidada[headerName] = (filaConsolidada[headerName] + ' ' + item.str.trim()).trim();
            }
        });
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

async function procesarImputacionesDeCuota(allFilas, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const indiceInicioTabla = allFilas.findIndex(fila => fila.items.some(item => item.str.trim() === opts.inicioTablaStr));
    if (indiceInicioTabla === -1) throw new Error(`No se encontró el inicio de la tabla ('${opts.inicioTablaStr}').`);

    const tituloTabla = allFilas[indiceInicioTabla - 1].items.map(item => item.str.trim()).join(' ');
    const filasEncabezadoPDF = allFilas.slice(0, indiceInicioTabla - 1);
    const datosEncabezado = procesarEncabezadoPDF(filasEncabezadoPDF);

    const filaEncabezadoTabla = allFilas[indiceInicioTabla];
    const { headers, posicionesColumnas } = definirColumnasDesdeEncabezado(filaEncabezadoTabla, opts.toleranciaX);

    const filasDeDatosReales = allFilas.slice(indiceInicioTabla + 1);
    const filasLimpias = filasDeDatosReales.filter(fila => {
        const textoFila = fila.items.map(item => item.str).join('');
        return !opts.footerKeywords.some(keyword => textoFila.includes(keyword));
    });

    const tablaFinal = construirTabla(filasLimpias, posicionesColumnas, headers);
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
    })();
}

module.exports = { procesarImputacionesDeCuota };
