const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/build/pdf.js');

async function readPdfContentWithCoords(filePath) {
    // Configuración dinámica de la ruta del worker de PDF.js
    // Intentar resolver usando require.resolve para obtener la instalación real en node_modules
    // (require.resolve funciona en dev y empaquetado; no usar rutas armadas a mano)
    const workerPath = require.resolve('pdfjs-dist/build/pdf.worker.js');
    if (!fs.existsSync(workerPath)) {
      throw new Error(`El archivo worker de PDF.js no se encuentra en la ruta esperada: ${workerPath}`);
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
    pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts/');

    console.log(`Iniciando lectura de contenido en bruto para: ${filePath}`);

    try {
        // Bytes en vez de ruta: con la ruta la extracción sale vacía en el portable de Windows.
        const data = new Uint8Array(await fs.promises.readFile(filePath));
        const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
        const pdf = await loadingTask.promise;
        let allItems = [];

        for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
            const page = await pdf.getPage(numPagina);
            const content = await page.getTextContent();
            
            allItems.push({
                page: numPagina,
                items: content.items.map(item => ({
                    str: item.str,
                    x: item.transform[4],
                    y: item.transform[5],
                    width: item.width,
                    height: item.height,
                    fontName: item.fontName
                }))
            });
        }
        return allItems;
    } catch (error) {
        console.error(`Error al leer el PDF en bruto: ${error.message}`);
        return null;
    }
}

// Bloque de ejecución por consola
if (require.main === module) {
    (async () => {
        const filePathArg = process.argv[2];
        if (!filePathArg) {
            console.error("Error: Debes proporcionar la ruta a un archivo PDF como argumento.");
            console.log("Uso: node src/backend/utils/pdfRawReader.js <ruta_al_pdf>");
            return;
        }

        const filePath = path.resolve(filePathArg);
        console.log("\n--- MODO LECTOR PDF EN BRUTO ---");
        
        const content = await readPdfContentWithCoords(filePath);

        if (content) {
            const outputFileName = path.basename(filePath, '.pdf') + '.json';
            const outputPath = path.join(path.dirname(filePath), outputFileName);
            fs.writeFileSync(outputPath, JSON.stringify(content, null, 2), 'utf8');
            console.log(`✓ Contenido del PDF en bruto guardado en: ${outputPath}`);
        } else {
            console.error('\n❌ Fallo al leer el PDF.');
        }
    })();
}

module.exports = { readPdfContentWithCoords };
