// PASO 12: Descargar el PDF del VEP generado desde el SCT.
//
// Estructura general (idéntica al paso_10_descargarPDF.js del VEP):
//   1. Configurar Page.setDownloadBehavior con CDP a un tempdir.
//   2. Click en el link "Exportar detalle en archivo PDF" (vive en el iframe).
//   3. Esperar archivo en tempdir (polling — patrón 7.0.1).
//   4. Extraer metadatos con pdfjs-dist (Nro VEP, periodo, CUIT).
//   5. Mover a archivos_afip/<cliente>/ con el nombre estandarizado.
//
// Patrones aplicados (ver doc §7.0):
//   7.0.1 esperar archivo (polling), no setTimeout fijo,
//   7.0.2 click real,
//   7.0.6 link vive en el iframe del SCT.

const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { frameConPredicado } = require('./_helpers.js');
const { construirNombreYMover } = require('./_pdfComun.js');
const paso_12b_descargarXNGroup = require('./paso_12b_descargarXNGroup.js');

// ============================================================
// HELPERS
// ============================================================

async function esperarArchivoListo(tempDir, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const items = await fs.readdir(tempDir);
            const listos = items.filter(n => !n.endsWith('.crdownload') && !n.endsWith('.tmp'));
            if (listos.length > 0) return listos[0];
        } catch (_) {}
        await new Promise(r => setTimeout(r, 500));
    }
    return null;
}

async function clickLinkPDF(frame) {
    return await frame.evaluate(() => {
        const norm = (el) => (el.textContent || '').trim().toLowerCase();
        const cand = Array.from(document.querySelectorAll('button, a'));

        // 1) UI nueva de ARCA: <button> "Descargar VEP" (preferido), si no,
        //    cualquier control cuyo texto incluya "descargar".
        let link = cand.find(el => norm(el).includes('descargar vep'))
                || cand.find(el => norm(el).includes('descargar'));

        // 2) Fallback UI vieja: link por title.
        if (!link) link = document.querySelector('a[title="Exportar detalle en archivo PDF"]');

        // 3) Fallback UI vieja: ícono picture_as_pdf.
        if (!link) {
            const spans = Array.from(document.querySelectorAll('span'));
            const pdfIcon = spans.find(s => (s.textContent || '').trim() === 'picture_as_pdf');
            if (pdfIcon) link = pdfIcon.closest('a') || pdfIcon.closest('button');
        }
        if (!link) return { encontrado: false };

        try { link.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {}
        link.click();
        return { encontrado: true };
    });
}

// ============================================================
// EJECUTAR
// ============================================================

async function ejecutar(page, cliente, cuitAsociado, medioPago, downloadsPath) {
    // XN Group: AFIP genera el PDF de "Descargar VEP" SIN las barras del código
    // de barras (sólo los números) — es un bug de AFIP. La vista "Ver Detalle"
    // sí las dibuja, así que para ese medio descargamos por otra vía (paso_12b)
    // y salimos. Ambos flujos (pagarA / pagarDirectoB) llaman a este paso_12
    // idéntico, por eso el branch vive acá y no en cada flujo.
    if (medioPago && medioPago.id === 'xn_group') {
        return await paso_12b_descargarXNGroup.ejecutar(page, cliente, cuitAsociado, medioPago, downloadsPath);
    }

    let tempDir = null;
    try {

        // 1. Tempdir + CDP setDownloadBehavior.
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sct-vep-pdf-'));
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: tempDir
        });

        // 2. Buscar el frame que tenga el link/botón de PDF (puede vivir en
        //    cualquier frame, no necesariamente en el del SCT).
        // UI nueva de ARCA: el ícono "picture_as_pdf" se reemplazó por un
        // <button> con texto "Descargar VEP". Dejamos el fallback viejo.
        const predicateSrc = `() => {
            const norm = (el) => (el.textContent || '').trim().toLowerCase();
            const cand = Array.from(document.querySelectorAll('button, a'));
            if (cand.some(el => norm(el).includes('descargar'))) return true;
            if (document.querySelector('a[title="Exportar detalle en archivo PDF"]')) return true;
            const spans = Array.from(document.querySelectorAll('span'));
            return spans.some(s => (s.textContent || '').trim() === 'picture_as_pdf');
        }`;

        const inicioBusq = Date.now();
        let frame = null;
        while (Date.now() - inicioBusq < 20000) {
            frame = await frameConPredicado(page, predicateSrc);
            if (frame) break;
            await new Promise(r => setTimeout(r, 400));
        }
        if (!frame) {
            throw new Error('No se encontró el link de descarga del PDF en ningún frame');
        }

        const r = await clickLinkPDF(frame);
        if (!r.encontrado) {
            throw new Error('No se encontró el link de descarga del PDF');
        }

        // 3. Esperar archivo (polling).
        const originalName = await esperarArchivoListo(tempDir, 30000);
        if (!originalName) {
            throw new Error('La descarga del PDF no se completó en el tiempo esperado');
        }

        const srcPath = path.join(tempDir, originalName);

        // 4-5. Extraer metadatos, armar nombre estandarizado y mover a
        //       archivos_afip/<cliente>/ (lógica compartida con paso_12b).
        const { nuevoNombre, destinoPath, destinoDir, periodoFinal, datos } =
            await construirNombreYMover(srcPath, { cliente, cuitAsociado, medioPago, downloadsPath });
        const { nroVep, periodo, cuit, esConsolidado, cantidadSubVeps } = datos;

        console.log(`  ✅ [SCT] PDF descargado: ${nuevoNombre}`);
        console.log(`     Nro VEP: ${nroVep || 'N/A'} | Período: ${periodoFinal} | CUIT: ${cuit || 'N/A'}${esConsolidado ? ' | Consolidado' : ''}`);

        // 6. Si el medio de pago es QR, guardar también la imagen del código QR.
        //    AFIP la renderiza como <img src="data:image/...;base64,...">. La
        //    página tiene otras imágenes base64 (logo, etc.), así que para no
        //    agarrar el logo elegimos el QR por contexto (texto cercano que
        //    mencione billetera/QR/escanear/etc.) y, si eso falla, por forma:
        //    el QR es cuadrado, el logo suele ser un rectángulo ancho.
        //    Además, AFIP declara mime `image/png` aunque el binario sea JPEG,
        //    así que detectamos el tipo real desde la firma del base64.
        let qrPath = null;
        let qrNombre = null;
        if (medioPago && medioPago.id === 'pago_qr') {
            try {

                // Devuelve el data URI del QR en ESTE document, o null.
                const FN_FIND_QR = `() => {
                    const imgs = Array.from(document.querySelectorAll('img'))
                        .filter(img => (img.src || '').startsWith('data:image'));
                    if (imgs.length === 0) return null;

                    const KEYWORDS = /billetera|qr|escane|c[oó]digo|celular|tel[eé]fono|wallet/i;

                    // 1) Por contexto: subir hasta 4 ancestros buscando texto QR.
                    //    Limitamos el largo del texto para que el match sea
                    //    "cercano" y no termine matcheando el <body> entero.
                    for (const img of imgs) {
                        let el = img;
                        for (let i = 0; i < 4 && el; i++) {
                            el = el.parentElement;
                            const t = (el && el.textContent) || '';
                            if (t.length < 600 && KEYWORDS.test(t)) return img.src;
                        }
                    }

                    // 2) Por forma: la imagen más cuadrada y de tamaño razonable.
                    const cuadradas = imgs
                        .map(img => ({
                            src: img.src,
                            w: img.naturalWidth || img.width || 0,
                            h: img.naturalHeight || img.height || 0
                        }))
                        .filter(c => c.w >= 80 && c.h >= 80 && c.w / c.h >= 0.8 && c.w / c.h <= 1.25);
                    return cuadradas.length ? cuadradas[0].src : null;
                }`;

                // Buscar en TODOS los frames (la vista del QR puede estar en otro).
                let qrDataUrl = null;
                const inicioQR = Date.now();
                while (Date.now() - inicioQR < 10000 && !qrDataUrl) {
                    for (const f of page.frames()) {
                        try {
                            const src = await f.evaluate(`(${FN_FIND_QR})()`);
                            if (src) { qrDataUrl = src; break; }
                        } catch (_) { /* frame detached/cross-origin — saltar */ }
                    }
                    if (!qrDataUrl) await new Promise(r => setTimeout(r, 400));
                }

                if (qrDataUrl) {
                    // Separar header y payload base64. AFIP a veces deja un
                    // espacio después de la coma — lo limpiamos.
                    const idxComa = qrDataUrl.indexOf(',');
                    const base64Data = qrDataUrl.slice(idxComa + 1).trim();

                    // Detectar el tipo real por la firma del base64 (los
                    // primeros bytes decodificados): el header de AFIP miente.
                    let extension = 'png';
                    if (base64Data.startsWith('/9j/')) {
                        extension = 'jpg';                    // JPEG (FF D8 FF)
                    } else if (base64Data.startsWith('iVBOR')) {
                        extension = 'png';                    // PNG (89 50 4E 47)
                    } else if (base64Data.startsWith('R0lGOD')) {
                        extension = 'gif';                    // GIF
                    }

                    qrNombre = nuevoNombre.replace(/\.pdf$/i, `.${extension}`);
                    qrPath = path.join(destinoDir, qrNombre);
                    await fs.writeFile(qrPath, base64Data, 'base64');
                    console.log(`  ✅ [SCT] Código QR guardado: ${qrNombre}`);
                } else {
                    console.log('  ℹ️ [SCT] No se encontró imagen QR en ningún frame');
                }
            } catch (errorQR) {
                console.warn(`  ⚠️ [SCT] Error al guardar QR (continuando): ${errorQR.message}`);
            }
        }

        return {
            success: true,
            pdfDescargado: {
                nombre: nuevoNombre,
                path: destinoPath,
                datos: { nroVep, periodo, cuit, esConsolidado, cantidadSubVeps }
            },
            qrDescargado: qrPath ? { nombre: qrNombre, path: qrPath } : null
        };

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_12_descargarPdfCT:', error);
        return { success: false, message: error.message };
    } finally {
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
