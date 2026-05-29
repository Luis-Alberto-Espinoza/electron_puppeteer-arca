/**
 * Parser de PDFs de Comprobantes AFIP (Factura A/B/C).
 *
 * Usa pdfjs-dist para obtener los text items con su posición (x/y).
 * Agrupa por Y (filas visuales) y por X dentro de cada fila.
 *
 * Esto es necesario porque el texto extraído como flujo lineal sale
 * desordenado para este layout (labels en un bloque, valores en otro).
 *
 * Campos extraídos:
 *   - puntoDeVenta        (ej. "00001")
 *   - comprobanteNumero   (ej. "00000040")
 *   - periodoDesde        (ej. "01/03/2026")
 *   - periodoHasta        (ej. "31/03/2026")
 *   - cuitReceptor        (CUIT del cliente, ej. "20327514718")
 *   - razonSocialReceptor (ej. "MAURINO JUAN JOSE")
 *   - importeTotal        (número, ej. 600000)
 *   - fechaEmision        (ej. "30/04/2026") — útil aunque no fue pedido
 */

const path = require('path');

async function parsearComprobantePdf(pdfPath) {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(
        process.cwd(),
        'node_modules/pdfjs-dist/build/pdf.worker.js'
    );

    const loadingTask = pdfjsLib.getDocument(pdfPath);
    const pdf = await loadingTask.promise;

    // Solo la primera página: ORIGINAL contiene todo. DUPLICADO/TRIPLICADO son copias.
    const pagina = await pdf.getPage(1);
    const content = await pagina.getTextContent();

    // Agrupar items por Y (tolerancia 3 puntos para considerar misma fila)
    const filasMap = new Map();
    content.items.forEach(item => {
        const y = Math.round(item.transform[5]);
        const yExistente = [...filasMap.keys()].find(k => Math.abs(y - k) <= 3);
        const claveY = yExistente !== undefined ? yExistente : y;
        if (!filasMap.has(claveY)) filasMap.set(claveY, []);
        filasMap.get(claveY).push(item);
    });

    // Filas ordenadas: arriba → abajo (mayor Y → menor Y en pdf coordinates)
    // y dentro de cada fila, items ordenados izquierda → derecha (menor X → mayor X)
    const filas = [...filasMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([y, items]) => ({
            y,
            items: items.sort((a, b) => a.transform[4] - b.transform[4]),
            texto: items
                .sort((a, b) => a.transform[4] - b.transform[4])
                .map(i => i.str)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
        }))
        .filter(f => f.texto.length > 0);

    // === Helpers ===
    const buscarFila = (regex) => filas.find(f => regex.test(f.texto));
    const buscarValorEnFila = (fila, regex) => fila?.texto.match(regex)?.[1] || null;

    const datos = {
        puntoDeVenta: null,
        comprobanteNumero: null,
        periodoDesde: null,
        periodoHasta: null,
        fechaEmision: null,
        cuitReceptor: null,
        razonSocialReceptor: null,
        importeTotal: null
    };

    // === Punto de Venta y Comp. Nro (mismo renglón inline) ===
    const filaPtoVenta = buscarFila(/Punto\s+de\s+Venta:\s*\d+/i);
    if (filaPtoVenta) {
        datos.puntoDeVenta = buscarValorEnFila(filaPtoVenta, /Punto\s+de\s+Venta:\s*(\d{3,6})/i);
        datos.comprobanteNumero = buscarValorEnFila(filaPtoVenta, /Comp\.?\s*Nro:?\s*(\d{4,8})/i);
    }

    // === Período Facturado Desde / Hasta ===
    // Robusto a que pdfjs parta la línea "Período Facturado Desde: <fecha>
    // Hasta: <fecha> Fecha de Vto..." en varias filas visuales, y a que la
    // etiqueta y la fecha vengan en el mismo item o en items separados.
    const fechaRe = /(\d{2}\/\d{2}\/\d{4})/;
    const itemsCrudos = content.items.map(it => ({
        str: it.str || '',
        x: it.transform[4],
        y: it.transform[5]
    }));

    // Devuelve la fecha asociada a una etiqueta ("Desde" / "Hasta"):
    //   a) en el mismo item ("Desde: 01/03/2026"), o
    //   b) en el primer item a su derecha en la misma línea (±6 pt en Y).
    const fechaDeEtiqueta = (etiqueta) => {
        const etiquetaRe = new RegExp(etiqueta, 'i');
        const label = itemsCrudos.find(it => etiquetaRe.test(it.str));
        if (!label) return null;

        const despues = label.str.slice(label.str.search(etiquetaRe));
        const mismoItem = despues.match(fechaRe);
        if (mismoItem) return mismoItem[1];

        const aLaDerecha = itemsCrudos
            .filter(it => it.x > label.x && Math.abs(it.y - label.y) <= 6 && fechaRe.test(it.str))
            .sort((a, b) => a.x - b.x)[0];
        return aLaDerecha ? aLaDerecha.str.match(fechaRe)[1] : null;
    };

    datos.periodoDesde = fechaDeEtiqueta('Desde');
    datos.periodoHasta = fechaDeEtiqueta('Hasta');

    // Fallback: si no se ubicaron por etiqueta, usar las 2 primeras fechas de
    // la fila "Período Facturado".
    if (!datos.periodoDesde || !datos.periodoHasta) {
        const filaPeriodo = buscarFila(/Per[ií]odo\s+Facturado/i);
        const fechas = filaPeriodo?.texto.match(/\d{2}\/\d{2}\/\d{4}/g);
        if (fechas && fechas.length >= 2) {
            datos.periodoDesde = datos.periodoDesde || fechas[0];
            datos.periodoHasta = datos.periodoHasta || fechas[1];
        }
    }

    // === Fecha de Emisión ===
    const filaFechaEmi = buscarFila(/Fecha\s+de\s+Emisi[óo]n/i);
    if (filaFechaEmi) {
        datos.fechaEmision = buscarValorEnFila(filaFechaEmi, /(\d{2}\/\d{2}\/\d{4})/);
    }

    // === CUIT del receptor (línea con "CUIT:" y valor de 11 dígitos) ===
    // Recorrer todas las filas que tengan "CUIT:" + 11 dígitos.
    // La fila del receptor también contiene "Apellido y Nombre / Razón Social:" en el mismo
    // renglón visual, así la podemos distinguir de la del emisor.
    let filaReceptor = filas.find(f =>
        /CUIT:\s*\d{11}/.test(f.texto) && /Apellido\s+y\s+Nombre|Raz[óo]n\s+Social/i.test(f.texto)
    );
    if (!filaReceptor) {
        // Fallback: cualquier fila con "CUIT: NNNNNNNNNNN" inline
        filaReceptor = filas.find(f => /CUIT:\s*\d{11}/.test(f.texto));
    }
    if (filaReceptor) {
        datos.cuitReceptor = buscarValorEnFila(filaReceptor, /CUIT:\s*(\d{11})/);

        // Razón social: lo que está después de "Apellido y Nombre / Razón Social:"
        // en la misma fila.
        const nombreInline = filaReceptor.texto.match(
            /Apellido\s+y\s+Nombre\s*\/?\s*Raz[óo]n\s+Social:\s*(.+?)(?:\s+Domicilio|$)/i
        );
        if (nombreInline) {
            datos.razonSocialReceptor = nombreInline[1].trim();
        }
    }

    // Si todavía no hay razón social, buscarla por posición usando los items de
    // la fila del receptor (a la derecha de la columna del label).
    if (filaReceptor && !datos.razonSocialReceptor) {
        const items = filaReceptor.items;
        const idxLabel = items.findIndex(it => /Apellido\s+y\s+Nombre|Raz[óo]n\s+Social/i.test(it.str));
        if (idxLabel >= 0) {
            const xLabel = items[idxLabel].transform[4];
            const xDomicilio = (() => {
                const idxDom = items.findIndex(it => /Domicilio:/i.test(it.str));
                return idxDom >= 0 ? items[idxDom].transform[4] : Infinity;
            })();
            const trozos = items
                .filter(it => it.transform[4] > xLabel + 5 && it.transform[4] < xDomicilio - 5)
                .map(it => it.str.trim())
                .filter(s => s && !/Apellido|Raz[óo]n|Social/i.test(s));
            if (trozos.length > 0) {
                datos.razonSocialReceptor = trozos.join(' ').replace(/\s+/g, ' ').trim();
            }
        }
    }

    // === Importe Total ===
    // El bloque de totales tiene: "Subtotal: $ <num>" / "Importe Otros Tributos: $ <num>" /
    // "Importe Total: $ <num>". Cada uno está en su propia fila.
    const filaTotal = buscarFila(/Importe\s+Total/i);
    if (filaTotal) {
        // Busca el último número con formato 12345,67 o 12.345,67 en la fila
        const matches = filaTotal.texto.match(/[\d.]+,\d{2}/g);
        if (matches && matches.length > 0) {
            datos.importeTotal = parseMoneda(matches[matches.length - 1]);
        }
    }

    return datos;
}

/**
 * Convierte una string monetaria estilo AR ("600.000,00" o "600000,00") a number.
 */
function parseMoneda(str) {
    if (!str) return null;
    const limpio = String(str).replace(/\./g, '').replace(',', '.');
    const num = parseFloat(limpio);
    return isNaN(num) ? null : num;
}

module.exports = { parsearComprobantePdf };
