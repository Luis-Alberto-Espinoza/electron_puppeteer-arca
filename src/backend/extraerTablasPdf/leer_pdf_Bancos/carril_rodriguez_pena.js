/**
 * Especialista para procesar resúmenes de cuenta del banco "Carril Rodríguez Peña".
 *
 * Diseñado para extraer:
 * 1. Datos clave del encabezado (CUIT, período, etc.).
 * 2. Una tabla de movimientos con columnas de ancho variable.
 *
 * La estrategia se basa en la localización de las cabeceras de la tabla ("FECHA", "DESCRIPCION", etc.)
 * para definir dinámicamente las coordenadas horizontales (rangos en X) de cada columna.
 */

/**
 * Extrae datos clave del encabezado del documento.
 * @param {Array<Object>} allFilas - Todas las filas parseadas del PDF.
 * @returns {Object} Un objeto con los datos del encabezado.
 */
function extraerEncabezado(allFilas) {
    const encabezado = {
        cuit: null,
        periodo: null,
        numeroCuenta: null,
        cliente: null
    };

    // Limitar la búsqueda a las primeras 40 filas para eficiencia
    const filasDeAnalisis = allFilas.slice(0, 40);

    for (const fila of filasDeAnalisis) {
        const textoFila = fila.items.map(item => item.str.trim()).join(' ');

        if (textoFila.includes('C.U.I.T :')) {
            const match = textoFila.match(/C\.U\.I\.T\s*:\s*(\d{11})/);
            if (match && match[1]) {
                encabezado.cuit = match[1];
            }
        }

        if (textoFila.includes('Periodo del Extracto:')) {
            const match = textoFila.match(/Periodo del Extracto:\s*(.*)/);
            if (match && match[1]) {
                encabezado.periodo = match[1].trim();
            }
        }

        if (textoFila.includes('CUENTA CORRIENTE BANCARIA NRO.:')) {
            const match = textoFila.match(/CUENTA CORRIENTE BANCARIA NRO\.:\s*([\d\-]+)/);
            if (match && match[1]) {
                encabezado.numeroCuenta = match[1].trim();
            }
        }
        
        if (textoFila.includes('Sr(es):')) {
            // Intenta capturar el nombre del cliente en la misma línea o en la siguiente
             const match = textoFila.match(/Sr\(es\):\s*(.*)/);
             if (match && match[1] && match[1].trim()){
                encabezado.cliente = match[1].trim();
             }
        }
    }
     // Si el cliente no se encontró en la misma línea de "Sr(es):", búscalo en las siguientes.
    if (!encabezado.cliente) {
        const indiceSr = filasDeAnalisis.findIndex(fila => fila.items.some(item => item.str.includes('Sr(es):')));
        if (indiceSr !== -1 && indiceSr + 1 < filasDeAnalisis.length) {
            // Asumimos que el nombre está en la(s) siguiente(s) línea(s) en una posición x similar
            const xPosSr = filasDeAnalisis[indiceSr].items.find(item => item.str.includes('Sr(es):')).transform[4];
            for (let i = indiceSr + 1; i < indiceSr + 4 && i < filasDeAnalisis.length; i++) {
                const itemCercano = filasDeAnalisis[i].items.find(item => Math.abs(item.transform[4] - xPosSr) < 20);
                if (itemCercano && itemCercano.str.trim()) {
                    encabezado.cliente = itemCercano.str.trim();
                    break;
                }
            }
        }
    }


    return encabezado;
}


/**
 * Define los límites horizontales de cada columna basándose en la posición de sus cabeceras.
 * @param {Array<Object>} allFilas - Todas las filas parseadas del PDF.
 * @returns {{columnas: Object, headerY: number} | null}
 */
function definirEstructuraDeColumnas(allFilas) {
    const cabecerasBuscadas = ['FECHA', 'DESCRIPCION', 'REFERENCIA', 'DEBITOS', 'CREDITOS', 'SALDO'];
    let filaDeCabeceras = null;

    for (const fila of allFilas) {
        const textos = fila.items.map(item => item.str.toUpperCase().trim());
        if (textos.includes('FECHA') && textos.includes('DESCRIPCION')) {
            filaDeCabeceras = fila;
            break;
        }
    }

    if (!filaDeCabeceras) {
        console.error("No se encontró la fila de cabeceras de la tabla.");
        return null;
    }

    const posiciones = {};
    filaDeCabeceras.items.forEach(item => {
        const textoCabecera = item.str.toUpperCase().trim();
        if (cabecerasBuscadas.includes(textoCabecera)) {
            posiciones[textoCabecera] = item.transform[4]; // Coordenada X
        }
    });

    // Definir rangos basados en las posiciones de las cabeceras
    const columnas = {
        Fecha:       { inicio: 0,   fin: 135},
        Descripcion: { inicio: 135, fin: 260},
        Referencia:  { inicio: 260, fin: 271},
        Debitos:     { inicio: 271, fin: 415},
        Creditos:    { inicio: 415, fin: 500},
        Saldo:       { inicio: 500, fin: 1000} // Hasta el final
    };
    
    // Renombrar para coincidir con la salida esperada
    const columnasFinal = {
        Fecha: columnas.Fecha,
        Descripcion: columnas.Descripcion,
        Referencia: columnas.Referencia,
        Debitos: columnas.Debitos,
        Creditos: columnas.Creditos,
        Saldo: columnas.Saldo
    };


    return { columnas: columnasFinal, headerY: filaDeCabeceras.y };
}

/**
 * Procesa las filas de un PDF de resumen de Carril Rodríguez Peña.
 * @param {Array<Object>} allFilas - El contenido del PDF parseado en filas por el manager.
 * @returns {Promise<Object|null>} Un objeto con { datos, csv, encabezado } o null si falla.
 */
async function procesarCarrilRodriguezPena(allFilas) {
    console.log("-> Ejecutando especialista: procesarCarrilRodriguezPena");

    const encabezado = extraerEncabezado(allFilas);
    const estructura = definirEstructuraDeColumnas(allFilas);

    if (!estructura) {
        return null;
    }

    const { columnas, headerY } = estructura;
    const registros = [];

    // Filtrar solo las filas que están debajo de la cabecera
    const filasDeDatos = allFilas.filter(fila => fila.y < headerY);

    for (const fila of filasDeDatos) {
        // Ignorar filas que son claramente parte del pie de página o separadores
        if (fila.y < 100) continue;

        let registroActual = {
            Fecha: '', Descripcion: '', Referencia: '', Debitos: '', Creditos: '', Saldo: ''
        };

        // 1. Poblar el registro basado en la posición de cada item
        for (const item of fila.items) {
            const x = item.transform[4];
            const texto = item.str.trim();
            if (!texto) continue; // Ignorar items vacíos

            for (const nombreColumna in columnas) {
                if (x >= columnas[nombreColumna].inicio && x < columnas[nombreColumna].fin) {
                    registroActual[nombreColumna] += (registroActual[nombreColumna] ? ' ' : '') + texto;
                    break;
                }
            }
        }

        // 2. Post-procesamiento para corregir Fecha y Descripción
        const textoFecha = registroActual.Fecha.trim();
        const matchFecha = textoFecha.match(/^(\d{2}\/\d{2}\/\d{2,4})\s*(.*)$/);

        if (matchFecha) {
            registroActual.Fecha = matchFecha[1]; // Asignar solo la fecha
            const descripcionExtra = matchFecha[2].trim(); // El resto del texto en la columna Fecha

            if (descripcionExtra) {
                // Si había texto extra, ponerlo al inicio de la Descripción
                registroActual.Descripcion = (descripcionExtra + ' ' + registroActual.Descripcion).trim();
            }
        } else if (textoFecha && !/^(\d{2}\/\d{2}\/\d{2,4})$/.test(textoFecha)) {
             // Si el campo Fecha tiene texto pero no es una fecha, moverlo a Descripción
             registroActual.Descripcion = (textoFecha + ' ' + registroActual.Descripcion).trim();
             registroActual.Fecha = '';
        }
        
        // Limpiar y validar el registro antes de agregarlo
        let esFilaVacia = true;
        for(const key in registroActual) {
            registroActual[key] = registroActual[key].trim();
            if(registroActual[key] !== '') esFilaVacia = false;
        }
        if (!esFilaVacia) {
            // Manejo especial para la primera línea que tiene la descripción y el saldo inicial
            if (registroActual.Descripcion.toUpperCase().includes('SALDO ULTIMO EXTRACTO')) {
                registroActual.Fecha = '';
            }
            registros.push(registroActual);
        }
    }

    if (registros.length === 0) {
        return null;
    }

    // Generar el CSV
    const cabecerasCsv = Object.keys(registros[0]);
    const filasCsv = [cabecerasCsv.join(',')];
    registros.forEach(registro => {
        const fila = cabecerasCsv.map(cabecera => {
            let valor = String(registro[cabecera] || '');
            // Escapar comillas dobles dentro del valor para el formato CSV
            valor = valor.replace(/"/g, '""');

            // Si es la columna 'Descripcion', anteponemos una comilla simple
            if (cabecera === 'Descripcion') {
                valor = `'${valor}`; 
            }
            return `"${valor}"`;
        });
        filasCsv.push(fila.join(','));
    });

    return {
        datos: registros,
        csv: filasCsv.join('\n'),
        encabezado: encabezado
    };
}

module.exports = {
    procesarCarrilRodriguezPena
};
