/**
 * Script de prueba para verificar la lectura y detección de estado en PDFs de Tasa Cero
 *
 * Uso:
 * node src/backend/puppeteer/ATM/flujosDeTareas/test_tasa_cero_pdf.js "/ruta/al/archivo.pdf"
 */

const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// --- Función para leer PDF de Tasa Cero de forma genérica ---
async function leerPdfTasaCero(pdfPath) {
    console.log(`[leerPdfTasaCero] Leyendo PDF: ${pdfPath}`);

    try {
        // Cargar el PDF sin worker
        const loadingTask = pdfjsLib.getDocument({ url: pdfPath, disableWorker: true });
        const pdf = await loadingTask.promise;
        console.log(`[leerPdfTasaCero] PDF cargado. Total de páginas: ${pdf.numPages}`);

        const todasLasFilas = [];

        // Procesar todas las páginas
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const items = content.items;

            console.log(`[leerPdfTasaCero] Página ${pageNum}: ${items.length} items de texto`);

            // Agrupar items por línea (coordenada Y)
            const toleranciaY = 5;
            const filasMap = new Map();

            items.forEach(item => {
                const y = item.transform[5]; // Coordenada Y

                // Buscar si ya existe una fila con coordenada Y similar
                let yExistente = [...filasMap.keys()].find(key => Math.abs(y - key) <= toleranciaY);

                if (yExistente) {
                    filasMap.get(yExistente).push(item);
                } else {
                    filasMap.set(y, [item]);
                }
            });

            // Ordenar filas por coordenada Y (de arriba hacia abajo)
            const filasOrdenadas = [...filasMap.entries()]
                .sort((a, b) => b[0] - a[0])
                .map(([y, items]) => ({
                    y,
                    items: items.sort((a, b) => a.transform[4] - b.transform[4]) // Ordenar por X dentro de cada fila
                }));

            // Agregar las filas de esta página al array total
            todasLasFilas.push(...filasOrdenadas);
        }

        console.log(`[leerPdfTasaCero] Total de filas extraídas: ${todasLasFilas.length}`);

        return {
            exito: true,
            allFilas: todasLasFilas
        };

    } catch (error) {
        console.error(`[leerPdfTasaCero] Error al leer PDF:`, error);
        return {
            exito: false,
            error: error.message,
            allFilas: []
        };
    }
}

// --- Función para detectar estado ---
function encontrarEstadoSolicitud(datosPdf) {
    console.log('=====================================');
    console.log('[encontrarEstadoSolicitud] INICIANDO DETECCIÓN DE ESTADO');
    console.log('=====================================');

    // Verificar que tengamos los datos crudos del PDF
    if (!datosPdf) {
        console.warn('[encontrarEstadoSolicitud] ⚠️ datosPdf es null o undefined');
        return 'ACEPTADA';
    }

    console.log('[encontrarEstadoSolicitud] Estructura de datosPdf:');
    console.log('  - Tiene allFilas:', !!datosPdf.allFilas);
    console.log('  - Tiene datos:', !!datosPdf.datos);
    console.log('  - Keys disponibles:', Object.keys(datosPdf));

    if (!datosPdf.allFilas || !Array.isArray(datosPdf.allFilas)) {
        console.warn('[encontrarEstadoSolicitud] ⚠️ No se encontró allFilas o no es un array, asumiendo ACEPTADA');
        return 'ACEPTADA';
    }

    console.log(`[encontrarEstadoSolicitud] Total de filas en allFilas: ${datosPdf.allFilas.length}`);

    const stringRechazada = "SOLICITUD DE TASA CERO RECHAZADA";
    let filaIndex = 0;

    // Buscar dentro de los items crudos devueltos por el orquestador
    for (const fila of datosPdf.allFilas) {
        filaIndex++;

        if (!fila.items || !Array.isArray(fila.items)) {
            console.log(`  [Fila ${filaIndex}] No tiene items o no es array`);
            continue;
        }

        console.log(`  [Fila ${filaIndex}] Tiene ${fila.items.length} items`);

        for (let i = 0; i < fila.items.length; i++) {
            const item = fila.items[i];

            // Log detallado de cada item
            console.log(`    [Item ${i + 1}] str: "${item.str}"`);

            // Comparación exacta
            if (item.str === stringRechazada) {
                console.log('    ✅✅✅ MATCH ENCONTRADO! ✅✅✅');
                console.log('[encontrarEstadoSolicitud] ❌ RECHAZADA detectada en PDF');
                console.log('=====================================');
                return 'RECHAZADA';
            }

            // También buscar si contiene la palabra RECHAZADA (case insensitive)
            if (item.str && item.str.toUpperCase().includes('RECHAZADA')) {
                console.log(`    ⚠️ PARCIAL: Contiene "RECHAZADA" pero no es match exacto`);
                console.log(`    String completo: "${item.str}"`);
                console.log(`    String esperado: "${stringRechazada}"`);
            }
        }
    }

    console.log('[encontrarEstadoSolicitud] ❌ No se encontró el string de rechazo');
    console.log('[encontrarEstadoSolicitud] ✅ Retornando ACEPTADA por defecto');
    console.log('=====================================');
    return 'ACEPTADA';
}

// --- EJECUCIÓN DEL TEST ---
(async () => {
    // Obtener ruta del PDF desde argumentos de línea de comandos
    const pdfPath = process.argv[2];

    if (!pdfPath) {
        console.error('❌ ERROR: Debe especificar la ruta del PDF');
        console.error('Uso: node test_tasa_cero_pdf.js "/ruta/al/archivo.pdf"');
        process.exit(1);
    }

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  TEST: Lectura y Detección de Estado en PDF Tasa Cero     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`📄 Archivo: ${pdfPath}`);
    console.log('');

    try {
        // Leer el PDF
        const datosPdf = await leerPdfTasaCero(pdfPath);

        console.log('');
        console.log('─────────────────────────────────────────────────────────────');
        console.log('');

        // Detectar estado
        const estado = encontrarEstadoSolicitud(datosPdf);

        console.log('');
        console.log('╔════════════════════════════════════════════════════════════╗');
        console.log(`║  RESULTADO FINAL: ${estado.padEnd(40)}║`);
        console.log('╚════════════════════════════════════════════════════════════╝');

    } catch (error) {
        console.error('❌ ERROR:', error.message);
        console.error(error);
        process.exit(1);
    }
})();
