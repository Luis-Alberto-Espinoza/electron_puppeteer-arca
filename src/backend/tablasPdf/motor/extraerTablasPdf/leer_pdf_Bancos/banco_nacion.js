// Ya no necesitamos cargar pdfjsLib aquí, el Manager se encarga de parsear el PDF
// const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');
const fs = require('fs');

// --- LÓGICA DE EXTRACCIÓN SECUENCIAL INTELIGENTE ---

/**
 * Verifica si un texto tiene el formato de una fecha completa al inicio (dd/mm/yy o dd/mm/yyyy).
 * Puede tener texto adicional después de la fecha (formato 2025).
 * @param {string} str El texto a verificar.
 * @returns {Object|null} {fecha, resto} si encuentra fecha, null si no.
 */
function extraerFechaCompletaAlInicio(str) {
    if (!str) return null;
    const match = str.trim().match(/^(\d{2}\/\d{2}\/\d{2,4})(\s+(.*))?$/);
    if (match) {
        return {
            fecha: match[1],
            resto: match[3] || '' // El texto después de la fecha (puede estar vacío)
        };
    }
    return null;
}

/**
 * Verifica si un texto tiene el formato de la primera parte de una fecha (dd/mm).
 * @param {string} str El texto a verificar.
 * @returns {boolean}
 */
function esInicioDeFecha(str) {
    if (!str) return false;
    return /^\d{2}\/\d{2}$/.test(str.trim());
}

/**
 * Verifica si un texto tiene el formato de la segunda parte de una fecha (/yyyy).
 * @param {string} str El texto a verificar.
 * @returns {boolean}
 */
function esFinalDeFecha(str) {
    if (!str) return false;
    return /^\/\d{4}$/.test(str.trim());
}

/**
 * Procesa una lista de items de texto que pertenecen a una única fila lógica.
 * @param {string} fecha - La fecha completa del registro.
 * @param {Array<string>} itemsDeFila - Los items de texto de la fila (sin la fecha).
 * @returns {Object} El objeto de registro construido.
 */
function construirRegistroDesdeSecuencia(fecha, itemsDeFila) {
    const registro = {
        Fecha: fecha,
        Comprobante: '',
        Concepto: '',
        Importe: '',
        Saldo: ''
    };

    // Extraer importes primero, que suelen estar al final.
    const importes = itemsDeFila.filter(esImporteMonetario);
    if (importes.length >= 2) {
        registro.Importe = formatearImporte(importes[importes.length - 2]);
        registro.Saldo = formatearImporte(importes[importes.length - 1]);
    } else if (importes.length === 1) {
        registro.Importe = formatearImporte(importes[0]);
    }

    // Filtrar los items que no son importes para encontrar el concepto y comprobante.
    const noImportes = itemsDeFila.filter(item => !esImporteMonetario(item));

    // El primer elemento numérico suele ser el comprobante.
    const indiceComprobante = noImportes.findIndex(item => /^\d{4,8}[A-Z]*$/.test(item));

    if (indiceComprobante !== -1) {
        registro.Comprobante = noImportes[indiceComprobante];
        // El resto son el concepto.
        registro.Concepto = noImportes.filter((_, idx) => idx !== indiceComprobante).join(' ');
    } else {
        // Si no hay comprobante, todo es concepto.
        registro.Concepto = noImportes.join(' ');
    }

    return registro;
}

/**
 * Procesa las filas parseadas del PDF, extrayendo registros con lógica de agrupación por fecha.
 * LÓGICA: dd/mm marca inicio, acumula TODO hasta el siguiente dd/mm, clasifica por posición X
 * @param {Array} allFilas - Array de filas parseadas desde el Manager
 * @returns {Array<Object>} Un array de registros extraídos.
 */
function procesarFilas(allFilas) {
    console.log(`[banco_nacion] Procesando ${allFilas.length} filas...`);

    // Extraer TODOS los items de todas las filas con sus posiciones
    const todosLosItems = [];
    allFilas.forEach(fila => {
        fila.items.forEach(item => {
            const texto = item.str.trim();
            if (texto && texto !== '' && texto !== ' ') {
                todosLosItems.push({
                    texto: texto,
                    x: item.transform[4],
                    y: item.transform[5]
                });
            }
        });
    });

    console.log(`[banco_nacion] Total items extraídos: ${todosLosItems.length}`);

    // Definir rangos de columnas aproximados (basados en las posiciones X del header)
    const COLUMNAS = {
        FECHA: { min: 0, max: 80, nombre: 'Fecha' },
        COMPROBANTE: { min: 80, max: 180, nombre: 'Comprobante' },
        CONCEPTO: { min: 180, max: 400, nombre: 'Concepto' },
        IMPORTE: { min: 400, max: 500, nombre: 'Importe' },
        SALDO: { min: 500, max: 600, nombre: 'Saldo' }
    };

    const registros = [];
    let i = 0;

    while (i < todosLosItems.length) {
        const itemActual = todosLosItems[i];

        // Detectar inicio de registro: dd/mm
        const inicioFechaMatch = itemActual.texto.match(/^(\d{1,2}\/\d{1,2})$/);

        if (inicioFechaMatch) {
            const inicioDeFecha = inicioFechaMatch[1];
            //console.log(`[banco_nacion] ═══ Nuevo registro: ${inicioDeFecha} en índice ${i}`);

            // Acumular items del registro actual hasta encontrar el próximo dd/mm
            const itemsDelRegistro = [];
            let j = i + 1;

            while (j < todosLosItems.length) {
                const siguienteItem = todosLosItems[j];

                // Si encontramos otro dd/mm, terminamos este registro
                if (/^\d{1,2}\/\d{1,2}$/.test(siguienteItem.texto)) {
                    break;
                }

                itemsDelRegistro.push(siguienteItem);
                j++;
            }

            // console.log(`[banco_nacion]   → Acumulados ${itemsDelRegistro.length} items`);

            // Buscar el año (/yyyy) dentro de los items acumulados
            const itemAno = itemsDelRegistro.find(item => /^\/\d{4}$/.test(item.texto));

            if (itemAno) {
                const ano = itemAno.texto.match(/^\/(\d{4})$/)[1];
                const fechaCompleta = inicioDeFecha + '/' + ano;
                // console.log(`[banco_nacion]   → Fecha completa: ${fechaCompleta}`);

                // Clasificar items por columna según posición X
                const registro = {
                    Fecha: fechaCompleta,
                    Comprobante: '',
                    Concepto: '',
                    Importe: '',
                    Saldo: ''
                };

                itemsDelRegistro.forEach(item => {
                    // Ignorar solo el año
                    if (item.texto === itemAno.texto) {
                        return;
                    }

                    // Clasificar por posición X (acumular TODO, incluyendo "$")
                    if (item.x >= COLUMNAS.COMPROBANTE.min && item.x < COLUMNAS.COMPROBANTE.max) {
                        registro.Comprobante += (registro.Comprobante ? ' ' : '') + item.texto;
                    } else if (item.x >= COLUMNAS.CONCEPTO.min && item.x < COLUMNAS.CONCEPTO.max) {
                        registro.Concepto += (registro.Concepto ? ' ' : '') + item.texto;
                    } else if (item.x >= COLUMNAS.IMPORTE.min && item.x < COLUMNAS.IMPORTE.max) {
                        registro.Importe += (registro.Importe ? ' ' : '') + item.texto;
                    } else if (item.x >= COLUMNAS.SALDO.min) {
                        registro.Saldo += (registro.Saldo ? ' ' : '') + item.texto;
                    }
                });

                // AHORA limpiar y purgar símbolos
                registro.Importe = limpiarImporte(registro.Importe);
                registro.Saldo = limpiarImporte(registro.Saldo);

                registros.push(registro);
                // console.log(`[banco_nacion]   ✓ Registro #${registros.length}: ${JSON.stringify(registro)}`);
            } else {
                console.log(`[banco_nacion]   ✗ No se encontró año para ${inicioDeFecha}`);
            }

            // Avanzar al próximo inicio de fecha
            i = j;
        } else {
            i++;
        }
    }

    console.log(`[banco_nacion] ═══════════════════════════════`);
    console.log(`[banco_nacion] Total de registros: ${registros.length}`);
    return registros;
}

/**
 * Limpia y formatea un importe (elimina símbolos $, espacios extras)
 */
function limpiarImporte(str) {
    if (!str) return '';

    // 1. Eliminar todos los símbolos "$"
    let limpio = str.replace(/\$/g, '');

    // 2. Eliminar espacios extras (dejar solo uno entre palabras si las hay)
    limpio = limpio.trim().replace(/\s+/g, ' ');

    // 3. Si el resultado es solo espacios, devolver vacío
    if (!limpio.trim()) return '';

    return limpio.trim();
}

function esImporteMonetario(str) {
    const patterns = [
        /^\$?\s*-?\d{1,3}(\.\d{3})*,\d{2}$/,
        /^\$?\s*-?\d{1,3}(\.\d{3})*\.\d{2}$/,
        /^\$?\s*-?\d+,\d{2}$/,
        /^\$?\s*-?\d+\.\d{2}$/
    ];
    return patterns.some(pattern => pattern.test(str.trim()));
}

function formatearImporte(str) {
    let numero = str.replace(/\$|\s/g, '');
    if (numero.includes(',') && numero.lastIndexOf('.') < numero.lastIndexOf(',')) {
        numero = numero.replace(/\./g, '').replace(',', '.');
    } else if (!numero.includes('.') && numero.includes(',')) {
        numero = numero.replace(',', '.');
    }
    const valor = parseFloat(numero);
    if (isNaN(valor)) return str;
    return valor.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- FUNCIONES PÚBLICAS Y DE EXPORTACIÓN ---

function generarTextoCsvBancoNacion(registros) {
    if (!registros || registros.length === 0) {
        return '';
    }
    const cabeceras = ['Fecha', 'Comprobante', 'Concepto', 'Importe', 'Saldo'];
    const filasCsv = [cabeceras.join(',')];
    registros.forEach(registro => {
        const fila = cabeceras.map(cabecera => {
            const valor = registro[cabecera] || '';
            return `"${valor.toString().replace(/"/g, '""')}"`;
        });
        filasCsv.push(fila.join(','));
    });
    return filasCsv.join('\n');
}

/**
 * Función principal que recibe las filas parseadas desde el Manager.
 * @param {Array} allFilas - Array de filas parseadas con estructura: [{y, items: [...]}, ...]
 * @returns {Object} Objeto con datos extraídos: { datos: [...] }
 */
function procesarBancoNacion(allFilas) {
    try {
        const registros = procesarFilas(allFilas);

        // Retornar en el formato que espera el Manager
        return {
            datos: registros
        };
    } catch (err) {
        console.error(`Error al procesar PDF de Banco Nación: ${err.message}`);
        return null;
    }
}

// --- BLOQUE DE EJECUCIÓN INDEPENDIENTE (SOLO PARA PRUEBAS) ---

if (require.main === module) {
    (async () => {
        console.log('Ejecutando [banco_nacion.js] en modo de prueba independiente...');
        console.log('NOTA: En producción, este especialista es llamado por el Manager.');

        // Solo en modo de prueba independiente, necesitamos cargar el PDF nosotros mismos
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

        const rutaDePrueba = '/home/pinchechita/Descargas/8-25-4.pdf';
        const archivoJsonSalida = 'registros_nacion.json';
        const archivoCsvSalida = 'registros_nacion.csv';

        console.log(`Procesando archivo: ${rutaDePrueba}`);

        // Parsear el PDF de la misma manera que lo hace el Manager
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await require('fs').promises.readFile(rutaDePrueba)), verbosity: 0 });
        const pdf = await loadingTask.promise;
        let allFilas = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const filasMap = new Map();

            content.items.forEach(item => {
                const y = item.transform[5];
                const yExistente = [...filasMap.keys()].find(key => Math.abs(y - key) <= 5);
                if (yExistente) {
                    filasMap.get(yExistente).push(item);
                } else {
                    filasMap.set(y, [item]);
                }
            });

            const filasDePagina = [...filasMap.entries()]
                .sort((a, b) => b[0] - a[0])
                .map(([y, items]) => ({ y, items: items.sort((a, b) => a.transform[4] - b.transform[4]) }));

            allFilas.push(...filasDePagina);
        }

        // Ahora sí llamar al procesador con allFilas
        const resultado = procesarBancoNacion(allFilas);

        if (resultado && resultado.datos && resultado.datos.length > 0) {
            console.log(`Se encontraron ${resultado.datos.length} registros.`);

            fs.writeFileSync(archivoJsonSalida, JSON.stringify(resultado.datos, null, 2), 'utf8');
            console.log(`✓ Archivo JSON de prueba guardado en: ${archivoJsonSalida}`);

            const textoCsv = generarTextoCsvBancoNacion(resultado.datos);
            fs.writeFileSync(archivoCsvSalida, textoCsv, 'utf8');
            console.log(`✓ Archivo CSV de prueba guardado en: ${archivoCsvSalida}`);
        } else {
            console.log('No se pudo procesar el PDF o no se encontraron registros.');
        }
    })();
}

// --- EXPORTACIONES DEL MÓDULO ---

module.exports = { 
    procesarBancoNacion, 
    generarTextoCsvBancoNacion 
};