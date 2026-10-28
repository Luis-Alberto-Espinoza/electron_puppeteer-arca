const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { getDownloadPath, moverArchivo } = require('../../../utils/fileManager.js');
const { getDownloadPathContribuyente } = require('../../../cliente/carpetaContribuyente.js');
const { exigirLoginATM } = require('../codigoXpagina/login_atm.js');
const { entrarOficinaVirtual } = require('../codigoXpagina/home-oficinaVirtual.js');
const { entrarPlanDePago } = require('../codigoXpagina/oficina-planDePago.js');
const { elegirImpuesto, descargarPlanPorIndice, contarPlanes, diagnosticarPantalla } = require('../codigoXpagina/planDePago_impuestos.js');
const { convertirPdfAExcel } = require('../../../tablasPdf/convertirPdfAExcel.js');
const { launchBrowserAndPage, resolverHeadless } = require('../../archivos_comunes/navegador/browserLauncher.js'); // Importar el lanzador autónomo
const puppeteerManager = require('../../archivos_comunes/navegador/puppeteer-manager.js'); // "⏹ Cancelar" del lanzador

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

// Impuestos de "Consulta Planes de Pago" que se consultan si no se elige nada (el de siempre).
const IMPUESTOS_POR_DEFECTO = ['Ingresos Brutos'];

// Tope para que llegue el PDF de un plan: los planes grandes (ej. un ANULADO de 12 cuotas y $58 M de
// Shopping) tardaron más de 30 s (2026-10-23).
const ESPERA_PDF_MS = 60000;

/**
 * Texto de un cartel de ATM, corto para la tarjeta: sin el título ("Mensaje LISTA DE ERRORES [3]")
 * y solo la primera oración. Ej. → "El plan seleccionado fue creado para débito directo y tiene una adhesión activa".
 */
function resumirAvisoAtm(texto) {
    const sinTitulo = String(texto).replace(/^.*?\]\s*/, '').replace(/^Mensaje\s*/i, '');
    return sinTitulo.split('.')[0].trim();
}

/**
 * Espera a que aparezca un archivo TERMINADO (sin .crdownload) en la carpeta temporal del plan.
 * Señal, no reloj: el PDF de un plan tarda lo que tarda ATM en armarlo.
 * @returns {Promise<boolean>} false si no llegó en ESPERA_PDF_MS
 */
async function esperarPdfEnCarpeta(carpeta, { tope = ESPERA_PDF_MS, intervalo = 250 } = {}) {
    const inicio = Date.now();
    while (Date.now() - inicio < tope) {
        const archivos = await fs.readdir(carpeta).catch(() => []);
        if (archivos.length > 0 && archivos.every(a => !a.endsWith('.crdownload'))) return true;
        await new Promise(resolve => setTimeout(resolve, intervalo));
    }
    return false;
}

/** "Agentes de Retención y Percepción IIBB" → "AgentesDeRetencionYPercepcionIIBB" (para el nombre del archivo). */
function impuestoParaArchivo(impuesto) {
    return impuesto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9 ]/g, ' ').trim()
        .split(/\s+/).map(p => p[0].toUpperCase() + p.slice(1)).join('');
}

/**
 * Por cada impuesto pedido: lo elige en ATM, cuenta los planes VIGENTES y baja cada uno (PDF + Excel).
 * Un impuesto que falla no corta a los demás: queda en el mensaje y la tarjeta sale PARCIAL/FALLO.
 */
async function flujoPlanDePago(credencialesATM, nombreUsuario, downloadsPath, enviarProgreso, { visible, impuestos, incluirNoVigentes = false } = {}) {
    const pedidos = (impuestos && impuestos.length) ? impuestos : IMPUESTOS_POR_DEFECTO;
    let browser;
    const tempDirs = [];          // { dir, impuesto, estado }: un temporal por plan descargado
    const partes = [];            // una por impuesto para el mensaje de la tarjeta
    const fallos = [];            // impuestos que no se pudieron consultar

    try {
        enviarProgreso('info', 'Iniciando navegador...');
        const lanzado = await launchBrowserAndPage({ headless: resolverHeadless(visible) });
        browser = lanzado.browser;
        puppeteerManager.registrar(browser);
        const page = lanzado.page;

        enviarProgreso('info', 'Navegando a la página de login de ATM...');
        await page.goto('https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp');

        enviarProgreso('info', 'Iniciando sesión en ATM...');
        // Si el login falla corta acá (antes seguía de largo y fallaba después sin decir por qué).
        await exigirLoginATM(page, credencialesATM);

        enviarProgreso('info', 'Navegando a la oficina virtual...');
        const oficinaVirtualPage = await entrarOficinaVirtual(page);

        enviarProgreso('info', 'Entrando a la sección de planes de pago...');
        await entrarPlanDePago(oficinaVirtualPage);
        
        const client = await oficinaVirtualPage.target().createCDPSession();
        for (const impuesto of pedidos) {
            try {
                enviarProgreso('info', `${impuesto}: buscando planes de pago vigentes...`);
                await elegirImpuesto(oficinaVirtualPage, impuesto);
                const cuenta = await contarPlanes(oficinaVirtualPage);
                // Solo los VIGENTES, salvo que se pidan todos ("Incluir planes no vigentes").
                const numeroDeFilas = incluirNoVigentes ? cuenta.total : cuenta.vigentes;
                if (numeroDeFilas === 0) {
                    partes.push(`${impuesto}: ${incluirNoVigentes ? 'sin planes' : 'sin planes vigentes'}`);
                    continue;
                }
                const avisosImpuesto = [];   // carteles de ATM al elegir un plan (información, no error)
                for (let i = 0; i < numeroDeFilas; i++) {
                    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `planpago-${i}-`));
                    const temporal = { dir: tempDir, impuesto, estado: 'VIGENTE' };
                    tempDirs.push(temporal);
                    enviarProgreso('info', `${impuesto}: descargando plan ${i + 1} de ${numeroDeFilas}...`);
                    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: tempDir });
                    const { plan, estado, avisos } = await descargarPlanPorIndice(oficinaVirtualPage, i, enviarProgreso, { incluirNoVigentes });
                    temporal.estado = estado;
                    avisos.forEach(aviso => avisosImpuesto.push(`plan ${plan}: ${resumirAvisoAtm(aviso)}`));
                    // Esperar el PDF terminado en SU carpeta antes de tocar otra cosa: cambiar de
                    // impuesto con la descarga en curso la perdía (Debora, 2026-10-23).
                    const llego = await esperarPdfEnCarpeta(tempDir);
                    if (!llego) {
                        const pantalla = await diagnosticarPantalla(oficinaVirtualPage).catch(e => ({ error: e.message }));
                        console.warn(`[PlanDePago] ${impuesto}: el PDF del plan ${i + 1} no llegó en ${ESPERA_PDF_MS / 1000} s. Pantalla:`, JSON.stringify(pantalla));
                    }
                }
                partes.push((incluirNoVigentes
                    ? `${impuesto}: ${numeroDeFilas} plan(es) (${cuenta.vigentes} vigente(s))`
                    : `${impuesto}: ${numeroDeFilas} plan(es) vigente(s)`)
                    + (avisosImpuesto.length ? ` (ATM avisa: ${avisosImpuesto.join('; ')})` : ''));
            } catch (error) {
                console.error(`[PlanDePago] ${impuesto}:`, error.message);
                fallos.push(impuesto);
                partes.push(`${impuesto}: error (${error.message})`);
            }
        }

        if (tempDirs.length === 0) {
            const mensaje = fallos.length
                ? `${partes.join(' · ')}.`
                : `Sin planes de pago${incluirNoVigentes ? '' : ' vigentes'} en: ${pedidos.join(', ')}.`;
            enviarProgreso(fallos.length ? 'error' : 'info', mensaje);
            return { success: true, descargaIncompleta: fallos.length > 0, fallos, mensaje, files: [], downloadDir: null };
        }

        enviarProgreso('info', 'Procesando archivos descargados...');

        const finalFilePaths = [];
        let planesSinArchivo = 0;   // ATM no entregó el PDF de un plan vigente: no puede salir como Éxito
        const diaConsulta = new Date().toISOString().slice(0, 10);

        for (const { dir: tempDir, impuesto, estado } of tempDirs) {
            const archivos = (await fs.readdir(tempDir)).filter(a => !a.endsWith('.crdownload'));
            if (archivos.length === 0) {
                planesSinArchivo++;
                enviarProgreso('error', `${impuesto}: no llegó el PDF de uno de los planes vigentes.`);
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
            // Los no vigentes llevan su estado en el nombre (los vigentes, como siempre).
            const marcaEstado = estado && estado !== 'VIGENTE' ? `_${estado.replace(/\s+/g, '_')}` : '';
            const baseNombre = `PlanPago_${credencialesATM.cuit}_${impuestoParaArchivo(impuesto)}_boleto_${numeroBoleto}${marcaEstado}_Consulta_${diaConsulta}`;

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
        
        const incompleta = planesSinArchivo > 0 || fallos.length > 0;
        const mensaje = (planesSinArchivo > 0 ? `Descarga INCOMPLETA: faltó el PDF de ${planesSinArchivo} plan(es). ` : '')
            + `${partes.join(' · ')}. ${finalFilePaths.length} archivo(s) (PDF + Excel de cada plan).`;
        enviarProgreso(incompleta ? 'error' : 'info', mensaje);
        return {
            success: true,
            descargaIncompleta: incompleta,
            fallos,
            mensaje,
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
        for (const { dir } of tempDirs) {
            await fs.rm(dir, { recursive: true, force: true }).catch(err => console.error(`Error al eliminar dir temporal: ${err.message}`));
        }
    }
}

module.exports = {
    flujoPlanDePago,
    impuestoParaArchivo,
    esperarPdfEnCarpeta,
    resumirAvisoAtm,
    IMPUESTOS_POR_DEFECTO
};