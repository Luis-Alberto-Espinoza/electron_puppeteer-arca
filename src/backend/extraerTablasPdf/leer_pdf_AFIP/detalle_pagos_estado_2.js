const path = require('path');
const fs = require('fs');
const os = require('os');

// NOTA: La importación y configuración de pdfjs-dist se eliminan.

const DEFAULT_OPTIONS = {
    toleranciaY: 5,
    toleranciaXDefinicionEncabezado: 15, // Tolerancia para agrupar textos de un mismo título de encabezado
    inicioTablaStr: 'Cuota', // Usamos una palabra clave más simple que aparecerá en la primera línea del encabezado
};

// Las funciones auxiliares (procesarEncabezadoPDF, etc.) permanecen igual.

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

function extraerNombresDeEncabezadoMultilinea(filaEncabezado1, filaEncabezado2) {
    let columnas = filaEncabezado2.items
        .filter(item => item.str.trim() !== '')
        .map(item => ({ texto: item.str.trim(), x: item.transform[4] }));

    const itemsFila1 = filaEncabezado1.items.filter(item => item.str.trim() !== '');

    itemsFila1.forEach(item => {
        const x = item.transform[4];
        let columnaMasCercana = null;
        let distanciaMinima = Infinity;

        columnas.forEach(col => {
            const dist = Math.abs(x - col.x);
            if (dist < distanciaMinima) {
                distanciaMinima = dist;
                columnaMasCercana = col;
            }
        });

        if (columnaMasCercana) {
            columnaMasCercana.texto = `${item.str.trim()} ${columnaMasCercana.texto}`.trim();
        } else {
            columnas.push({ texto: item.str.trim(), x: x });
        }
    });

    return columnas.sort((a, b) => a.x - b.x).map(col => col.texto);
}

function construirTabla(filasDatos, posicionesColumnas) {
    return filasDatos.map((fila) => {
        const filaTabla = new Array(posicionesColumnas.length).fill('');
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

            filaTabla[indiceColumnaMasCercana] = (filaTabla[indiceColumnaMasCercana] + ' ' + item.str.trim()).trim();
        });
        return { y: fila.y, columnas: filaTabla };
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

// La función principal ahora recibe 'allFilas' del orquestador.
async function procesarPlanDePagoPdf2(allFilas, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const indiceEncabezado1 = allFilas.findIndex(fila => 
        fila.items.some(item => item.str.trim() === opts.inicioTablaStr)
    );

    if (indiceEncabezado1 === -1) {
        throw new Error(`No se pudo encontrar la primera línea del encabezado de la tabla ('${opts.inicioTablaStr}') en el documento.`);
    }

    const filasEncabezadoPDF = allFilas.slice(0, indiceEncabezado1);
    const datosEncabezado = procesarEncabezadoPDF(filasEncabezadoPDF);

    const filaEncabezado1 = allFilas[indiceEncabezado1];
    const filaEncabezado2 = allFilas[indiceEncabezado1 + 1];
    if (!filaEncabezado2) {
        throw new Error("Se encontró la primera línea del encabezado pero no la segunda.");
    }
    const headers = extraerNombresDeEncabezadoMultilinea(filaEncabezado1, filaEncabezado2, opts.toleranciaXDefinicionEncabezado);

    const primeraFilaDeDatos = allFilas[indiceEncabezado1 + 2];
    if (!primeraFilaDeDatos) {
        throw new Error("No se encontró la primera fila de datos para definir las posiciones de las columnas.");
    }
    
    const itemsPrimeraFila = primeraFilaDeDatos.items.filter(item => item.str.trim() !== '');
    const posicionesColumnas = itemsPrimeraFila.map(item => item.transform[4]);

    const filasDeDatosReales = allFilas.slice(indiceEncabezado1 + 2);
    const filasLimpias = filasDeDatosReales.filter(fila => {
        const itemsConTexto = fila.items.filter(item => item.str.trim() !== '');
        if (itemsConTexto.length <= 2) return false;

        let coincidenciasDeEncabezado = 0;
        const textosFila = itemsConTexto.map(i => i.str.trim());

        textosFila.forEach(texto => {
            if (headers.some(h => h.includes(texto))) {
                coincidenciasDeEncabezado++;
            }
        });

        return coincidenciasDeEncabezado < (itemsConTexto.length / 2);
    });

    const tablaFinal = construirTabla(filasLimpias, posicionesColumnas);

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
        console.log('Para probarlo, ejecute el orquestador (extraerTablas_B.js) con la ruta a un PDF de pagos estado 2.');
    })();
}

module.exports = { procesarPlanDePagoPdf2 };