const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { getDownloadPath } = require('../../../utils/fileManager.js');
const { loginATM } = require('../codigoXpagina/login_atm.js');
const { entrarOficinaVirtual } = require('../codigoXpagina/home-oficinaVirtual.js');
const { entrarPlanDePago } = require('../codigoXpagina/oficina-planDePago.js');
const { contarFilasVigentes, descargarFilaVigentePorIndice, prepararTablaIngresosBrutos } = require('../codigoXpagina/planDePago_ingresosBrutos.js');
const { nuevaPagina } = require('../../puppeteer-manager.js');
const { procesarPlanDePago } = require('../../../extraerTablasPdf/planDePago_extraeTabla.js');

// --- Helper para encontrar la fecha de vencimiento en los datos del PDF ---
function encontrarFechaVencimiento(datosPdf) {
    if (!datosPdf || !datosPdf.datos || !Array.isArray(datosPdf.datos)) return 'SinFecha';
    for (const fila of datosPdf.datos) {
        for (const key in fila) {
            if (key.toLowerCase().includes('vencimiento') || key.toLowerCase().includes('vto')) {
                const valor = fila[key];
                const match = String(valor).match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/);
                if (match) return match[0].replace(/\//g, '-');
            }
        }
    }
    return 'SinFecha';
}

async function flujoPlanDePago(credencialesATM, nombreUsuario, downloadsPath) {
    let page;
    const tempDirs = [];
    // console.log("Iniciando flujo de plan de pago v4 (Arquitecto)...");

    try {
        // --- Fase 1: Navegación y Conteo ---
        page = await nuevaPagina('https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp', {});
        await loginATM(page, credencialesATM);
        const oficinaVirtualPage = await entrarOficinaVirtual(page);
        await entrarPlanDePago(oficinaVirtualPage);
        
        await prepararTablaIngresosBrutos(oficinaVirtualPage);

        const numeroDeFilas = await contarFilasVigentes(oficinaVirtualPage);
        if (numeroDeFilas === 0) {
            // console.log('No se encontraron filas vigentes. Finalizando flujo.');
            return { success: true, files: [], downloadDir: getDownloadPath(downloadsPath, nombreUsuario, 'archivos_atm') };
        }
        // console.log(`Se encontraron ${numeroDeFilas} filas vigentes para descargar.`);

        // --- Fase 2: Descarga Controlada (Uno por Uno) ---
        const client = await oficinaVirtualPage.target().createCDPSession();
        for (let i = 0; i < numeroDeFilas; i++) {
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `planpago-${i}-`));
            tempDirs.push(tempDir);
            // console.log(`Descargando en dir temporal: ${tempDir}`);
            
            await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: tempDir });
            await descargarFilaVigentePorIndice(oficinaVirtualPage, i);
            await new Promise(resolve => setTimeout(resolve, 3000)); // Pausa para que la descarga inicie
        }

        // --- Fase 3: Procesamiento y Renombrado ---
        // console.log('Todas las descargas iniciadas. Esperando 15s para la escritura en disco...');
        await new Promise(resolve => setTimeout(resolve, 15000));

        const finalFilePaths = [];
        const mesConsulta = new Date().toISOString().slice(0, 7);

        for (const tempDir of tempDirs) {
            const archivos = await fs.readdir(tempDir);
            if (archivos.length === 0) {
                console.warn(`El directorio temporal ${tempDir} está vacío. Saltando...`);
                continue;
            }
            const tempFilePath = path.join(tempDir, archivos[0]);

            const datosPdf = await procesarPlanDePago(tempFilePath);
            const fechaVenc = encontrarFechaVencimiento(datosPdf);
            const nuevoNombre = `PlanPago_${credencialesATM.cuit}_Venc_${fechaVenc}_Consulta_${mesConsulta}_${Date.now()}.pdf`;

            const destinoDir = getDownloadPath(downloadsPath, nombreUsuario, 'archivos_atm');
            const destinoPath = path.join(destinoDir, nuevoNombre);
            await fs.rename(tempFilePath, destinoPath);

            // console.log(`Archivo procesado y movido a: ${destinoPath}`);
            finalFilePaths.push(destinoPath);
        }

        // console.log('Flujo de plan de pago completado. Archivos finales:', finalFilePaths);
        return {
            success: true,
            files: finalFilePaths,
            downloadDir: getDownloadPath(downloadsPath, nombreUsuario, 'archivos_atm')
        };

    } catch (error) {
        console.error('Error en el flujo de plan de pago (Arquitecto):', error);
        throw error;
    } finally {
        // --- Fase 4: Limpieza ---
        for (const dir of tempDirs) {
            await fs.rm(dir, { recursive: true, force: true }).catch(err => console.error(`Error al eliminar dir temporal: ${err.message}`));
        }
        // console.log('Limpieza de directorios temporales completada.');
    }
}

module.exports = {
    flujoPlanDePago
};
