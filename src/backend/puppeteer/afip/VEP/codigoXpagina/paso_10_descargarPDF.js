/**
 * PASO 10: Descargar PDF del VEP
 *
 * Descarga el volante electrónico de pago, extrae datos relevantes y lo guarda
 * con formato: VEP-{nroVep}_{cuit}_{medioPagoId}_{periodo}_{fechaDescarga}.pdf
 *
 * La extracción de metadatos y el nombrado/movido viven en _pdfComun.js (los
 * comparte con paso_10b, la variante para XN Group).
 */

const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { construirNombreYMover } = require('./_pdfComun.js');
const paso_10b_descargarXNGroup = require('./paso_10b_descargarXNGroup.js');

/**
 * Espera a que la descarga termine en `tempDir` y devuelve el nombre del
 * archivo listo. Chrome baja primero un parcial `.crdownload`; con un setTimeout
 * fijo (lo que había antes) en máquinas lentas o con VEPs consolidados (más
 * pesados) el archivo todavía no estaba o se agarraba el parcial → "se cuelga /
 * no guarda". Acá hacemos polling hasta que aparezca un archivo SIN extensión
 * temporal, con timeout real.
 */
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

async function ejecutar(page, usuario, medioPago, downloadsPath) {
    // XN Group: AFIP genera el PDF de "Descargar VEP" SIN las barras del código
    // de barras (sólo los números) — es un bug de AFIP. La vista "Ver Detalle"
    // sí las dibuja, así que para ese medio descargamos por otra vía (paso_10b)
    // y salimos.
    if (medioPago && medioPago.id === 'xn_group') {
        return await paso_10b_descargarXNGroup.ejecutar(page, usuario, medioPago, downloadsPath);
    }

    let tempDir = null;

    try {
        console.log("  → Descargando PDF del VEP...");

        // 1. Crear directorio temporal
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vep-pdf-'));

        // 2. Configurar descarga programática
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: tempDir
        });

        // 3. Buscar y hacer click en el botón de descarga.
        // UI nueva de AFIP/ARCA: ya no es el ícono material "picture_as_pdf",
        // ahora es un <button> con el texto "Descargar VEP".
        const clickRealizado = await page.evaluate(() => {
            const texto = (el) => (el.textContent || '').trim().toLowerCase();

            // Buscamos en botones y links
            const candidatos = Array.from(document.querySelectorAll('button, a'));

            // Preferimos "descargar vep"; si no, cualquier "descargar"
            const boton = candidatos.find(el => texto(el).includes('descargar vep'))
                       || candidatos.find(el => texto(el).includes('descargar'));

            if (boton) {
                boton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                boton.click();
                return true;
            }
            return false;
        });

        if (!clickRealizado) {
            throw new Error('No se encontró el botón de descarga PDF ("Descargar VEP")');
        }

        // 4. Esperar a que la descarga termine (polling, no setTimeout fijo).
        const pdfDescargado = await esperarArchivoListo(tempDir, 30000);
        if (!pdfDescargado) {
            throw new Error('La descarga del PDF no se completó en el tiempo esperado');
        }

        const pdfPath = path.join(tempDir, pdfDescargado);

        // 5. Extraer metadatos, armar nombre estandarizado y mover a
        //    archivos_afip/<cliente>/ (lógica compartida con paso_10b).
        const { nuevoNombre, destinoPath, destinoDir, datos } =
            await construirNombreYMover(pdfPath, { usuario, medioPago, downloadsPath });
        const { nroVep, periodo, cuit } = datos;

        console.log(`  ✅ PDF descargado: ${nuevoNombre}`);
        console.log(`     Nro. VEP: ${nroVep || 'N/A'} | Período: ${periodo || 'N/A'} | CUIT: ${cuit || 'N/A'}`);

        // 6. Detectar y descargar código QR (si existe)
        let qrPath = null;
        let qrNombre = null;

        try {
            console.log("  → Verificando si existe código QR en la página...");

            const qrData = await page.evaluate(() => {
                // Cualquier <img> embebida como data URL (AFIP a veces rotula
                // mal el mime: dice "image/png" pero el contenido es JPEG).
                const imagenes = Array.from(document.querySelectorAll('img'));
                const imgQR = imagenes.find(img =>
                    img.src && /^data:image\/[a-z]+;base64,/i.test(img.src)
                );

                return imgQR ? imgQR.src : null;
            });

            if (qrData) {
                console.log("  → Código QR detectado. Descargando...");

                // Sacar el prefijo "data:image/...;base64," y limpiar espacios
                // (el src de AFIP trae un espacio después de la coma).
                const base64Data = qrData
                    .replace(/^data:image\/[a-z]+;base64,/i, '')
                    .replace(/\s/g, '');

                // Detectar el formato REAL por los magic bytes del base64,
                // no por el mime declarado (que viene mal).
                let extension = '.png';
                if (base64Data.startsWith('/9j/')) {
                    extension = '.jpg';          // JPEG
                } else if (base64Data.startsWith('iVBOR')) {
                    extension = '.png';          // PNG
                } else if (base64Data.startsWith('R0lGOD')) {
                    extension = '.gif';          // GIF
                }

                // Mismo nombre que el PDF pero con la extensión real de la imagen
                qrNombre = nuevoNombre.replace(/\.pdf$/i, extension);
                qrPath = path.join(destinoDir, qrNombre);

                // Guardar imagen
                await fs.writeFile(qrPath, base64Data, 'base64');

                console.log(`  ✅ Código QR descargado: ${qrNombre}`);
            } else {
                console.log("  ℹ️ No se encontró código QR en la página");
            }
        } catch (errorQR) {
            console.error("  ⚠️ Error al descargar QR (continuando):", errorQR.message);
        }

        return {
            success: true,
            message: 'PDF del VEP descargado y procesado correctamente',
            pdfPath: destinoPath,
            pdfNombre: nuevoNombre,
            qrPath: qrPath,
            qrNombre: qrNombre,
            datosExtraidos: { nroVep, periodo, cuit }
        };

    } catch (error) {
        console.error("  ❌ Error en paso_10_descargarPDF:", error);
        return {
            success: false,
            message: error.message,
            stack: error.stack
        };
    } finally {
        // Limpiar directorio temporal
        if (tempDir) {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (err) {
                console.error(`  ⚠️ Error al eliminar directorio temporal: ${err.message}`);
            }
        }
    }
}

module.exports = { ejecutar };
