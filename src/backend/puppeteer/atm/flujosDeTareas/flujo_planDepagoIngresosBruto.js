const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { getDownloadPath, moverArchivo } = require('../../../utils/fileManager.js');
const { getDownloadPathContribuyente } = require('../../../cliente/carpetaContribuyente.js');
const { loginATM } = require('../codigoXpagina/login_atm.js');
const { entrarOficinaVirtual } = require('../codigoXpagina/home-oficinaVirtual.js');
const { entrarPlanDePago } = require('../codigoXpagina/oficina-planDePago.js');
const { prepararTablaIngresosBrutos, descargarFilaVigentePorIndice, contarFilasVigentes } = require('../codigoXpagina/planDePago_ingresosBrutos.js');
const { convertirPdfAExcel } = require('../../../tablasPdf/convertirPdfAExcel.js');
const { launchBrowserAndPage, resolverHeadless } = require('../../archivos_comunes/navegador/browserLauncher.js'); // Importar el lanzador autónomo

function encontrarNumeroDeBoleto(datosPdf) {
    // El orquestador ahora devuelve las filas crudas en la propiedad 'allFilas'
    if (!datosPdf || !datosPdf.allFilas || !Array.isArray(datosPdf.allFilas)) {
        return 'SinBoleto';
    }

    const regexBoleto = /\b\d{10,}\b/; // Busca 10 o más dígitos como palabra completa

    // Buscar dentro de los items crudos devueltos por el orquestador
    for (const fila of datosPdf.allFilas) {
        if (fila.items && Array.isArray(fila.items)) {
            for (const item of fila.items) {
                const match = item.str.match(regexBoleto);
                if (match) {
                    return match[0];
                }
            }
        }
    }

    return 'SinBoleto';
}

async function flujoPlanDePago(credencialesATM, nombreUsuario, downloadsPath, enviarProgreso, { visible } = {}) {
    let browser;
    const tempDirs = [];

    try {
        enviarProgreso('info', 'Iniciando navegador...');
        const lanzado = await launchBrowserAndPage({ headless: resolverHeadless(visible) });
        browser = lanzado.browser;
        const page = lanzado.page;

        enviarProgreso('info', 'Navegando a la página de login de ATM...');
        await page.goto('https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp');

        enviarProgreso('info', 'Iniciando sesión en ATM...');
        await loginATM(page, credencialesATM);

        enviarProgreso('info', 'Navegando a la oficina virtual...');
        const oficinaVirtualPage = await entrarOficinaVirtual(page);

        enviarProgreso('info', 'Entrando a la sección de planes de pago...');
        await entrarPlanDePago(oficinaVirtualPage);
        
        enviarProgreso('info', 'Buscando planes de pago vigentes...');
        await prepararTablaIngresosBrutos(oficinaVirtualPage);

        const numeroDeFilas = await contarFilasVigentes(oficinaVirtualPage);
        if (numeroDeFilas === 0) {
            enviarProgreso('info', 'No se encontraron planes de pago vigentes.');
            return { success: true, files: [], downloadDir: await getDownloadPathContribuyente(downloadsPath, credencialesATM.cuit, nombreUsuario, 'archivos_atm') };
        }
        enviarProgreso('info', `Se encontraron ${numeroDeFilas} planes de pago para descargar.`);

        const client = await oficinaVirtualPage.target().createCDPSession();
        for (let i = 0; i < numeroDeFilas; i++) {
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `planpago-${i}-`));
            tempDirs.push(tempDir);
            
            enviarProgreso('info', `Descargando plan de pago ${i + 1} de ${numeroDeFilas}...`);
            await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: tempDir });
            await descargarFilaVigentePorIndice(oficinaVirtualPage, i, enviarProgreso);
            await new Promise(resolve => setTimeout(resolve, 3000)); // Pausa para que la descarga inicie
        }

        enviarProgreso('info', 'Procesando archivos descargados...');
        await new Promise(resolve => setTimeout(resolve, 5000)); // Aumentar espera si es necesario

        const finalFilePaths = [];
        const diaConsulta = new Date().toISOString().slice(0, 10);

        for (const tempDir of tempDirs) {
            const archivos = await fs.readdir(tempDir);
            if (archivos.length === 0) {
                enviarProgreso('warn', `No se encontró archivo en el directorio temporal ${tempDir}.`);
                continue;
            }
            const tempFilePath = path.join(tempDir, archivos[0]);

            // Mismo conversor que el servicio Tablas PDF: el .xlsx queda en el
            // temporal y se mueve junto con el PDF, con el mismo nombre.
            // Si la conversión falla, el PDF se guarda igual.
            let extraccion = null;
            let rutaExcelTemp = null;
            try {
                ({ rutaExcel: rutaExcelTemp, extraccion } = await convertirPdfAExcel(tempFilePath));
            } catch (error) {
                console.error(`[PlanDePago] No se pudo convertir ${archivos[0]} a Excel:`, error);
                enviarProgreso('warn', `No se pudo generar el Excel del plan de pago: ${error.message}`);
            }

            const numeroBoleto = encontrarNumeroDeBoleto(extraccion);
            const baseNombre = `PlanPago_${credencialesATM.cuit}_boleto_${numeroBoleto}_Consulta_${diaConsulta}`;

            const destinoDir = await getDownloadPathContribuyente(downloadsPath, credencialesATM.cuit, nombreUsuario, 'archivos_atm');
            const destinoPath = path.join(destinoDir, `${baseNombre}.pdf`);
            await moverArchivo(tempFilePath, destinoPath);
            finalFilePaths.push(destinoPath);

            if (rutaExcelTemp) {
                const destinoExcel = path.join(destinoDir, `${baseNombre}.xlsx`);
                await moverArchivo(rutaExcelTemp, destinoExcel);
                finalFilePaths.push(destinoExcel);
            }
        }
        
        enviarProgreso('exito', `Proceso completado. Se guardaron ${finalFilePaths.length} archivo(s) (PDF + Excel de cada plan).`);
        return {
            success: true,
            files: finalFilePaths,
            downloadDir: await getDownloadPathContribuyente(downloadsPath, credencialesATM.cuit, nombreUsuario, 'archivos_atm')
        };

    } catch (error) {
        console.error('Error en el flujo de plan de pago:', error);
        enviarProgreso('error', `Error en el flujo de Plan de Pago: ${error.message}`);
        // Lanzar el error para que el worker lo capture y lo reporte
        throw error;
    } finally {
        if (browser) {
            await browser.close();
            enviarProgreso('info', 'Navegador cerrado.');
        }
        // Limpieza de directorios temporales
        for (const dir of tempDirs) {
            await fs.rm(dir, { recursive: true, force: true }).catch(err => console.error(`Error al eliminar dir temporal: ${err.message}`));
        }
    }
}

module.exports = {
    flujoPlanDePago
};