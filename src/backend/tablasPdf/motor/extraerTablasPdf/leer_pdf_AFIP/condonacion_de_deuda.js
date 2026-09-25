/**
 * Este módulo se encarga de procesar el PDF de "Condonación de deudas",
 * extrayendo tanto los datos generales como la tabla de deudas para su
 * posterior conversión a un archivo Excel con múltiples hojas.
 */

// Layout predefinido para las columnas de la tabla de deudas.
// Basado en las coordenadas proporcionadas por el usuario.
const layout = {
    columns: [
        { name: 'Año', start: 58, end: 82 },
        { name: 'Mes', start: 82, end: 107 },
        { name: 'Anticipo', start: 107, end: 156 },
        { name: 'Establec.', start: 156, end: 193 },
        { name: 'Impuesto', start: 193, end: 284 },
        { name: 'Concepto', start: 284, end: 355 },
        { name: 'Subconcepto', start: 355, end: 425 },
        { name: 'Vencimiento', start: 425, end: 475 },
        { name: 'Importe', start: 475, end: 600 } // Fin extendido para capturar todo
    ]
};

const DEFAULT_OPTIONS = {
    inicioTablaStr: 'Año',
    finTablaStr: 'Totales',
};

/**
 * Une el texto de items que están espaciados, como "D E C L A R A C I Ó N".
 * @param {string} texto - El texto a normalizar.
 * @returns {string} El texto normalizado.
 */
function normalizarTextoEspaciado(texto) {
    if (texto.length > 1 && texto.includes(' ')) {
        return texto.replace(/\s/g, '');
    }
    return texto;
}

/**
 * Procesa las filas de metadatos (cabecera y pie) para extraer pares clave-valor.
 * @param {Array} filas - Las filas que contienen los metadatos.
 * @returns {Array} Un array de objetos, donde cada objeto representa una fila de datos.
 */
function procesarMetadatos(filas) {
    const datos = [];
    filas.forEach(fila => {
        const textoFila = fila.items.map(item => item.str.trim()).join(' ');
        if (!textoFila) return;

        const match = textoFila.match(/(.+?):\s*(.*)/);
        if (match) {
            const clave = match[1].trim();
            const valor = match[2].trim();
            datos.push({ 'Clave': clave, 'Valor': valor });
        } else {
            datos.push({ 'Información': textoFila });
        }
    });
    return datos;
}

/**
 * Construye la tabla de deudas usando un layout predefinido.
 * @param {Array} filasDatos - Las filas que pertenecen a la tabla.
 * @returns {Array} Un array de objetos, donde cada objeto es una fila de la tabla.
 */
function construirTabla(filasDatos) {
    const headers = layout.columns.map(c => c.name);
    
    return filasDatos.map(fila => {
        const filaObjeto = {};
        headers.forEach(h => filaObjeto[h] = '');

        const itemsConContenido = fila.items.filter(item => item.str.trim() !== '');

        itemsConContenido.forEach(item => {
            const x = item.transform[4];
            let textoItem = normalizarTextoEspaciado(item.str.trim());
            if (textoItem === '—') textoItem = '';

            const columnaAsignada = layout.columns.find(col => x >= col.start && x < col.end);

            if (columnaAsignada) {
                if (columnaAsignada.name === 'Importe') {
                    textoItem = textoItem.replace(/\$/g, '').trim();
                }
                filaObjeto[columnaAsignada.name] = (filaObjeto[columnaAsignada.name] + ' ' + textoItem).trim();
            }
        });
        return filaObjeto;
    });
}


async function procesarCondonacionDeDeuda(allFilas, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // 1. Localizar los límites de la tabla
    const indiceInicioTabla = allFilas.findIndex(fila =>
        fila.items.some(item => item.str.trim() === opts.inicioTablaStr)
    );

    if (indiceInicioTabla === -1) {
        throw new Error("No se pudo encontrar el inicio de la tabla de deudas (buscando 'Año').");
    }

    const indiceFinTabla = allFilas.findIndex(fila =>
        fila.items.some(item => item.str.trim().startsWith(opts.finTablaStr))
    );

    // 2. Aislar y procesar el pie de página PRIMERO
    let datosFooter = [];
    let filasSinFooter = allFilas;

    if (indiceFinTabla !== -1) {
        const filasFooter = allFilas.slice(indiceFinTabla);
        datosFooter = procesarMetadatos(filasFooter);
        // Nos quedamos solo con las filas de la cabecera y la tabla
        filasSinFooter = allFilas.slice(0, indiceFinTabla);
    }

    // 3. Procesar la cabecera (usando el array ya filtrado)
    const filasCabecera = filasSinFooter.slice(0, indiceInicioTabla);
    const datosGenerales = procesarMetadatos(filasCabecera);
    
    // Unir los datos de cabecera y pie para la primera hoja
    datosGenerales.push(...datosFooter);

    // 4. Procesar la Tabla Principal
    const filasDeDatosReales = filasSinFooter.slice(indiceInicioTabla + 1);
    
    // Filtro para asegurar que solo procesamos filas que parecen ser datos de tabla válidos
    const filasDeTablaValidas = filasDeDatosReales.filter(fila => {
        const primerItem = fila.items.find(item => item.str.trim() !== '');
        if (!primerItem) return false;
        // Una fila de datos válida en esta tabla debe comenzar con un año (4 dígitos).
        return /^\d{4}$/.test(primerItem.str.trim());
    });

    const tablaFinal = construirTabla(filasDeTablaValidas);

    // 5. Estructurar la salida para múltiples hojas
    return {
        tablas: [
            {
                titulo: 'Datos Generales',
                datos: datosGenerales
            },
            {
                titulo: 'Detalle de Deuda Condonada',
                datos: tablaFinal
            }
        ]
    };
}

module.exports = { procesarCondonacionDeDeuda };
