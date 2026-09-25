const DEFAULT_OPTIONS = {
    toleranciaY: 5,
    toleranciaXDefinicionEncabezado: 15, // Tolerancia solo para agrupar textos de un mismo título de encabezado
    inicioTablaStr: 'Cuota N°',
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

function extraerNombresDeEncabezado(filaEncabezado, toleranciaX) {
    const headers = [];
    const posiciones = [];
    const itemsConTexto = filaEncabezado.items.filter(item => item.str.trim() !== '');

    itemsConTexto.forEach(item => {
        const x = item.transform[4];
        let found = false;
        for (let i = 0; i < posiciones.length; i++) {
            if (Math.abs(x - posiciones[i]) <= toleranciaX) {
                headers[i] = (headers[i] + ' ' + item.str.trim()).trim();
                found = true;
                break;
            }
        }
        if (!found) {
            posiciones.push(x);
            headers.push(item.str.trim());
        }
    });
    return headers;
}

function construirTabla(filasDatos, posicionesColumnas, headers) {
    return filasDatos.map((fila) => {
        const filaObjeto = {};
        headers.forEach(h => filaObjeto[h] = '');

        const itemsConContenido = fila.items.filter(item => item.str.trim() !== '');

        itemsConContenido.forEach(item => {
            const x = item.transform[4];
            let indiceColumnaMasCercana = 0;
            let distanciaMinima = Infinity;

            posicionesColumnas.forEach((posCol, i) => {
                const dist = Math.abs(x - posCol);
                if (dist < distanciaMinima) {
                    distanciaMinima = dist;
                    indiceColumnaMasCercana = i;
                }
            });

            const headerName = headers[indiceColumnaMasCercana];
            filaObjeto[headerName] = (filaObjeto[headerName] + ' ' + item.str.trim()).trim();
        });

        for (const key in filaObjeto) {
            if (typeof filaObjeto[key] === 'string') {
                filaObjeto[key] = filaObjeto[key].replace(/\$\s*/g, '').trim();
            }
        }

        return filaObjeto;
    });
}

async function procesarPlanDePagoPdf(allFilas, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    const indiceEncabezadoTabla = allFilas.findIndex(fila => 
        fila.items.some(item => item.str.includes(opts.inicioTablaStr))
    );

    if (indiceEncabezadoTabla === -1) {
        throw new Error("No se pudo encontrar el encabezado de la tabla ('Cuota N°') en el documento.");
    }

    const filasEncabezadoPDF = allFilas.slice(0, indiceEncabezadoTabla);
    const datosEncabezado = procesarEncabezadoPDF(filasEncabezadoPDF);

    const filaEncabezadoTabla = allFilas[indiceEncabezadoTabla];
    const headers = extraerNombresDeEncabezado(filaEncabezadoTabla, opts.toleranciaXDefinicionEncabezado);

    const primeraFilaDeDatos = allFilas[indiceEncabezadoTabla + 1];
    if (!primeraFilaDeDatos) {
        throw new Error("No se encontró la primera fila de datos para definir las posiciones de las columnas.");
    }

    const itemsPrimeraFila = primeraFilaDeDatos.items.filter(item => item.str.trim() !== '');
    const posicionesColumnas = itemsPrimeraFila.map(item => item.transform[4]);

    if (posicionesColumnas.length === 0) {
        throw new Error("No se pudieron determinar las posiciones de las columnas desde la primera fila de datos.");
    }

    const filasDeDatosReales = allFilas.slice(indiceEncabezadoTabla + 1);
    const filasLimpias = filasDeDatosReales.filter(fila => {
        const itemsConTexto = fila.items.filter(item => item.str.trim() !== '');
        const esEncabezadoRepetido = itemsConTexto.some(item => item.str.includes('Cuota N°'));
        return itemsConTexto.length > 3 && !esEncabezadoRepetido;
    });

    const tablaFinal = construirTabla(filasLimpias, posicionesColumnas, headers);

    return {
        encabezado: datosEncabezado,
        tabla: tablaFinal,
        headers: headers,
    };
}

if (require.main === module) {
    (async () => {
        console.log('Este script ahora es un especialista y debe ser llamado por el orquestador.');
        console.log('Para probarlo, ejecute el orquestador (extraerTablas_B_Manager.js) con la ruta a un PDF de plan de pago tipo 1.');
    })();
}

module.exports = { procesarPlanDePagoPdf };
