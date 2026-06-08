// PASO 12b: descarga del VEP COMPLETO para el medio de pago "XN Group".
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
// Sólo se invoca desde paso_12 cuando `medioPago.id === 'xn_group'`.
//
// NOTA: el botón "Ver Detalle" es otro selector frágil de la UI de ARCA, primo
// de los de paso_12/paso_10. Lo matcheamos por TEXTO ("ver detalle"), no por
// clase CSS, igual que hacemos con "Descargar VEP".
//
// NOTA 2 (opción A): `page.pdf()` históricamente sólo corría en headless y el
// SCT corre headful. En Chrome moderno suele andar también en headful; si acá
// tira error, hay que pasar a la "opción B" (browser headless temporal con las
// cookies de sesión, patrón de planesDePago/paso_6_descargarPDF.js).

const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { frameConPredicado } = require('./_helpers.js');
const { construirNombreYMover } = require('./_pdfComun.js');

const TIMEOUT_FRAME = 20000;
const TIMEOUT_POPUP = 20000;

// Predicado (string, corre en el frame) para ubicar el botón "Ver Detalle".
const PREDICADO_VER_DETALLE = `() => {
    const norm = (el) => (el.textContent || '').trim().toLowerCase();
    return Array.from(document.querySelectorAll('button, a'))
        .some(el => norm(el).includes('ver detalle'));
}`;

async function clickVerDetalle(frame) {
    return await frame.evaluate(() => {
        const norm = (el) => (el.textContent || '').trim().toLowerCase();
        const link = Array.from(document.querySelectorAll('button, a'))
            .find(el => norm(el).includes('ver detalle'));
        if (!link) return { encontrado: false };
        try { link.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {}
        link.click();
        return { encontrado: true };
    });
}

async function ejecutar(page, cliente, cuitAsociado, medioPago, downloadsPath) {
    let tempDir = null;
    let popup = null;
    try {
        // 1. Buscar el frame que tenga el botón "Ver Detalle" (puede vivir en
        //    cualquier frame, igual que "Descargar VEP").
        const inicioBusq = Date.now();
        let frame = null;
        while (Date.now() - inicioBusq < TIMEOUT_FRAME) {
            frame = await frameConPredicado(page, PREDICADO_VER_DETALLE);
            if (frame) break;
            await new Promise(r => setTimeout(r, 400));
        }
        if (!frame) {
            throw new Error('No se encontró el botón "Ver Detalle" en ningún frame');
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

        const r = await clickVerDetalle(frame);
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
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sct-vep-xn-'));
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
            // page.pdf() en headful puede no estar soportado según la versión de
            // Chromium. Si esto se repite, hay que ir por la opción B.
            throw new Error(`page.pdf() falló (posible limitación headful): ${errPdf.message}`);
        }

        // 5. Extraer metadatos + nombrar + mover (mismo helper que paso_12).
        const { nuevoNombre, destinoPath, periodoFinal, datos } =
            await construirNombreYMover(tempPdf, { cliente, cuitAsociado, medioPago, downloadsPath });

        console.log(`  ✅ [SCT] PDF XN Group (con código de barras) descargado: ${nuevoNombre}`);
        console.log(`     Nro VEP: ${datos.nroVep || 'N/A'} | Período: ${periodoFinal} | CUIT: ${datos.cuit || 'N/A'}${datos.esConsolidado ? ' | Consolidado' : ''}`);

        return {
            success: true,
            pdfDescargado: { nombre: nuevoNombre, path: destinoPath, datos },
            qrDescargado: null
        };

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_12b_descargarXNGroup:', error);
        return { success: false, message: error.message };
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
