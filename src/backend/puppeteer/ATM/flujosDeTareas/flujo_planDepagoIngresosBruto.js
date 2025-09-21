const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { getDownloadPath } = require('../../../utils/fileManager.js');
const { loginATM } = require('../codigoXpagina/login_atm.js');
const { entrarOficinaVirtual } = require('../codigoXpagina/home-oficinaVirtual.js');
const { entrarPlanDePago } = require('../codigoXpagina/oficina-planDePago.js');
const { contarFilasVigentes, descargarFilaVigentePorIndice, prepararTablaIngresosBrutos } = require('../codigoXpagina/planDePago_ingresosBrutos.js');
const { procesarPlanDePago } = require('../../../extraerTablasPdf/planDePago_extraeTabla.js');
const { launchBrowser } = require('../../browserLauncher.js'); // Importar el lanzador autónomo

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

function encontrarNumeroDeBoleto(datosPdf) {
    if (!datosPdf || !datosPdf.contenidoPaginas || !Array.isArray(datosPdf.contenidoPaginas) || datosPdf.contenidoPaginas.length === 0) {
        return 'SinBoleto';
    }

    const primeraPagina = datosPdf.contenidoPaginas[0];
    if (!primeraPagina.items || !Array.isArray(primeraPagina.items)) {
        return 'SinBoleto';
    }

    const regexBoleto = /\b\d{10,}\b/; // Busca 10 o más dígitos como palabra completa

    for (const item of primeraPagina.items) {
        const match = item.str.match(regexBoleto);
        if (match) {
            return match[0]; // Devuelve el primer match encontrado
        }
    }

    return 'SinBoleto';
}

async function flujoPlanDePago(credencialesATM, nombreUsuario, downloadsPath, enviarProgreso) {
    let browser;
    const tempDirs = [];

    try {
        enviarProgreso('info', 'Iniciando navegador...');
        browser = await launchBrowser({ headless: true });
        const page = await browser.newPage();

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
            return { success: true, files: [], downloadDir: getDownloadPath(downloadsPath, nombreUsuario, 'archivos_atm') };
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
        const mesConsulta = new Date().toISOString().slice(0, 7);
        const diaConsulta = new Date().toISOString().slice(0, 10);
        const anioConsulta = new Date().toISOString().slice(0, 4);

        for (const tempDir of tempDirs) {
            const archivos = await fs.readdir(tempDir);
            if (archivos.length === 0) {
                enviarProgreso('warn', `No se encontró archivo en el directorio temporal ${tempDir}.`);
                continue;
            }
            const tempFilePath = path.join(tempDir, archivos[0]);

            const datosPdf = await procesarPlanDePago(tempFilePath);
            const fechaVenc = encontrarFechaVencimiento(datosPdf);
            const numeroBoleto = encontrarNumeroDeBoleto(datosPdf);
            const nuevoNombre = `PlanPago_${credencialesATM.cuit}_boleto_${numeroBoleto}_Consulta_${diaConsulta}.pdf`;

            const destinoDir = getDownloadPath(downloadsPath, nombreUsuario, 'archivos_atm');
            const destinoPath = path.join(destinoDir, nuevoNombre);
            await fs.rename(tempFilePath, destinoPath);

            finalFilePaths.push(destinoPath);
        }
        
        enviarProgreso('exito', `Proceso completado. Se descargaron y procesaron ${finalFilePaths.length} archivos.`);
        return {
            success: true,
            files: finalFilePaths,
            downloadDir: getDownloadPath(downloadsPath, nombreUsuario, 'archivos_atm')
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