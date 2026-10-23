const { waitForFile } = require('../../../utils/fileManager.js');
const { getDownloadPathContribuyente } = require('../../../cliente/carpetaContribuyente.js');
const { clicReal } = require('./oficina_constanciaFiscal.js');

const INTERVALO_MS = 250;
const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** Carpeta del cliente donde van las constancias (la misma de siempre). */
async function carpetaConstancias(downloadsPath, cuit, nombreUsuario) {
    return getDownloadPathContribuyente(downloadsPath, cuit, nombreUsuario, 'archivos_atm');
}

/** Corre en la página: ¿ya se ve el "Resultado Control"? (aparece recién después del 1er clic). */
function hayResultadoControl() {
    return Array.from(document.querySelectorAll('.z-label'))
        .some(l => /^Deuda (Automotores|Inmuebles|Ingresos Brutos)/.test(l.textContent.trim()));
}

/**
 * Lee la pantalla de Constancia de Cumplimiento Fiscal (sin bajar nada):
 *  - hayDeuda: el botón "Imprimir Deuda" está A LA VISTA (ATM lo oculta si no hay deuda).
 *  - deudas: los textos de "Resultado Control", ej. "Posee deuda en Ingresos Brutos".
 */
async function leerResultadoControl(frame) {
    // "Resultado Control" (y el botón de deuda) llega DESPUÉS que los botones: esperar sus renglones.
    await frame.waitForFunction(hayResultadoControl, { timeout: 20000, polling: INTERVALO_MS })
        .catch(() => console.warn('[constancia] No se vio el "Resultado Control": se lee lo que haya.'));
    await esperar(1000);   // que ZK termine de mostrar/ocultar "Imprimir Deuda"
    return frame.evaluate(() => {
        const botonDeuda = Array.from(document.querySelectorAll('.z-button'))
            .find(b => b.textContent.trim() === 'Imprimir Deuda');
        const deudas = Array.from(document.querySelectorAll('.z-label'))
            .map(l => l.textContent.trim())
            .filter(t => /^Posee deuda/i.test(t));
        return {
            hayDeuda: !!(botonDeuda && botonDeuda.offsetParent !== null && !botonDeuda.disabled),
            deudas: [...new Set(deudas)]
        };
    });
}

/** Inscripciones de IIBB: ATM deja los botones disabled hasta que hay una fila seleccionada. */
async function seleccionarPrimeraFila(frame) {
    await frame.waitForSelector('.z-listitem', { timeout: 10000 });
    // Clic por código en la celda (como el código viejo, que andaba): ZK selecciona la fila.
    const ok = await frame.evaluate(() => {
        const fila = document.querySelector('.z-listitem');
        const celda = fila && (fila.querySelector('.z-listcell') || fila);
        if (!celda) return false;
        celda.click();
        return true;
    });
    if (!ok) throw new Error('No se encontró la fila de la inscripción para seleccionarla.');
}

/**
 * Hace clic en un botón de ATM que abre el PDF en una pestaña nueva y lo guarda en la carpeta.
 * Si aparece un cartel con "Aceptar" antes de la pestaña, lo acepta.
 *
 * Opciones:
 *   - esperaPestanaMs: cuánto esperar la pestaña del PDF.
 *   - cortarSi: función que corre en la página; si da true se deja de esperar (3 s de gracia
 *     por si la pestaña viene atrás). Ej. hayResultadoControl: el 1er clic de "Imprimir Constancia"
 *     NO imprime, hace el control y refresca la pantalla.
 *   - nombreFinal null: si se abre un PDF no pedido, se cierra sin guardarlo.
 *
 * @returns {Promise<string|null>} ruta del PDF, o null si ATM NO abrió (o no se guardó) ninguna pestaña.
 */
async function descargarPdfDeBoton(page, frame, textoBoton, downloadDir, nombreFinal, { esperaPestanaMs = 20000, cortarSi = null } = {}) {
    // Mismo comportamiento de descarga que antes: el PDF se fuerza a esta carpeta.
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });

    // Espera a que el botón exista, esté a la vista y habilitado.
    await frame.waitForFunction((texto) => Array.from(document.querySelectorAll('.z-button'))
        .some(b => b.textContent.trim() === texto && b.offsetParent !== null && !b.disabled),
        { timeout: 10000, polling: INTERVALO_MS }, textoBoton)
        .catch(() => { throw new Error(`No apareció el botón "${textoBoton}" (o está deshabilitado).`); });

    const browser = page.browser();
    let pestanaPdf = null;
    const alAbrirPestana = async (target) => {
        if (target.type() === 'page' && !pestanaPdf) pestanaPdf = await target.page();
    };
    browser.on('targetcreated', alAbrirPestana);

    try {
        const clic = await clicReal(frame, (texto) => Array.from(document.querySelectorAll('.z-button'))
            .find(b => b.textContent.trim() === texto && b.offsetParent !== null && !b.disabled) || null, textoBoton);
        if (!clic) throw new Error(`No se pudo hacer clic en "${textoBoton}".`);

        // Esperar la pestaña del PDF; si en el medio sale un cartel con "Aceptar", aceptarlo.
        const inicio = Date.now();
        let cortarDesde = null;
        while (!pestanaPdf && Date.now() - inicio < esperaPestanaMs) {
            if (cortarSi) {
                if (cortarDesde === null && await frame.evaluate(cortarSi).catch(() => false)) cortarDesde = Date.now();
                if (cortarDesde !== null && Date.now() - cortarDesde > 3000) break;
            }
            await clicReal(frame, () => {
                const modal = Array.from(document.querySelectorAll('.z-window-modal'))
                    .find(w => getComputedStyle(w).display !== 'none' && getComputedStyle(w).visibility !== 'hidden');
                return (modal && Array.from(modal.querySelectorAll('.z-button'))
                    .find(b => b.textContent.trim() === 'Aceptar')) || null;
            }).catch(() => false);
            await esperar(INTERVALO_MS);
        }
    } finally {
        browser.off('targetcreated', alAbrirPestana);
    }

    if (pestanaPdf && !nombreFinal) {
        await pestanaPdf.close().catch(() => {});
        return null;
    }

    if (!pestanaPdf && !cortarSi) {
        // Para diagnosticar: qué quedó en pantalla después del clic (cartel, visor embebido, etc.).
        const pantalla = await frame.evaluate(() => ({
            ventanas: Array.from(document.querySelectorAll('.z-window, .z-window-modal, .z-messagebox-window'))
                .filter(w => getComputedStyle(w).display !== 'none')
                .map(w => w.innerText.replace(/\s+/g, ' ').slice(0, 200)),
            iframes: Array.from(document.querySelectorAll('iframe')).map(i => i.src).slice(0, 5)
        })).catch(e => ({ error: e.message }));
        const pestanas = (await browser.pages()).map(p => p.url());
        console.warn(`[constancia] "${textoBoton}" no abrió pestaña. Pantalla:`, JSON.stringify(pantalla), 'Pestañas:', JSON.stringify(pestanas));
    }
    if (!pestanaPdf) return null;

    // Forzar la descarga del PDF desde el visor (igual que antes).
    await pestanaPdf.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 }).catch(() => {});
    const nombreTemporal = `temp_${Date.now()}.pdf`;
    await pestanaPdf.evaluate(async (nombre) => {
        const respuesta = await window.fetch(window.location.href);
        const blob = await respuesta.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    }, nombreTemporal);

    const rutaFinal = await waitForFile(downloadDir, nombreTemporal, nombreFinal, 30000);
    await pestanaPdf.close().catch(() => {});
    if (!rutaFinal) throw new Error(`El PDF de "${textoBoton}" no terminó de bajar.`);
    return rutaFinal;
}

module.exports = { carpetaConstancias, hayResultadoControl, leerResultadoControl, seleccionarPrimeraFila, descargarPdfDeBoton };
