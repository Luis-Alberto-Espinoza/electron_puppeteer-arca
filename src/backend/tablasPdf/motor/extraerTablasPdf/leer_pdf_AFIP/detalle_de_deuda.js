const DEFAULT_OPTIONS = {
    toleranciaY: 5,
    toleranciaX: 15,
    inicioTablaStr: 'Periodo',
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

function construirTabla(filasDatos, posicionesColumnas, headers) {
    return filasDatos.map(fila => {
        const filaObjeto = {};
        headers.forEach(h => filaObjeto[h] = '');

        const itemsConContenido = fila.items.filter(item => item.str.trim() !== '');
        
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
                const headerName = headers[indiceColumnaMasCercana];
                filaObjeto[headerName] = (filaObjeto[headerName] + ' ' + item.str.trim()).trim();
            }
        });

        for (const key in filaObjeto) {
            if (typeof filaObjeto[key] === 'string') {
                filaObjeto[key] = filaObjeto[key].replace(/\$\s*/g, '').trim();
            }
        }

        return filaObjeto;
    });
}

async function procesarDeudaPdf(allFilas, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    const indiceInicioEncabezado = allFilas.findIndex(fila => fila.items.some(item => item.str.trim() === opts.inicioTablaStr));
    if (indiceInicioEncabezado === -1) throw new Error("No se encontró el inicio de la tabla ('Periodo').");

    const filasEncabezadoTabla = allFilas.slice(indiceInicioEncabezado, indiceInicioEncabezado + 1);
    const { headers, posicionesColumnas } = definirColumnasDesdeEncabezado(filasEncabezadoTabla, opts.toleranciaX);

    const filasDeDatosReales = allFilas.slice(indiceInicioEncabezado + 1);

    const filasEncabezadoPDF = allFilas.slice(0, indiceInicioEncabezado);
    const datosEncabezado = procesarEncabezadoPDF(filasEncabezadoPDF);

    const filasLimpias = filasDeDatosReales.filter(fila => {
        const textoFila = fila.items.map(item => item.str).join('');
        if (textoFila.includes('https://') || textoFila.includes('Mis Facilidades')) return false;
        
        const itemsConTexto = fila.items.filter(item => item.str.trim() !== '');
        if (itemsConTexto.length < 2) return false;

        let coincidenciasDeEncabezado = 0;
        const textosItems = itemsConTexto.map(i => i.str.trim());

        textosItems.forEach(texto => {
            if (headers.some(h => h.includes(texto) && texto.length > 2)) {
                coincidenciasDeEncabezado++;
            }
        });
        
        return coincidenciasDeEncabezado < 3;
    });

    const tablaFinal = construirTabla(filasLimpias, posicionesColumnas, headers);

    return {
        datosEncabezado,
        tabla: tablaFinal,
        resumen: { headers, totalRegistros: tablaFinal.length }
    };
}

if (require.main === module) {
    (async () => {
        console.log('Este script ahora es un especialista y debe ser llamado por el orquestador.');
        console.log('Para probarlo, ejecute el orquestador (extraerTablas_B_Manager.js) con la ruta a un PDF de detalle de deuda.');
    })();
}

module.exports = { procesarDeudaPdf };