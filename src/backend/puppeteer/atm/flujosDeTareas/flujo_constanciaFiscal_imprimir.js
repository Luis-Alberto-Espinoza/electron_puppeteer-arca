const { exigirLoginATM } = require('../codigoXpagina/login_atm.js');
const { entrarOficinaVirtual } = require('../codigoXpagina/home-oficinaVirtual.js');
const { navegarACumplimientoFiscal, navegarAInscripcionIIBB } = require('../codigoXpagina/oficina_constanciaFiscal.js');
const { carpetaConstancias, hayResultadoControl, leerResultadoControl, seleccionarPrimeraFila, descargarPdfDeBoton } = require('../codigoXpagina/constanciaFiscal.js');
const { launchBrowserAndPage, resolverHeadless } = require('../../archivos_comunes/navegador/browserLauncher.js'); // Importar el lanzador autónomo
const { getFilename } = require('../../../utils/fileManager.js');
const procesarPdfConFallback = require('../../../extraerTablasPdf/extraerTablas_B_Manager.js');
const { generarExcelDeuda } = require('../../../atm/constanciaFiscal/excelDeuda.js');

// Lo que se puede pedir (casillas de la pantalla). Por defecto: cumplimiento + deuda.
const DOCUMENTOS_POR_DEFECTO = ['cumplimiento', 'deuda'];

/**
 * Lee las tablas del PDF de deuda y arma el Excel con estilo al lado (mismo nombre, .xlsx).
 * Sin CSV: el extractor solo devuelve las tablas (guardarCsv: false).
 * @returns {Promise<{rutaExcel: string|null, resumen: Array}>}
 */
async function excelDelPdfDeuda(rutaPdf, contribuyente) {
    const resultado = await procesarPdfConFallback(rutaPdf, { guardarCsv: false });
    if (!resultado || !resultado.exito || !resultado.tablas || resultado.tablas.length === 0) {
        return { rutaExcel: null, resumen: [] };
    }
    return generarExcelDeuda(resultado.tablas, contribuyente, rutaPdf.replace(/\.pdf$/i, '.xlsx'));
}

/**
 * Baja los documentos pedidos de un cliente en UNA sesión de ATM:
 *   cumplimiento → General → Constancia de Cumplimiento Fiscal → "Imprimir Constancia"
 *   deuda        → misma pantalla → "Imprimir Deuda" (solo si hay deuda; si no, se avisa, no es error)
 *   inscripcion  → Ingresos Brutos → Inscripciones → fila → "Imprimir Constancia de Inscripción"
 *
 * Cada documento va por su lado: si uno falla, los otros siguen, y queda en `fallos`
 * (el manager lo muestra PARCIAL / FALLO, nunca "Éxito": guía §3.5.4).
 */
async function flujoConstanciaFiscal(credencialesATM, nombreUsuario, downloadsPath, enviarProgreso, { visible, documentos } = {}) {
    const pedidos = (documentos && documentos.length) ? documentos : DOCUMENTOS_POR_DEFECTO;
    const cuit = credencialesATM.cuit;
    let browser;

    const files = [];
    const partes = [];      // una línea por documento para el mensaje de la tarjeta
    const fallos = [];      // documentos pedidos que no se pudieron bajar
    let deudas = [];
    let resumen = [];

    try {
        enviarProgreso('info', 'Iniciando navegador...');
        const lanzado = await launchBrowserAndPage({ headless: resolverHeadless(visible) });
        browser = lanzado.browser;
        const page = lanzado.page;

        await page.goto('https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp');

        enviarProgreso('info', 'Iniciando sesión en ATM...');
        // Si el login falla corta acá (antes seguía de largo y fallaba después sin decir por qué).
        await exigirLoginATM(page, credencialesATM);

        enviarProgreso('info', 'Navegando a la oficina virtual...');
        const oficinaVirtualPage = await entrarOficinaVirtual(page);
        const downloadDir = await carpetaConstancias(downloadsPath, cuit, nombreUsuario);

        // ── Cumplimiento y deuda: misma pantalla ─────────────────────────────
        if (pedidos.includes('cumplimiento') || pedidos.includes('deuda')) {
            let frame = null;
            try {
                enviarProgreso('info', 'Abriendo Constancia de Cumplimiento Fiscal...');
                frame = await navegarACumplimientoFiscal(oficinaVirtualPage);
                const nombreCumplimiento = getFilename('constancia_cumplimiento', cuit, 'pdf');

                // 1er clic en "Imprimir Constancia": ATM hace el CONTROL y refresca la pantalla con el
                // "Resultado Control" (y "Imprimir Deuda" si hay deuda). Si viene un PDF, se toma.
                enviarProgreso('info', 'Controlando la situación fiscal en ATM...');
                let rutaCumplimiento = await descargarPdfDeBoton(oficinaVirtualPage, frame, 'Imprimir Constancia', downloadDir,
                    pedidos.includes('cumplimiento') ? nombreCumplimiento : null, { cortarSi: hayResultadoControl });
                const control = await leerResultadoControl(frame);
                deudas = control.deudas;

                if (pedidos.includes('cumplimiento')) {
                    try {
                        // 2do clic: con el control hecho, recién ahí ATM entrega la constancia.
                        if (!rutaCumplimiento) {
                            enviarProgreso('info', 'Descargando la constancia de cumplimiento...');
                            rutaCumplimiento = await descargarPdfDeBoton(oficinaVirtualPage, frame, 'Imprimir Constancia',
                                downloadDir, nombreCumplimiento);
                        }
                        if (rutaCumplimiento) {
                            files.push(rutaCumplimiento);
                            partes.push('Constancia de cumplimiento: descargada');
                        } else if (control.hayDeuda) {
                            // ATM no la entrega a quien debe: es información, no un error.
                            partes.push('Constancia de cumplimiento: ATM no la entrega (el contribuyente tiene deuda)');
                        } else {
                            fallos.push('constancia de cumplimiento');
                            partes.push('Constancia de cumplimiento: ATM no abrió el PDF');
                        }
                    } catch (error) {
                        fallos.push('constancia de cumplimiento');
                        partes.push(`Constancia de cumplimiento: error (${error.message})`);
                    }
                }

                if (pedidos.includes('deuda')) {
                    if (!control.hayDeuda) {
                        partes.push('Deuda: sin deuda');
                    } else {
                        enviarProgreso('info', 'Descargando el detalle de deuda...');
                        try {
                            const ruta = await descargarPdfDeBoton(oficinaVirtualPage, frame, 'Imprimir Deuda',
                                downloadDir, getFilename('deuda', cuit, 'pdf'));
                            if (!ruta) throw new Error('ATM no abrió el PDF');
                            files.push(ruta);
                            enviarProgreso('info', 'Armando el Excel de la deuda...');
                            try {
                                const excel = await excelDelPdfDeuda(ruta, { cuit, nombre: nombreUsuario.replace(/_/g, ' ') });
                                resumen = excel.resumen;
                                if (excel.rutaExcel) files.push(excel.rutaExcel);
                                partes.push(excel.rutaExcel ? 'Deuda: descargada (PDF + Excel)' : 'Deuda: descargada (el PDF no trajo tablas para el Excel)');
                            } catch (errorExcel) {
                                // El PDF bajó bien: que falle el Excel no lo invalida, pero se avisa.
                                console.error('[constancia] No se pudo armar el Excel de deuda:', errorExcel.message);
                                partes.push(`Deuda: descargada (no se pudo armar el Excel: ${errorExcel.message})`);
                            }
                        } catch (error) {
                            fallos.push('deuda');
                            partes.push(`Deuda: error (${error.message})`);
                        }
                    }
                }
            } catch (error) {
                // No se pudo ni abrir la pantalla: falla todo lo de esta pantalla.
                if (pedidos.includes('cumplimiento')) fallos.push('constancia de cumplimiento');
                if (pedidos.includes('deuda')) fallos.push('deuda');
                partes.push(`Cumplimiento fiscal: error (${error.message})`);
            }
        }

        // ── Inscripción de Ingresos Brutos ──────────────────────────────────
        if (pedidos.includes('inscripcion')) {
            try {
                enviarProgreso('info', 'Abriendo Inscripciones de Ingresos Brutos...');
                const frame = await navegarAInscripcionIIBB(oficinaVirtualPage);
                await seleccionarPrimeraFila(frame);
                enviarProgreso('info', 'Descargando la constancia de inscripción...');
                const ruta = await descargarPdfDeBoton(oficinaVirtualPage, frame, 'Imprimir Constancia de Inscripción',
                    downloadDir, getFilename('constancia_inscripcion', cuit, 'pdf'));
                if (!ruta) throw new Error('ATM no abrió el PDF');
                files.push(ruta);
                partes.push('Inscripción IIBB: descargada');
            } catch (error) {
                fallos.push('inscripción IIBB');
                partes.push(`Inscripción IIBB: error (${error.message})`);
            }
        }

        const lineaDeuda = deudas.length
            ? `Con deuda: ${deudas.map(d => d.replace(/^Posee deuda en (el |los |las )?/i, '')).join('; ')}.`
            : '';
        const mensaje = [partes.join(' · ') + '.', lineaDeuda].filter(Boolean).join(' ');

        enviarProgreso(fallos.length ? 'error' : 'info', mensaje);
        return {
            exito: true,
            descargaIncompleta: fallos.length > 0,
            fallos,
            mensaje,
            deudas,
            resumen,
            files,
            downloadDir: files.length ? downloadDir : null
        };

    } catch (error) {
        console.error('Error en el flujo de Constancia Fiscal:', error.message);
        enviarProgreso('error', `Error en el flujo de Constancia Fiscal: ${error.message}`);
        throw error; // Lanzar para que el worker lo capture
    } finally {
        if (browser) {
            await browser.close();
            enviarProgreso('info', 'Navegador cerrado.');
        }
    }
}

module.exports = {
    flujoConstanciaFiscal,
    DOCUMENTOS_POR_DEFECTO
};
