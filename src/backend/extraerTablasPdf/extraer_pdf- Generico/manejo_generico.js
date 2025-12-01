/**
 * @file Módulo para la extracción de tablas de PDFs de manera genérica,
 * basándose en selecciones (coordenadas) proporcionadas por el usuario.
 *
 * @exports procesarPdfGenerico - Función principal que orquesta la extracción.
 */

/**
 * Define los límites horizontales de cada columna basándose en la selección del encabezado.
 * @param {Array<Object>} allFilas - Todas las filas parseadas del PDF.
 * @param {Object} headerSelection - Coordenadas {x, y, width, height} del área del encabezado.
 * @returns {Array<Object>|null} Un array de objetos, donde cada objeto representa una columna
 * con su nombre, y sus coordenadas de inicio y fin. O null si no se encuentran cabeceras.
 */
function definirColumnasDesdeSeleccion(allFilas, headerSelection) {
    const cabecerasEncontradas = [];

    // Encuentra los items de texto que caen dentro del rectángulo de selección del header
    for (const fila of allFilas) {
        // Comprobar si la fila está verticalmente dentro de la selección
        if (fila.y >= headerSelection.y && fila.y <= headerSelection.y + headerSelection.height) {
            for (const item of fila.items) {
                const itemX = item.transform[4];
                // Comprobar si el item está horizontalmente dentro de la selección
                if (itemX >= headerSelection.x && itemX <= headerSelection.x + headerSelection.width) {
                    cabecerasEncontradas.push({
                        texto: item.str.trim(),
                        x: itemX
                    });
                }
            }
        }
    }

    if (cabecerasEncontradas.length === 0) {
        console.error("No se encontró texto en el área de encabezado seleccionada.");
        return null;
    }

    // Ordenar las cabeceras por su posición horizontal
    cabecerasEncontradas.sort((a, b) => a.x - b.x);

    const columnas = cabecerasEncontradas.map((cabecera, index) => {
        const inicio = cabecera.x - 5; // Un pequeño margen a la izquierda
        let fin;
        if (index < cabecerasEncontradas.length - 1) {
            fin = cabecerasEncontradas[index + 1].x - 5; // Termina donde empieza la siguiente
        } else {
            fin = 1000; // La última columna se extiende hasta el final
        }
        return {
            nombre: cabecera.texto,
            inicio: inicio,
            fin: fin
        };
    });

    return columnas;
}


/**
 * Procesa un PDF utilizando selecciones manuales del usuario para extraer una tabla.
 * @param {Array<Object>} allFilas - El contenido del PDF parseado en filas.
 * @param {Object} selecciones - Un objeto con las coordenadas de las áreas seleccionadas.
 *   Ej: { header: {x,y,width,height}, firstRow: {y}, lastRow: {y} }
 * @returns {Promise<Object|null>} Un objeto con { datos, csv } o null si falla.
 */
async function procesarPdfGenerico(allFilas, selecciones) {
    console.log("-> Ejecutando procesador genérico interactivo");
    console.log("[generico.js] Selecciones recibidas:", JSON.stringify(selecciones, null, 2));

    const columnas = definirColumnasDesdeSeleccion(allFilas, selecciones.header);
    if (!columnas || columnas.length === 0) {
        return null;
    }

    const registros = []; // <-- LÍNEA REINTRODUCIDA
    const yInicio = selecciones.firstRow.y + selecciones.firstRow.height; // Debajo de la primera fila
    const yFin = selecciones.lastRow.y; // Encima de la última fila
    console.log(`[generico.js] Calculando área de datos vertical: yInicio=${yInicio}, yFin=${yFin}`);
    console.log(`[generico.js] Total de filas en el PDF: ${allFilas.length}`);
    if (allFilas.length > 0) {
        console.log(`[generico.js] Coordenadas Y de las primeras filas: ${allFilas.slice(0, 5).map(f => f.y).join(', ')}`);
    }

    // Filtrar solo las filas que están dentro del área de datos vertical (LÓGICA CORREGIDA)
    const filasDeDatos = allFilas.filter(fila => fila.y > yInicio && fila.y < yFin);
    console.log(`[generico.js] Filas encontradas dentro del área de datos: ${filasDeDatos.length}`);

    for (const fila of filasDeDatos) {
        let registroActual = {};
        columnas.forEach(col => registroActual[col.nombre] = '');

        for (const item of fila.items) {
            const x = item.transform[4];
            const texto = item.str.trim();
            if (!texto) continue;

            for (const col of columnas) {
                if (x >= col.inicio && x < col.fin) {
                    registroActual[col.nombre] += (registroActual[col.nombre] ? ' ' : '') + texto;
                    break;
                }
            }
        }
        
        // Añadir el registro si no está completamente vacío
        if (Object.values(registroActual).some(val => val !== '')) {
            registros.push(registroActual);
        }
    }

    if (registros.length === 0) {
        console.warn("No se encontraron registros en el área de datos seleccionada.");
        return null;
    }

    // --- Generación de CSV ---
    const cabecerasCsv = columnas.map(c => c.nombre);
    const filasCsv = [cabecerasCsv.join(',')];
    
    registros.forEach(registro => {
        const fila = cabecerasCsv.map(cabecera => {
            let valor = String(registro[cabecera] || '');
            valor = valor.replace(/"/g, '""'); // Escapar comillas dobles
            return `"${valor}"`;
        });
        filasCsv.push(fila.join(','));
    });

    return {
        datos: registros,
        csv: filasCsv.join('\n'),
        encabezado: {} // No extraemos un encabezado estructurado en este modo
    };
}

module.exports = {
    procesarPdfGenerico
};
