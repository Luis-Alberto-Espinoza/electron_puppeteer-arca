/**
 * Paso: descargar TODOS los PDFs de la tabla de comprobantes.
 *
 * Problema con el approach naive: cada botón "Ver" tiene
 *   onclick="parent.location.href='imprimirComprobante.do?c=ID'"
 * lo que NAVEGA la pestaña padre. Si se clickean varios botones rápido,
 * el navegador cancela las navegaciones intermedias y solo se baja la
 * última (además se pierde la tabla porque la página se navegó).
 *
 * Solución:
 *   1. Recolectar TODOS los IDs de comprobante leyendo el atributo onclick
 *      ANTES de hacer cualquier click (parseando el patrón
 *      "imprimirComprobante.do?c=NNN").
 *   2. Para cada ID, disparar la descarga creando un <a> temporal con
 *      `href` absoluto y `download` apuntando a la URL. Eso le indica al
 *      navegador que es una descarga, no una navegación, y la tabla
 *      queda intacta entre clicks.
 *   3. Esperar a que aparezca un PDF nuevo (con tamaño estable) en la
 *      carpeta temporal antes de pasar al siguiente.
 *
 * Maneja el caso en que la tabla esté dentro de un iframe (recorre todos
 * los frames de la página buscando los botones).
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const os = require('os');

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * @param {import('puppeteer').Page} pageTabla
 * @returns {Promise<{ tempDir: string, pdfPaths: string[] }>}
 */
async function descargarPdfsDeTabla(pageTabla) {
    // 1. Carpeta temporal aislada
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'consulta-comprobantes-'));

    // 2. Habilitar descargas vía CDP en la página principal
    const client = await pageTabla.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: tempDir
    });

    // 3. Encontrar el frame que contiene los botones "Ver" y extraer IDs
    const { ids, baseHref } = await encontrarComprobantesEnFrames(pageTabla);

    if (ids.length === 0) {
        return { tempDir, pdfPaths: [] };
    }

    // 4. Descargar uno a uno
    const pdfPaths = [];
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const url = construirUrlAbsoluta(baseHref, `imprimirComprobante.do?c=${id}`);

        // Snapshot antes
        const antes = new Set(await fs.readdir(tempDir));

        // Disparar la descarga con <a download> — NO navega la pestaña
        await pageTabla.evaluate((u) => {
            const a = document.createElement('a');
            a.href = u;
            a.setAttribute('download', '');
            a.target = '_self';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { try { a.remove(); } catch (_) {} }, 500);
        }, url);

        const pdfNuevo = await esperarPdfNuevo(tempDir, antes, 60000);
        if (pdfNuevo) {
            pdfPaths.push(path.join(tempDir, pdfNuevo));
        } else {
            // Anomalía: vale la pena dejarla registrada.
            console.warn(`  ⚠️  No apareció PDF para c=${id} (timeout 60s)`);
        }

        // Pequeño respiro entre descargas para no saturar
        await esperar(300);
    }

    console.log(`  → ${pdfPaths.length}/${ids.length} PDF(s) descargado(s).`);
    return { tempDir, pdfPaths };
}

/**
 * Busca el primer frame (incluyendo el main) que contenga
 * `input[value='Ver']` y devuelve los IDs + la URL base del frame.
 *
 * Los IDs se parsean del atributo onclick:
 *   onclick="parent.location.href='imprimirComprobante.do?c=4809490262'"
 *
 * Como ese onclick usa `parent.location`, la URL relativa se resuelve
 * contra la URL del frame PADRE — que en este caso es la propia pageTabla
 * porque la tabla suele venir en un iframe directo. Si los botones están
 * en el main frame, el padre es él mismo. Devolvemos pageTabla.url() como
 * base (con el último segmento removido) para resolver el path relativo.
 */
async function encontrarComprobantesEnFrames(pageTabla) {
    const baseHref = pageTabla.url(); // padre real desde el punto de vista de "parent"

    for (const frame of pageTabla.frames()) {
        try {
            const info = await frame.evaluate(() => {
                const botones = document.querySelectorAll("input[type='button'][value='Ver']");
                if (botones.length === 0) return null;

                const ids = [];
                botones.forEach(b => {
                    const onclick = b.getAttribute('onclick') || '';
                    const m = onclick.match(/imprimirComprobante\.do\?c=(\d+)/i);
                    if (m) ids.push(m[1]);
                });

                return {
                    ids,
                    frameUrl: window.location.href
                };
            });

            if (info && info.ids && info.ids.length > 0) {
                return { ids: info.ids, baseHref, frameUrl: info.frameUrl };
            }
        } catch (_) {
            // frame detached / cross-origin → ignorar
        }
    }

    return { ids: [], baseHref, frameUrl: null };
}

/**
 * Resuelve una URL relativa contra una URL base.
 */
function construirUrlAbsoluta(baseHref, relativo) {
    try {
        return new URL(relativo, baseHref).toString();
    } catch (_) {
        return relativo;
    }
}

/**
 * Espera a que aparezca un archivo nuevo en `dir` que no esté en `archivosPrevios`,
 * terminado en .pdf y con tamaño estable.
 */
async function esperarPdfNuevo(dir, archivosPrevios, timeoutMs) {
    const inicio = Date.now();

    while (Date.now() - inicio < timeoutMs) {
        const actuales = await fs.readdir(dir);
        const nuevos = actuales.filter(f => !archivosPrevios.has(f));

        const pdfListo = nuevos.find(f => f.toLowerCase().endsWith('.pdf'));
        if (pdfListo) {
            const ruta = path.join(dir, pdfListo);
            try {
                const t1 = fsSync.statSync(ruta).size;
                await esperar(400);
                const t2 = fsSync.statSync(ruta).size;
                if (t1 > 0 && t1 === t2) return pdfListo;
            } catch (_) {
                // archivo aún en escritura/renombre; reintentar
            }
        }

        await esperar(400);
    }

    return null;
}

module.exports = { descargarPdfsDeTabla };
