/**
 * Flujo Puppeteer: Consulta de Comprobantes Emitidos
 *
 * Cadena completa:
 *   1. buscarEnAfip('compr')                  → nueva pestaña Comprobantes en Línea
 *   2. seleccionarEmpresa(nombre)             → entra al contexto de la empresa
 *   3. menuPrincipal({ botonId: 'btn_consultas' })
 *   4. buscarComprobantesYCapturarTabla       → llena form + click Buscar + captura nueva pestaña
 *   5. descargarPdfsDeTabla                   → click en cada "Ver", PDFs a carpeta temporal
 *   6. parsearComprobantePdf por cada PDF
 *   7. generarExcelComprobantes               → Excel en carpeta del cliente
 *   8. limpiar carpeta temporal
 */

const fs = require('fs/promises');
const { buscarEnAfip } = require('../../../archivosComunes/buscadorAfip.js');
const { seleccionarEmpresa } = require('../../../archivosComunes/empresasDisponibles.js');
const { menuPrincipal } = require('../hacerFacturas/codigoXpagina/menuPrincipal.js');
const { buscarComprobantesYCapturarTabla } = require('./paso_buscarComprobantes.js');
const { descargarPdfsDeTabla } = require('./paso_descargarPdfsTabla.js');
const { parsearComprobantePdf } = require('./parsearComprobantePdf.js');
const { generarExcelComprobantes } = require('./generarExcelComprobantes.js');

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Una Nota de Crédito (A/B/C/E/FCE) anula o devuelve, así que en la sumatoria
 * RESTA. Detectamos por el texto del tipo (cubre todas las variantes).
 */
function esNotaCredito(tipo) {
    return /nota\s+de\s+cr[ée]dito/i.test(tipo || '');
}

/**
 * @param {import('puppeteer').Page} page - página ya logueada
 * @param {Object} datos - { consultaDesde, consultaHasta, idTipoComprobante, nombreEmpresa }
 * @param {Object} usuario - { cuit, nombre, apellido } (para nombre de archivo/carpeta)
 * @param {string} basePath - ruta base de descargas (app.getPath('downloads'))
 */
async function ejecutarFlujoConsultaComprobantes(page, datos, usuario, basePath) {
    console.log('🔵 [Flujo Consulta Comprobantes] Iniciando...');
    let tempDir = null;

    try {
        // 1. Buscar "Comprobantes en línea"
        console.log('🔵 [Flujo] Paso 1: Buscando "Comprobantes en línea"...');
        const newPage = await buscarEnAfip(page, 'compr', { esperarNuevaPestana: true });
        await esperar(500);

        // 2. Seleccionar la empresa
        console.log('🔵 [Flujo] Paso 2: Seleccionando empresa...');
        const pageEmpresa = await seleccionarEmpresa(newPage, datos.nombreEmpresa);
        await esperar(800);

        // 3. Ir al menú de Consultas
        console.log('🔵 [Flujo] Paso 3: Click en "Consultas"...');
        await menuPrincipal(pageEmpresa, { botonId: 'btn_consultas' });
        await esperar(500);

        // 4. Completar formulario y capturar nueva pestaña con tabla
        console.log('🔵 [Flujo] Paso 4: Buscando comprobantes...');
        const pageTabla = await buscarComprobantesYCapturarTabla(pageEmpresa, datos);

        // 5. Descargar todos los PDFs
        console.log('🔵 [Flujo] Paso 5: Descargando PDFs...');
        const { tempDir: tDir, pdfPaths } = await descargarPdfsDeTabla(pageTabla);
        tempDir = tDir;

        if (pdfPaths.length === 0) {
            console.log('⚠️ [Flujo] No se descargaron PDFs (sin comprobantes en el rango).');
            return {
                success: true,
                data: {
                    archivoExcel: null,
                    rutaCompleta: null,
                    totalFilas: 0,
                    sumaTotal: 0,
                    comprobantes: []
                }
            };
        }

        // 6. Parsear cada PDF
        console.log(`🔵 [Flujo] Paso 6: Parseando ${pdfPaths.length} PDF(s)...`);
        const comprobantes = [];
        for (let i = 0; i < pdfPaths.length; i++) {
            try {
                const datosPdf = await parsearComprobantePdf(pdfPaths[i]);
                // Si el parser no pudo leer el tipo del PDF pero el usuario filtró
                // por uno, ese es el tipo seguro de toda la tanda.
                if (!datosPdf.tipoComprobante && datos.tipoComprobante) {
                    datosPdf.tipoComprobante = datos.tipoComprobante;
                }
                // Notas de Crédito en negativo: la suma da el neto real.
                if (typeof datosPdf.importeTotal === 'number' && esNotaCredito(datosPdf.tipoComprobante)) {
                    datosPdf.importeTotal = -Math.abs(datosPdf.importeTotal);
                }
                comprobantes.push(datosPdf);
            } catch (e) {
                console.error(`  ❌ Error parseando ${pdfPaths[i]}:`, e.message);
                comprobantes.push({
                    tipoComprobante: datos.tipoComprobante || null,
                    puntoDeVenta: null,
                    comprobanteNumero: null,
                    periodoDesde: null,
                    periodoHasta: null,
                    fechaEmision: null,
                    cuitReceptor: null,
                    razonSocialReceptor: null,
                    importeTotal: null,
                    errorParser: e.message
                });
            }
        }

        // 7. Generar Excel
        console.log('🔵 [Flujo] Paso 7: Generando Excel...');
        const excel = generarExcelComprobantes(
            comprobantes,
            usuario,
            basePath,
            datos.consultaDesde,
            datos.consultaHasta
        );
        console.log(`  ✅ Excel: ${excel.rutaCompleta}`);

        return {
            success: true,
            data: {
                archivoExcel: excel.archivoExcel,
                rutaCompleta: excel.rutaCompleta,
                totalFilas: excel.totalFilas,
                sumaTotal: excel.sumaTotal,
                comprobantes
            }
        };

    } catch (error) {
        console.error('❌ [Flujo Consulta Comprobantes] Error:', error);
        return {
            success: false,
            error: 'FLUJO_ERROR',
            message: error.message,
            stack: error.stack
        };
    } finally {
        // 8. Limpiar carpeta temporal de PDFs
        if (tempDir) {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
                console.log(`🧹 [Flujo] Carpeta temporal eliminada: ${tempDir}`);
            } catch (e) {
                console.warn(`⚠️  No se pudo eliminar la carpeta temporal: ${e.message}`);
            }
        }
    }
}

module.exports = { ejecutarFlujoConsultaComprobantes };
