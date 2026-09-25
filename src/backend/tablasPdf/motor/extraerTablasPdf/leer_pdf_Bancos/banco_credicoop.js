function esMonetario(str) {
    if (typeof str !== 'string') return false;
    // Acepta formatos como 1.234,56 o 1234.56, con o sin signo negativo
    return /^-?\d{1,3}(?:\.\d{3})*(?:,\d{2})$/.test(str.trim()) || /^-?\d+(?:\.\d{2})$/.test(str.trim());
}

function normalizarMonetario(str) {
    if (typeof str !== 'string' || str.trim() === '') return 0; // Return 0 for empty or non-string values
    // Elimina puntos de miles y reemplaza coma decimal por punto
    let numeroNormalizado = str.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(numeroNormalizado);
    return isNaN(parsed) ? 0 : parsed; // Return the number, or 0 if parsing fails
}

// --- DEFINICIÓN DE DISEÑO DE TABLAS PARA CREDICOOP ---
// Basado en el output.json y la estructura de constancia_fiscal.js
const MAPA_DE_DISEÑO_CREDICOOP = {
    columnas: [
        { nombre: "Fecha",       inicioX: 25,  finX: 70 }, // Ajustado para incluir el inicio del primer item
        { nombre: "Comprobante", inicioX: 70,  finX: 105 },
        { nombre: "Descripción", inicioX: 105, finX: 360 }, // Rango amplio para la descripción
        { nombre: "Débito",      inicioX: 360, finX: 450 },
        { nombre: "Crédito",     inicioX: 450, finX: 530 },
        { nombre: "Saldo",       inicioX: 530, finX: 600 } // Hasta el final de la página
    ]
};

function encontrarColumnaPorLayout(itemX, layout) {
    const columna = layout.columnas.find(c => itemX >= c.inicioX && itemX < c.finX);
    return columna ? columna.nombre : null;
}

function convertirFilaAObjeto(lineaItems, layout) {
    const registro = {};
    layout.columnas.forEach(c => registro[c.nombre] = '');

    lineaItems.forEach(item => {
        const colName = encontrarColumnaPorLayout(item.transform[4], layout);
        if (colName && item.str.trim()) {
            registro[colName] = (registro[colName] + ' ' + item.str.trim()).trim();
        }
    });

    // Post-procesamiento y normalización
    for (const key in registro) {
        if (key.toLowerCase().includes('débito') || key.toLowerCase().includes('crédito') || key.toLowerCase().includes('saldo')) {
            registro[key] = normalizarMonetario(registro[key]);
        } else {
            registro[key] = registro[key].trim().replace(/\s+/g, ' '); // Eliminar espacios extra
        }
    }

    return Object.values(registro).some(v => v) ? registro : null;
}

async function procesarBancoCredicoop(allFilas) {
    const registros = [];
    const regexFecha = /^\d{2}\/\d{2}\/\d{2}/;

    const indiceInicioTabla = allFilas.findIndex(fila => 
        fila.items.some(item => item.str.toLowerCase().trim() === 'fecha')
    );

    if (indiceInicioTabla === -1) {
        console.error("[Credicoop] Error: No se encontró el encabezado de la tabla (la palabra 'fecha').");
        return { datos: [] };
    }

    let filasDeDatos = allFilas.slice(indiceInicioTabla + 1);

    // Eliminar la fila de "SALDO ANTERIOR"
    const indiceSaldoAnterior = filasDeDatos.findIndex(fila => 
        fila.items.some(item => item.str.toUpperCase().includes('SALDO ANTERIOR'))
    );

    if (indiceSaldoAnterior !== -1) {
        filasDeDatos.splice(indiceSaldoAnterior, 1);
    }

    let i = 0;
    while (i < filasDeDatos.length) {
        const primerItemEnFila = filasDeDatos[i].items.find(item => item.str.trim() !== '');
        
        // Si la línea no empieza con fecha, la ignoramos (puede ser un pie de página o ruido)
        if (!primerItemEnFila || !regexFecha.test(primerItemEnFila.str.trim())) {
            i++;
            continue;
        }

        const itemsDelRegistro = [...filasDeDatos[i].items];
        let j = i + 1;
        // Agrupar la siguiente línea si no empieza con fecha (parte de la descripción)
        if (j < filasDeDatos.length) {
            const siguientePrimerItem = filasDeDatos[j].items.find(item => item.str.trim() !== '');
            if (!siguientePrimerItem || !regexFecha.test(siguientePrimerItem.str.trim())) {
                itemsDelRegistro.push(...filasDeDatos[j].items);
                i++; // Consumir la siguiente línea
            }
        }
        
        const registroProcesado = convertirFilaAObjeto(itemsDelRegistro, MAPA_DE_DISEÑO_CREDICOOP);
        if (registroProcesado) {
            registros.push(registroProcesado);
        }

        i++;
    }

    return {
        datos: registros,
    };
}

module.exports = { 
    procesarBancoCredicoop
};