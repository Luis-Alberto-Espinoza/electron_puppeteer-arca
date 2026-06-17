// _pdfComun.js (VEP)
// Helpers compartidos entre paso_10 (descarga normal del VEP) y
// paso_10b (descarga del VEP completo para XN Group vía "Ver Detalle").
//
//   - extraerDatosDelPDF(pdfPath): parsea el PDF con pdfjs y devuelve
//     { nroVep, periodo, cuit }.
//   - construirNombreYMover(srcPath, ctx): extrae metadatos, arma el nombre
//     estandarizado (VEP-<nro>_<cuit>_<medio>_<periodo>_<fecha>.pdf) y mueve el
//     PDF a archivos_afip/<cliente>/.
//
// Se separó en su propio módulo (espejando el _pdfComun.js del SCT) para que
// paso_10 y paso_10b lo reusen sin duplicar la extracción ni el nombrado.

const fs = require('fs/promises');
const path = require('path');
const { getDownloadPath, moverArchivo } = require('../../../../utils/fileManager.js');

// ============================================================
// EXTRACCIÓN DE METADATOS DEL PDF
// ============================================================

async function extraerDatosDelPDF(pdfPath) {
    try {
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        // require.resolve ubica el worker tanto en dev como empaquetado en
        // app.asar. NO usar process.cwd(): en el portable de Windows apunta a
        // donde se lanzó el .exe, no a la app.
        pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

        // Pasar los bytes (no la ruta): getDocument(string) trata el argumento
        // como URL y una ruta Windows ("C:\...") rompe el parseo. verbosity:0
        // silencia los warnings de fuentes (no hacen falta para extraer texto).
        const data = new Uint8Array(await fs.readFile(pdfPath));
        const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
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
        // Un VEP que agrupa varios períodos es "consolidado": no trae línea
        // "Período:" sino "Concepto: VEP CONSOLIDADO" / "Nro. VEP Consolidado:".
        let esConsolidado = false;

        for (const fila of allFilas) {
            for (let i = 0; i < fila.items.length; i++) {
                const item = fila.items[i];
                const texto = item.str.trim();

                // Detectar si el VEP es consolidado (varios períodos)
                if (!esConsolidado && /consolidado/i.test(texto)) {
                    esConsolidado = true;
                }

                // Buscar Nro. VEP (cubre "Nro. VEP:" y "Nro. VEP Consolidado:")
                if (!nroVep && (texto.includes('Nro. VEP') || texto.includes('Nro.VEP'))) {
                    // Caso A: el número viene en el mismo item ("...: 1633556137")
                    const mismoItem = texto.match(/(\d{6,})\s*$/);
                    if (mismoItem) {
                        nroVep = mismoItem[1];
                    } else {
                        // Caso B: el número viene en items siguientes de la misma fila
                        for (let j = i + 1; j < fila.items.length; j++) {
                            const valor = fila.items[j].str.trim();
                            if (valor && /^\d+$/.test(valor)) {
                                nroVep = valor;
                                break;
                            }
                        }
                    }
                }

                // Buscar Período (solo existe en VEPs de un único período)
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

            // Si ya encontramos todo lo de un VEP simple, salir
            if (nroVep && periodo && cuit) break;
        }

        // Si es consolidado y no hubo línea de período, usamos "consolidado"
        if (!periodo && esConsolidado) {
            periodo = 'consolidado';
        }

        return { nroVep, periodo, cuit };

    } catch (error) {
        console.error(`  ❌ Error al extraer datos del PDF:`, error);
        return { nroVep: null, periodo: null, cuit: null };
    }
}

// ============================================================
// NOMBRADO + MOVIDO ESTANDARIZADO
// ============================================================

/**
 * Extrae los metadatos del PDF, arma el nombre estandarizado
 * (VEP-<nroVep>_<cuit>_<medio>_<periodo>_<fecha>.pdf) y lo mueve a
 * archivos_afip/<cliente>/. Devuelve datos y rutas para que el llamador siga
 * (ej.: guardar el QR en el mismo destinoDir).
 *
 * @param {string} srcPath  PDF de origen (en un tempdir).
 * @param {Object} ctx { usuario, medioPago, downloadsPath }
 */
async function construirNombreYMover(srcPath, { usuario, medioPago, downloadsPath }) {
    const { nroVep, periodo, cuit } = await extraerDatosDelPDF(srcPath);

    const fechaDescarga = new Date().toISOString().slice(0, 10);
    const nuevoNombre = `VEP-${nroVep || 'SinNumero'}_${cuit || usuario.cuit}_${medioPago.id}_${periodo || 'SinPeriodo'}_${fechaDescarga}.pdf`;

    const destinoDir = getDownloadPath(downloadsPath, {
        cuit: usuario.cuit,
        nombre: usuario.nombre,
        apellido: usuario.apellido
    }, 'archivos_afip');
    const destinoPath = path.join(destinoDir, nuevoNombre);

    await moverArchivo(srcPath, destinoPath);

    return { nuevoNombre, destinoPath, destinoDir, datos: { nroVep, periodo, cuit } };
}

module.exports = { extraerDatosDelPDF, construirNombreYMover };
