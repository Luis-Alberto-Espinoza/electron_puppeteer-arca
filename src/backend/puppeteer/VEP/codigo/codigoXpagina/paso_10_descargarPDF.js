/**
 * PASO 10: Descargar PDF del VEP
 *
 * Descarga el volante electrónico de pago, extrae datos relevantes y lo guarda
 * con formato: VEP-{nroVep}_{cuit}_{medioPagoId}_{periodo}_{fechaDescarga}.pdf
 */

const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { getDownloadPath } = require('../../../../utils/fileManager.js');

async function extraerDatosDelPDF(pdfPath) {
    try {
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.js');

        const loadingTask = pdfjsLib.getDocument(pdfPath);
        const pdf = await loadingTask.promise;

        let allFilas = [];
        for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
            const page = await pdf.getPage(numPagina);
            const content = await page.getTextContent();

            const filasMap = new Map();
            content.items.forEach(item => {
                const y = item.transform[5];
                const yExistente = [...filasMap.keys()].find(key => Math.abs(y - key) <= 5);
                if (yExistente) {
                    filasMap.get(yExistente).push(item);
                } else {
                    filasMap.set(y, [item]);
                }
            });

            const filasDePagina = [...filasMap.entries()]
                .sort((a, b) => b[0] - a[0])
                .map(([y, filaItems]) => ({
                    y,
                    items: filaItems.sort((a, b) => a.transform[4] - b.transform[4])
                }));

            allFilas.push(...filasDePagina);
        }

        // Extraer Nro. VEP, Período y CUIT
        let nroVep = null;
        let periodo = null;
        let cuit = null;

        for (const fila of allFilas) {
            for (let i = 0; i < fila.items.length; i++) {
                const item = fila.items[i];
                const texto = item.str.trim();

                // Buscar Nro. VEP
                if (!nroVep && (texto.includes('Nro. VEP:') || texto.includes('Nro.VEP:'))) {
                    for (let j = i + 1; j < fila.items.length; j++) {
                        const valor = fila.items[j].str.trim();
                        if (valor && /^\d+$/.test(valor)) {
                            nroVep = valor;
                            break;
                        }
                    }
                }

                // Buscar Período
                if (!periodo && (texto.includes('Período:') || texto.includes('Periodo:'))) {
                    for (let j = i + 1; j < fila.items.length; j++) {
                        const valor = fila.items[j].str.trim();
                        if (valor && /^\d{4}-\d{2}$/.test(valor)) {
                            periodo = valor;
                            break;
                        }
                    }
                }

                // Buscar CUIT
                if (!cuit && texto.toUpperCase() === 'CUIT:') {
                    for (let j = i + 1; j < fila.items.length; j++) {
                        const valor = fila.items[j].str.trim();
                        const cuitMatch = valor.match(/\d{2}-?\d{8}-?\d/);
                        if (cuitMatch) {
                            cuit = cuitMatch[0].replace(/-/g, '');
                            break;
                        }
                    }
                }
            }

            // Si ya encontramos todo, salir
            if (nroVep && periodo && cuit) break;
        }

        return { nroVep, periodo, cuit };

    } catch (error) {
        console.error(`  ❌ Error al extraer datos del PDF:`, error);
        return { nroVep: null, periodo: null, cuit: null };
    }
}

async function ejecutar(page, usuario, medioPago, downloadsPath) {
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

        // 3. Buscar y hacer click en botón PDF
        const botonEncontrado = await page.evaluate(() => {
            const spans = Array.from(document.querySelectorAll('span.material-icons'));
            const pdfIcon = spans.find(span => span.textContent.trim() === 'picture_as_pdf');
            return pdfIcon ? true : false;
        });

        if (!botonEncontrado) {
            throw new Error('No se encontró el botón de descarga PDF');
        }

        const clickRealizado = await page.evaluate(() => {
            const spans = Array.from(document.querySelectorAll('span.material-icons'));
            const pdfIcon = spans.find(span => span.textContent.trim() === 'picture_as_pdf');
            if (pdfIcon) {
                const elemento = pdfIcon.closest('a') || pdfIcon;
                elemento.click();
                return true;
            }
            return false;
        });

        if (!clickRealizado) {
            throw new Error('No se pudo hacer click en el botón PDF');
        }

        // 4. Esperar descarga
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 5. Buscar archivo descargado
        const archivos = await fs.readdir(tempDir);

        if (archivos.length === 0) {
            throw new Error('No se descargó ningún archivo PDF');
        }

        const pdfDescargado = archivos[0];
        const pdfPath = path.join(tempDir, pdfDescargado);

        // 6. Extraer datos del PDF
        const { nroVep, periodo, cuit } = await extraerDatosDelPDF(pdfPath);

        // 7. Generar nombre y mover archivo
        const fechaDescarga = new Date().toISOString().slice(0, 10);
        const nuevoNombre = `VEP-${nroVep || 'SinNumero'}_${cuit || usuario.cuit}_${medioPago.id}_${periodo || 'SinPeriodo'}_${fechaDescarga}.pdf`;

        const destinoDir = getDownloadPath(downloadsPath, usuario.nombre, 'archivos_afip');
        const destinoPath = path.join(destinoDir, nuevoNombre);

        await fs.rename(pdfPath, destinoPath);

        console.log(`  ✅ PDF descargado: ${nuevoNombre}`);
        console.log(`     Nro. VEP: ${nroVep || 'N/A'} | Período: ${periodo || 'N/A'} | CUIT: ${cuit || 'N/A'}`);

        return {
            success: true,
            message: 'PDF del VEP descargado y procesado correctamente',
            pdfPath: destinoPath,
            pdfNombre: nuevoNombre,
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
