const path = require('path');
const fs = require('fs');

// NOTA: La importación y configuración de pdfjs-dist se eliminan de este archivo.
// El parseo del PDF ahora lo realiza el orquestador 'extraerTablas_B.js'.

// --- CONFIGURACIÓN Y PALABRAS CLAVE ---
const CONFIG = {
    palabrasClaveTablas: ["DEUDA IMPUESTO AUTOMOTOR", "DEUDA INGRESOS BRUTOS", "IMPUESTOS AGENTES DE RETENCIÓN / PERCEPCIÓN"],
    PALABRAS_CLAVE_FOOTER: ['Página', 'Versión'],
};

// --- DEFINICIÓN DE DISEÑO DE TABLAS ---
const MAPA_DE_DISEÑO = {
    "DEUDA IMPUESTO AUTOMOTOR": {
        columnas: [
            { nombre: "Dominio",            inicioX: 0,   finX: 95 },
            { nombre: "Periodo",            inicioX: 95,  finX: 125 },
            { nombre: "Cuota",              inicioX: 125, finX: 190 },
            { nombre: "Fecha Vencimiento",  inicioX: 190, finX: 250 },
            { nombre: "Estado",             inicioX: 250, finX: 380 },
            { nombre: "Importe Original",   inicioX: 380, finX: 450 },
            { nombre: "Saldo",              inicioX: 450, finX: 510 },
            { nombre: "Saldo Actualizado",  inicioX: 510, finX: 600 }
        ]
    },
    "DEUDA INGRESOS BRUTOS": {
        columnas: [
            { nombre: "Periodo",            inicioX: 0,   finX: 80 },
            { nombre: "Cuota",              inicioX: 80,  finX: 115 },
            { nombre: "Concepto",           inicioX: 115, finX: 195 },
            { nombre: "Fecha Vencimiento",  inicioX: 195, finX: 250 },
            { nombre: "Estado",             inicioX: 250, finX: 300 },
            { nombre: "Importe Original",   inicioX: 300, finX: 400 },
            { nombre: "Saldo",              inicioX: 400, finX: 510 },
            { nombre: "Saldo Actualizado",  inicioX: 510, finX: 600 }
        ]
    },
    "IMPUESTOS AGENTES DE RETENCIÓN / PERCEPCIÓN": {
        columnas: [
            { nombre: "Periodo",            inicioX: 0,   finX: 49 },
            { nombre: "Cuota",              inicioX: 49,  finX: 91 },
            { nombre: "Impuesto",           inicioX: 91,  finX: 138 },
            { nombre: "Concepto",           inicioX: 138, finX: 188 },
            { nombre: "Descripción Impuesto", inicioX: 188, finX: 267 },
            { nombre: "Fecha Vencimiento",  inicioX: 267, finX: 322 },
            { nombre: "Estado",             inicioX: 322, finX: 373 },
            { nombre: "Importe Original",   inicioX: 373, finX: 456 },
            { nombre: "Saldo",              inicioX: 456, finX: 512 },
            { nombre: "Saldo Actualizado",  inicioX: 512, finX: 600 }
        ]
    }
};

// --- FUNCIONES DE PROCESAMIENTO INTERNO ---

function formatNumber(str) {
    if (!str || typeof str !== 'string') return str;
    if (str.includes('.') && str.indexOf('.') > str.indexOf(',')) {
        const sinSeparadorMiles = str.replace(/,/g, '');
        const conComaDecimal = sinSeparadorMiles.replace('.', ',');
        const partes = conComaDecimal.split(',');
        let parteEntera = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return parteEntera + ',' + partes[1];
    }
    return str;
}

function encontrarColumnaPorLayout(itemX, layout) {
    const columna = layout.columnas.find(c => itemX >= c.inicioX && itemX < c.finX);
    return columna ? columna.nombre : null;
}

function extraerCabecerasDesdeLineas(linea1, linea2, linea3) {
    const itemsCabecera = [...(linea1 || []), ...(linea2 || []), ...(linea3 || [])].filter(item => item.str.trim() !== '');
    itemsCabecera.sort((a, b) => a.transform[4] - b.transform[4]);

    const columnas = [];
    let grupoActual = [];
    const UMBRAL_X = 25;

    for (const item of itemsCabecera) {
        if (grupoActual.length === 0 || Math.abs(item.transform[4] - grupoActual[0].transform[4]) < UMBRAL_X) {
            grupoActual.push(item);
        } else {
            grupoActual.sort((a, b) => b.transform[5] - a.transform[5]);
            columnas.push({ text: grupoActual.map(i => i.str.trim()).join(' '), x: grupoActual[0].transform[4] });
            grupoActual = [item];
        }
    }
    if (grupoActual.length > 0) {
        grupoActual.sort((a, b) => b.transform[5] - a.transform[5]);
        columnas.push({ text: grupoActual.map(i => i.str.trim()).join(' '), x: grupoActual[0].transform[4] });
    }

    return columnas.sort((a, b) => a.x - b.x);
}

function corregirCuotaYFecha(registro) {
    const cuotaKey = Object.keys(registro).find(k => k.toLowerCase() === 'cuota');
    const fechaKey = Object.keys(registro).find(k => k.toLowerCase().startsWith('fecha'));

    if (cuotaKey && fechaKey && registro[fechaKey] && (!registro[cuotaKey] || registro[cuotaKey] === '')) {
        const parts = registro[fechaKey].split(' ');
        if (parts.length > 1 && !isNaN(parts[0]) && parts[0].length <= 3) {
            registro[cuotaKey] = parts.shift();
            registro[fechaKey] = parts.join(' ');
        }
    }
    return registro;
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

    corregirCuotaYFecha(registro);

    Object.keys(registro).forEach(key => {
        if (key.toLowerCase().includes('saldo') || key.toLowerCase().includes('importe')) {
            registro[key] = formatNumber(registro[key]);
        }
    });

    return Object.values(registro).some(v => v) ? registro : null;
}

// --- FUNCIONES PÚBLICAS Y DE EXPORTACIÓN ---

function generarTextoCsvConstanciaFiscal(datosGenerales, tablas) {
    const filasCsv = [];
    if (datosGenerales && datosGenerales.length > 0) {
        filasCsv.push('"=== CABECERA DEL DOCUMENTO ==="');
        datosGenerales.forEach(linea => filasCsv.push(`"${linea.replace(/"/g, '""')}"`));
        filasCsv.push('');
    }

    tablas.forEach((tabla, index) => {
        filasCsv.push(`"=== ${tabla.titulo} ==="`);
        if (tabla.datos && tabla.datos.length > 0) {
            const cabeceras = Object.keys(tabla.datos[0]);
            const filasDeTabla = [cabeceras.join(',')];
            for (const fila of tabla.datos) {
                const valores = cabeceras.map(cabecera => {
                    const valor = fila[cabecera] || '';
                    return `"${String(valor).replace(/"/g, '""')}"`;
                });
                filasDeTabla.push(valores.join(','));
            }
            filasCsv.push(filasDeTabla.join('\n'));
        } else {
            filasCsv.push('"Sin Datos"');
        }
        if (index < tablas.length - 1) {
            filasCsv.push('');
        }
    });

    return filasCsv.join('\n');
}

function consolidarTablas(tablas) {
    const tablasConsolidadasMap = new Map();

    for (const tabla of tablas) {
        if (!tabla.titulo) continue;

        const tablaExistente = tablasConsolidadasMap.get(tabla.titulo);

        if (tablaExistente) {
            if (tabla.datos) {
                tablaExistente.datos.push(...tabla.datos);
            }
        } else {
            tablasConsolidadasMap.set(tabla.titulo, JSON.parse(JSON.stringify(tabla)));
        }
    }

    return Array.from(tablasConsolidadasMap.values());
}

// La función principal ahora recibe las filas ya parseadas, no una ruta de archivo.
async function procesarConstanciaFiscal(allFilas) {
    try {
        let cabeceraDocumento = [];
        let todasLasTablas = [];
        let tablaActual = null;
        let estado = 'cabecera_documento';

        for (let i = 0; i < allFilas.length; i++) {
            const lineaItems = allFilas[i].items; // Accedemos a la propiedad .items de cada fila
            const textoLinea = lineaItems.map(item => item.str.trim()).join(' ').toUpperCase();

            if (CONFIG.PALABRAS_CLAVE_FOOTER.some(k => textoLinea.includes(k.toUpperCase()))) continue;

            const tituloEncontrado = CONFIG.palabrasClaveTablas.find(p => textoLinea.includes(p));

            if (tituloEncontrado) {
                estado = 'procesando_tabla';
                // La estructura de 'allFilas' es un array de objetos {y, items}, por lo que accedemos a .items
                const cabeceras = extraerCabecerasDesdeLineas(
                    allFilas[i + 1] ? allFilas[i + 1].items : [],
                    allFilas[i + 2] ? allFilas[i + 2].items : [],
                    allFilas[i + 3] ? allFilas[i + 3].items : []
                );
                tablaActual = {
                    titulo: tituloEncontrado,
                    cabeceras: cabeceras,
                    datos: [],
                    layout: MAPA_DE_DISEÑO[tituloEncontrado]
                };
                todasLasTablas.push(tablaActual);
                i += 3; 
                continue;
            }

            if (estado === 'cabecera_documento') {
                cabeceraDocumento.push(lineaItems.map(item => item.str.trim()).join(' '));
            } else if (estado === 'procesando_tabla' && tablaActual) {
                if (lineaItems.length <= 3) { 
                    estado = 'buscando_titulo';
                    tablaActual = null;
                    i--; 
                    continue;
                }
                
                if (tablaActual.layout) {
                    const registro = convertirFilaAObjeto(lineaItems, tablaActual.layout);
                    if (registro) {
                        tablaActual.datos.push(registro);
                    }
                }
            }
        }
        
        const tablasConsolidadas = consolidarTablas(todasLasTablas);
        const textoCsv = generarTextoCsvConstanciaFiscal(cabeceraDocumento, tablasConsolidadas);

        return {
            datos: tablasConsolidadas.flatMap(t => t.datos),
            csv: textoCsv, // Cambiado de textoCsv a csv para consistencia
            tablas: tablasConsolidadas
        };

    } catch (err) {
        console.error(`Error al procesar datos de Constancia Fiscal: ${err.message}`);
        return null;
    }
}


// --- BLOQUE DE EJECUCIÓN INDEPENDIENTE (MODO DE PRUEBA) ---

if (require.main === module) {
    (async () => {
        console.log('Este script ahora es un especialista y debe ser llamado por el orquestador.');
        console.log('Para probarlo, ejecute el orquestador (extraerTablas_B.js) con la ruta a un PDF de constancia fiscal.');
        // Ejemplo: node src/backend/extraerTablasPdf/extraerTablas_B.js ruta/a/la/constancia_fiscal.pdf
    })();
}

// --- EXPORTACIONES DEL MÓDULO ---

module.exports = { 
    procesarConstanciaFiscal,
    generarTextoCsvConstanciaFiscal
};
