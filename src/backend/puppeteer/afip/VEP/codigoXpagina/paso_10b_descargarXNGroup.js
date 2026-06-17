// PASO 10b: descarga del VEP COMPLETO para el medio de pago "XN Group".
//
// PROBLEMA: cuando el medio es XN Group, el PDF que genera el botón
// "Descargar VEP" de AFIP viene SIN las barras del código de barras (sólo
// aparecen los números). Es un bug del lado de AFIP, no nuestro.
//
// SOLUCIÓN: la vista "Ver Detalle" abre un popup HTML que SÍ dibuja las barras
// del lado del navegador. En vez de bajar el PDF roto de AFIP, capturamos ese
// popup como página de Puppeteer y lo imprimimos a PDF con Chromium
// (`page.pdf`) emulando media 'screen' — así NO se aplica el CSS de `@media
// print`, que es justo el que mata las barras. `printBackground:true` conserva
// fondos/imágenes (por si la barra es un background o un canvas/imagen).
//
// Sólo se invoca desde paso_10 cuando `medioPago.id === 'xn_group'`.
//
// Diferencia con el paso_12b del SCT: el SCT trabaja dentro de iframes; el VEP
// opera sobre `page` directo (igual que el resto del paso_10), así que acá el
// botón "Ver Detalle" se busca y clickea sobre la propia página.
//
// NOTA: "Ver Detalle" es otro selector frágil de la UI de ARCA, primo de
// "Descargar VEP". Lo matcheamos por TEXTO, no por clase CSS.
//
// NOTA 2: `page.pdf()` históricamente sólo corría en headless. En Chrome
// moderno suele andar también en headful; si acá tira error, hay que ir por la
// "opción B" (browser headless temporal con las cookies, patrón de
// planesDePago/paso_6_descargarPDF.js).

const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { construirNombreYMover } = require('./_pdfComun.js');

const TIMEOUT_BOTON = 15000;
const TIMEOUT_POPUP = 20000;

async function clickVerDetalle(page) {
    return await page.evaluate(() => {
        const norm = (el) => (el.textContent || '').trim().toLowerCase();
        const link = Array.from(document.querySelectorAll('button, a'))
            .find(el => norm(el).includes('ver detalle'));
        if (!link) return { encontrado: false };
        try { link.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {}
        link.click();
        return { encontrado: true };
    });
}

async function ejecutar(page, usuario, medioPago, downloadsPath) {
    let tempDir = null;
    let popup = null;
    try {
        console.log("  → [XN Group] Descargando VEP vía 'Ver Detalle' (PDF con código de barras)...");

        // 1. Esperar a que aparezca el botón "Ver Detalle" (la página tarda en
        //    renderizar después de aceptar el modal).
        const inicioBusq = Date.now();
        let botonPresente = false;
        while (Date.now() - inicioBusq < TIMEOUT_BOTON) {
            botonPresente = await page.evaluate(() => {
                const norm = (el) => (el.textContent || '').trim().toLowerCase();
                return Array.from(document.querySelectorAll('button, a'))
                    .some(el => norm(el).includes('ver detalle'));
            });
            if (botonPresente) break;
            await new Promise(r => setTimeout(r, 400));
        }
        if (!botonPresente) {
            throw new Error('No se encontró el botón "Ver Detalle"');
        }

        // 2. Click → se abre un popup (nueva pestaña) con la vista que dibuja
        //    las barras. Armamos la espera del nuevo target ANTES del click para
        //    no perdernos el evento.
        const browser = page.browser();
        const targetsPrevios = new Set(browser.targets());
        const popupPromise = browser.waitForTarget(
            t => t.type() === 'page' && !targetsPrevios.has(t),
            { timeout: TIMEOUT_POPUP }
        );

        const r = await clickVerDetalle(page);
        if (!r.encontrado) {
            throw new Error('No se pudo clickear "Ver Detalle"');
        }

        const target = await popupPromise;
        popup = await target.page();
        if (!popup) {
            throw new Error('El popup de "Ver Detalle" no expuso una página');
        }

        // 3. Esperar a que el popup termine de renderizar: el código de barras
        //    se dibuja client-side, así que esperamos a que la red quede quieta.
        await popup.bringToFront().catch(() => {});
        await popup.waitForNetworkIdle({ idleTime: 800, timeout: TIMEOUT_POPUP }).catch(() => {});

        // 4. Imprimir a PDF con media 'screen' (NO el CSS de print, que mata las
        //    barras) + printBackground para conservar fondos/imágenes.
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vep-xn-'));
        const tempPdf = path.join(tempDir, 'ver-detalle.pdf');

        await popup.emulateMediaType('screen');
        try {
            await popup.pdf({
                path: tempPdf,
                format: 'A4',
                printBackground: true,
                margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' }
            });
        } catch (errPdf) {
            throw new Error(`page.pdf() falló (posible limitación headful): ${errPdf.message}`);
        }

        // 5. Extraer metadatos + nombrar + mover (mismo helper que paso_10).
        const { nuevoNombre, destinoPath, datos } =
            await construirNombreYMover(tempPdf, { usuario, medioPago, downloadsPath });

        console.log(`  ✅ [XN Group] PDF (con código de barras) descargado: ${nuevoNombre}`);
        console.log(`     Nro. VEP: ${datos.nroVep || 'N/A'} | Período: ${datos.periodo || 'N/A'} | CUIT: ${datos.cuit || 'N/A'}`);

        // El flujo (flujo_generarVEP) lee pdfNombre/pdfPath/datosExtraidos, así
        // que devolvemos la MISMA forma que paso_10 (sin QR para este medio).
        return {
            success: true,
            message: 'PDF del VEP (XN Group) descargado y procesado correctamente',
            pdfPath: destinoPath,
            pdfNombre: nuevoNombre,
            qrPath: null,
            qrNombre: null,
            datosExtraidos: datos
        };

    } catch (error) {
        console.error("  ❌ Error en paso_10b_descargarXNGroup:", error);
        return {
            success: false,
            message: error.message,
            stack: error.stack
        };
    } finally {
        if (popup) { try { await popup.close(); } catch (_) {} }
        if (tempDir) {
            try {
                if (fsSync.existsSync(tempDir)) {
                    await fs.rm(tempDir, { recursive: true, force: true });
                }
            } catch (_) {}
        }
    }
}

module.exports = { ejecutar };
