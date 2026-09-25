const path = require('path');
const fs = require('fs');

// NOTA: La importación y configuración de pdfjs-dist se eliminan de este archivo.
// El parseo del PDF ahora lo realiza el orquestador 'extraerTablas_B.js'.

// --- CONFIGURACIÓN Y PALABRAS CLAVE ---
const CONFIG = {
    // Patrones para detectar títulos de tablas de forma flexible
    patronesTitulosTabla: [
        /^DEUDA\s+IMPUESTO/i,           // DEUDA IMPUESTO AUTOMOTOR, etc.
        /^DEUDA\s+INGRESOS/i,            // DEUDA INGRESOS BRUTOS, DEUDA INGRESOS SELLOS, etc.
        /^IMPUESTOS\s+AGENTES/i          // IMPUESTOS AGENTES DE RETENCIÓN / PERCEPCIÓN
    ],
    // Palabras clave para filtrar líneas de footer/header que no deben incluirse como datos
    PALABRAS_CLAVE_FOOTER: ['Página', 'Versión'],
    // Palabras clave del encabezado del documento que aparecen en cada página
    PALABRAS_CLAVE_HEADER_DOCUMENTO: ['Fecha Impresión', 'CUIT:', 'Razón Social:', 'INFORMACIÓN GENERAL'],
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

function crearLayoutDinamico(cabeceras) {
    // Crear un layout dinámico basado en las cabeceras extraídas
    const columnas = [];

    for (let i = 0; i < cabeceras.length; i++) {
        const inicioX = cabeceras[i].x;
        const finX = (i + 1 < cabeceras.length) ? cabeceras[i + 1].x : 600;

        columnas.push({
            nombre: cabeceras[i].text,
            inicioX: inicioX,
            finX: finX
        });
    }

    return { columnas };
}

function detectarTituloTabla(textoLinea) {
    // Buscar si la línea coincide con algún patrón de título
    const textoLimpio = textoLinea.trim();

    for (const patron of CONFIG.patronesTitulosTabla) {
        if (patron.test(textoLimpio)) {
            return textoLimpio; // Retornar el título completo encontrado
        }
    }

    return null;
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

        console.log(`\n=== DEBUG: Buscando tablas en ${allFilas.length} filas ===`);
        console.log(`Patrones de búsqueda: ${CONFIG.patronesTitulosTabla.map(p => p.toString()).join(', ')}`);

        for (let i = 0; i < allFilas.length; i++) {
            const lineaItems = allFilas[i].items; // Accedemos a la propiedad .items de cada fila
            const textoLinea = lineaItems.map(item => item.str.trim()).join(' ');
            const textoLineaMayusculas = textoLinea.toUpperCase();

            // Saltar líneas de footer
            if (CONFIG.PALABRAS_CLAVE_FOOTER.some(k => textoLineaMayusculas.includes(k.toUpperCase()))) continue;

            // Saltar líneas del encabezado del documento (que se repiten en cada página)
            if (CONFIG.PALABRAS_CLAVE_HEADER_DOCUMENTO.some(k => textoLineaMayusculas.includes(k.toUpperCase()))) {
                continue;
            }

            // Buscar títulos de tablas usando la nueva función flexible
            const tituloEncontrado = detectarTituloTabla(textoLineaMayusculas);

            // Log para ver qué está encontrando
            if (textoLineaMayusculas.includes('DEUDA') || textoLineaMayusculas.includes('IMPUESTO')) {
                console.log(`\n[Fila ${i}] Línea sospechosa: "${textoLineaMayusculas.substring(0, 80)}"`);
                console.log(`  ¿Título encontrado? ${tituloEncontrado ? `SÍ: "${tituloEncontrado}"` : 'NO'}`);
            }

            if (tituloEncontrado) {
                // Si ya estábamos procesando una tabla, terminarla
                if (tablaActual) {
                    console.log(`  -> Finalizando tabla anterior: "${tablaActual.titulo}" con ${tablaActual.datos.length} registros`);
                    tablaActual = null;
                }

                estado = 'procesando_tabla';
                console.log(`  -> Iniciando nueva tabla: "${tituloEncontrado}"`);

                // Extraer cabeceras de las siguientes líneas
                const cabeceras = extraerCabecerasDesdeLineas(
                    allFilas[i + 1] ? allFilas[i + 1].items : [],
                    allFilas[i + 2] ? allFilas[i + 2].items : [],
                    allFilas[i + 3] ? allFilas[i + 3].items : []
                );

                console.log(`  -> Cabeceras detectadas: ${cabeceras.map(c => c.text).join(', ')}`);

                // Intentar usar layout predefinido, o buscar uno compatible, o crear uno dinámico
                let layout = MAPA_DE_DISEÑO[tituloEncontrado];
                let layoutUsado = 'predefinido exacto';

                if (!layout) {
                    // Buscar un layout compatible basado en el patrón del título
                    if (/^DEUDA\s+INGRESOS/i.test(tituloEncontrado)) {
                        // Todas las tablas "DEUDA INGRESOS *" usan el mismo layout
                        layout = MAPA_DE_DISEÑO["DEUDA INGRESOS BRUTOS"];
                        layoutUsado = 'compatible (DEUDA INGRESOS)';
                    } else if (/^DEUDA\s+IMPUESTO/i.test(tituloEncontrado)) {
                        // Todas las tablas "DEUDA IMPUESTO *" usan el mismo layout
                        layout = MAPA_DE_DISEÑO["DEUDA IMPUESTO AUTOMOTOR"];
                        layoutUsado = 'compatible (DEUDA IMPUESTO)';
                    } else if (/^IMPUESTOS\s+AGENTES/i.test(tituloEncontrado)) {
                        layout = MAPA_DE_DISEÑO["IMPUESTOS AGENTES DE RETENCIÓN / PERCEPCIÓN"];
                        layoutUsado = 'compatible (IMPUESTOS AGENTES)';
                    }
                }

                if (!layout) {
                    console.log(`  -> No hay layout compatible, creando layout dinámico`);
                    layout = crearLayoutDinamico(cabeceras);
                    layoutUsado = 'dinámico';
                } else {
                    console.log(`  -> Usando layout ${layoutUsado}`);
                }

                tablaActual = {
                    titulo: tituloEncontrado,
                    cabeceras: cabeceras,
                    datos: [],
                    layout: layout
                };
                todasLasTablas.push(tablaActual);
                i += 3; // Saltar las líneas de cabecera
                continue;
            }

            if (estado === 'cabecera_documento') {
                // Recolectar cabecera del documento hasta encontrar la primera tabla
                cabeceraDocumento.push(lineaItems.map(item => item.str.trim()).join(' '));
            } else if (estado === 'procesando_tabla' && tablaActual) {
                // Verificar si es una línea vacía o muy corta (posible fin de tabla)
                if (lineaItems.length <= 3) {
                    // No cambiar el estado, solo ignorar esta línea
                    // La siguiente tabla será detectada por el código de búsqueda de títulos
                    continue;
                }

                // Procesar la fila de datos si tenemos un layout definido
                if (tablaActual.layout) {
                    const registro = convertirFilaAObjeto(lineaItems, tablaActual.layout);
                    if (registro) {
                        // Verificar que el registro no sea solo datos del encabezado del documento
                        // (a veces estos datos pueden caer dentro del rango de columnas)
                        const valoresRegistro = Object.values(registro).join(' ').toUpperCase();
                        const esEncabezadoDocumento = CONFIG.PALABRAS_CLAVE_HEADER_DOCUMENTO.some(
                            k => valoresRegistro.includes(k.toUpperCase())
                        );

                        if (!esEncabezadoDocumento) {
                            tablaActual.datos.push(registro);
                        } else {
                            console.log(`  -> Filtrado registro de encabezado: ${valoresRegistro.substring(0, 60)}...`);
                        }
                    }
                }
            }
        }
        
        const tablasConsolidadas = consolidarTablas(todasLasTablas);

        console.log(`\n=== Constancia Fiscal: Se encontraron ${tablasConsolidadas.length} tabla(s) ===`);
        tablasConsolidadas.forEach((tabla, index) => {
            console.log(`  Tabla ${index + 1}: "${tabla.titulo}" con ${tabla.datos.length} registros`);
        });

        return {
            datos: tablasConsolidadas.flatMap(t => t.datos),
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
    procesarConstanciaFiscal
};
