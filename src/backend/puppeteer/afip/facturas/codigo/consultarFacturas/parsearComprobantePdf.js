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

const fs = require('fs/promises');

async function parsearComprobantePdf(pdfPath) {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    // require.resolve encuentra el worker tanto en dev (node_modules suelto)
    // como empaquetado dentro de app.asar. NO usar process.cwd(): en el
    // portable de Windows apunta a donde se lanzó el .exe, no a la app.
    pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

    // Pasar los bytes en vez de la ruta: getDocument(string) trata el argumento
    // como URL y una ruta Windows ("C:\...") rompe el parseo. Leyéndola nosotros
    // funciona igual en Windows, Linux y empaquetado.
    const data = new Uint8Array(await fs.readFile(pdfPath));
    // verbosity: 0 (ERRORS) silencia los warnings de "fetchStandardFontData":
    // pdfjs no encuentra las fuentes, pero para extraer TEXTO no las necesita.
    const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
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
        tipoComprobante: null,
        puntoDeVenta: null,
        comprobanteNumero: null,
        periodoDesde: null,
        periodoHasta: null,
        fechaEmision: null,
        cuitReceptor: null,
        razonSocialReceptor: null,
        netoGravado: null,
        iva0: null,
        iva25: null,
        iva5: null,
        iva105: null,
        iva21: null,
        iva27: null,
        otrosTributos: null,
        importeTotal: null,
        fechaVtoPago: null,
        condicionIvaEmisor: null,
        condicionIvaReceptor: null,
        condicionVenta: null,
        descripciones: []
    };

    // === Tipo de Comprobante ===
    // AFIP imprime la CLASE de documento ("FACTURA", "NOTA DE CRÉDITO"...) y, en
    // un recuadro central, la LETRA (A/B/C/E/M/T) con su "Cód. NN". Combinamos
    // clase + letra → "Factura B", "Nota de Crédito C". Si no se reconoce la
    // clase, caemos al "Cód. NN" como discriminador crudo.
    //
    // OJO: extracción best-effort (no validada contra un PDF de cada tipo). Si
    // algún tipo sale mal, ajustar las frases/letra acá.
    const textoCompleto = filas.map(f => f.texto).join('  ');

    // Letra: primer item aislado de un solo carácter del set válido.
    const letraComprobante = content.items
        .map(it => (it.str || '').trim())
        .find(s => /^[ABCEMT]$/.test(s)) || null;

    // Clase de documento: de la frase MÁS LARGA a la más corta, para no cortar
    // "FACTURA" dentro de "FACTURA DE CRÉDITO ELECTRÓNICA".
    const CLASES = [
        [/FACTURA\s+DE\s+CR[ÉE]DITO\s+ELECTR[ÓO]NICA/i, 'Factura de Crédito Electrónica MiPyMEs (FCE)'],
        [/NOTA\s+DE\s+D[ÉE]BITO\s+ELECTR[ÓO]NICA/i,     'Nota de Débito Electrónica MiPyMEs (FCE)'],
        [/NOTA\s+DE\s+CR[ÉE]DITO\s+ELECTR[ÓO]NICA/i,    'Nota de Crédito Electrónica MiPyMEs (FCE)'],
        [/FACTURA\s+DE\s+EXPORTACI[ÓO]N/i,              'Factura de Exportación'],
        [/NOTA\s+DE\s+D[ÉE]BITO\s+POR\s+OPERACIONES/i,  'Nota de Débito por Operaciones con el Exterior'],
        [/NOTA\s+DE\s+CR[ÉE]DITO\s+POR\s+OPERACIONES/i, 'Nota de Crédito por Operaciones con el Exterior'],
        [/COMPROBANTE\s+DE\s+COMPRA\s+DE\s+BIENES\s+USADOS/i, 'Comprobante de Compra de Bienes Usados'],
        [/NOTA\s+DE\s+CR[ÉE]DITO/i,                     'Nota de Crédito'],
        [/NOTA\s+DE\s+D[ÉE]BITO/i,                      'Nota de Débito'],
        [/RECIBO/i,                                     'Recibo'],
        [/FACTURA/i,                                    'Factura'],
    ];
    let claseDoc = null;
    for (const [re, nombre] of CLASES) {
        if (re.test(textoCompleto)) { claseDoc = nombre; break; }
    }

    if (claseDoc) {
        // "Comprobante de Compra de Bienes Usados" no lleva letra.
        datos.tipoComprobante = letraComprobante ? `${claseDoc} ${letraComprobante}` : claseDoc;
    } else {
        const cod = textoCompleto.match(/C[óo]d\.?\s*0*(\d{1,3})/i);
        datos.tipoComprobante = cod ? `Cód. ${cod[1]}` : null;
    }

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

    // === Desglose impositivo (puede o no aparecer según el comprobante) ===
    // Cada concepto es su propia fila: "Importe Neto Gravado: $ 95.000,00",
    // "IVA 21%: $ 19.950,00", etc. Si la fila no existe (ej. Factura B/C no
    // discrimina IVA), el campo queda null y en el Excel sale vacío.
    // Las regex de IVA son específicas por alícuota para no confundir
    // "IVA 5%" con "IVA 2.5%" / "IVA 10.5%" / "IVA 21%".
    const montoPorLabel = (regex) => {
        const fila = buscarFila(regex);
        if (!fila) return null;
        const nums = fila.texto.match(/[\d.]+,\d{2}/g);
        return nums && nums.length ? parseMoneda(nums[nums.length - 1]) : null;
    };

    datos.netoGravado   = montoPorLabel(/Importe\s+Neto\s+Gravado/i);
    datos.iva0          = montoPorLabel(/IVA\s*0\s*%/i);
    datos.iva25         = montoPorLabel(/IVA\s*2[.,]5\s*%/i);
    datos.iva5          = montoPorLabel(/IVA\s*5\s*%/i);
    datos.iva105        = montoPorLabel(/IVA\s*10[.,]5\s*%/i);
    datos.iva21         = montoPorLabel(/IVA\s*21\s*%/i);
    datos.iva27         = montoPorLabel(/IVA\s*27\s*%/i);
    datos.otrosTributos = montoPorLabel(/Importe\s+Otros\s+Tributos/i);

    // === Fecha de Vto. para el pago ===
    // OJO: NO confundir con "Fecha de Vto. de CAE" (al pie). El sufijo
    // "para el pago" la distingue.
    const filaVtoPago = buscarFila(/Fecha\s+de\s+Vto\.?\s+para\s+el\s+pago:/i);
    if (filaVtoPago) {
        datos.fechaVtoPago = buscarValorEnFila(filaVtoPago, /para\s+el\s+pago:\s*(\d{2}\/\d{2}\/\d{4})/i);
    }

    // === Condición frente al IVA (emisor y receptor) ===
    // La etiqueta aparece DOS veces: primero la del EMISOR (más arriba) y
    // luego la del RECEPTOR. Las tomamos en orden vertical (arriba → abajo).
    // Cortamos el valor antes de la etiqueta que le sigue en el mismo renglón.
    const valorCondIva = (texto) =>
        texto.match(/Condici[oó]n\s+frente\s+al\s+IVA:\s*(.+?)(?:\s+Fecha\s+de\s+Inicio|\s+Domicilio|$)/i)?.[1]?.trim() || null;
    const filasCondIva = filas.filter(f => /Condici[oó]n\s+frente\s+al\s+IVA:/i.test(f.texto));
    if (filasCondIva[0]) datos.condicionIvaEmisor = valorCondIva(filasCondIva[0].texto);
    if (filasCondIva[1]) datos.condicionIvaReceptor = valorCondIva(filasCondIva[1].texto);

    // === Condición de venta ===
    // Puede venir seguida del comprobante asociado ("... Contado NC A: 00006-00000002"
    // / "... Contado Fac. A: 00006-00000045"); cortamos antes de ese token.
    const filaCondVenta = buscarFila(/Condici[oó]n\s+de\s+venta:/i);
    if (filaCondVenta) {
        datos.condicionVenta = filaCondVenta.texto
            .match(/Condici[oó]n\s+de\s+venta:\s*(.+?)(?:\s+(?:NC|ND|Fac\.)\s+[A-Z]:|$)/i)?.[1]?.trim() || null;
    }

    // === Ítems de la tabla (descripción + subtotal por ítem, posicional) ===
    // Cada ítem = su descripción (que puede wrapear en varias filas) + su subtotal
    // (columna "Subtotal"). Lo usa la generación de Notas para emitir una línea por
    // ítem con su importe real. `descripciones` (texto plano por ítem) se deriva de
    // acá; si no se detectan ítems, cae al extractor viejo por renglón visual.
    datos.items = extraerItems(content.items);
    datos.descripciones = datos.items.length
        ? datos.items.map(i => i.descripcion)
        : extraerDescripciones(content.items);

    return datos;
}

/**
 * Extrae los ítems de la tabla de detalle con su importe (subtotal) por ítem.
 *
 * Layout de AFIP (comprobante impreso): headers "Producto / Servicio | Cantidad |
 * ... | Precio Unit. | ... | Subtotal". Los números de cada ítem (cantidad,
 * precio, subtotal) aparecen en UNA fila cerca del TOPE del ítem (apenas debajo
 * de su primera línea de descripción), y la descripción sigue wrapeando hacia
 * abajo. Por eso:
 *   - "anchor" de un ítem = fila con un monto en la banda X de "Subtotal".
 *   - su descripción = las líneas de la banda "Producto/Servicio" que caen entre
 *     el inicio de este ítem (línea justo encima del anchor) y el del siguiente.
 *
 * @param {Array} items - content.items crudos de pdfjs (con transform).
 * @returns {Array<{descripcion: string, importe: number|null, precioUnitario: number|null}>}
 */
function extraerItems(items) {
    const norm = items
        .map(it => ({ s: (it.str || '').trim(), x: it.transform[4], y: it.transform[5] }))
        .filter(it => it.s);

    const prod = norm.find(it => /Producto\s*\/\s*Servicio/i.test(it.s) || /^Producto$/i.test(it.s));
    if (!prod) return [];
    const headerY = prod.y;

    // X de cada header (en el mismo renglón del header de Producto).
    const xDe = (re, fallback) => {
        const h = norm.find(it => Math.abs(it.y - headerY) <= 4 && re.test(it.s));
        return h ? h.x : fallback;
    };
    const xCantidad = xDe(/Cantidad/i, prod.x + 150);
    const xSubtotal = xDe(/Subtotal/i, prod.x + 460);
    const xPrecio = xDe(/Precio/i, null);
    const xBonif = xDe(/Bonif/i, null);

    const xIniDesc = prod.x - 8;
    const xFinDesc = xCantidad - 8;
    // Banda de "Subtotal" acotada por ambos lados: en Factura A hay columnas a la
    // derecha (Importe IVA, Subtotal c/IVA) que NO queremos agarrar.
    const xSubMin = xSubtotal - 25;
    const xSubMax = xSubtotal + 60;

    // Límite inferior: bloque de totales (mismo criterio que extraerDescripciones).
    const totalesY = norm
        .filter(it => it.y < headerY && /^(Subtotal:|Importe\s+(Neto|Otros|Total))/i.test(it.s))
        .reduce((max, it) => Math.max(max, it.y), -Infinity);

    const enZona = it => it.y < headerY - 3 && it.y > totalesY + 3;
    const money = /^-?\$?\s*[\d.]+,\d{2}$/;
    const parse = s => parseMoneda(String(s).replace(/\$/g, '').trim());

    // Anchors: un monto por fila en la banda de "Subtotal" (el más cercano al
    // header, por si hay más de un número a la derecha).
    const porFila = new Map();
    norm.filter(it => enZona(it) && it.x >= xSubMin && it.x <= xSubMax && money.test(it.s))
        .forEach(it => {
            const k = [...porFila.keys()].find(k => Math.abs(it.y - k) <= 3);
            const key = k !== undefined ? k : it.y;
            const prev = porFila.get(key);
            if (!prev || Math.abs(it.x - xSubtotal) < Math.abs(prev.x - xSubtotal)) porFila.set(key, it);
        });
    const anchors = [...porFila.values()]
        .map(it => ({ y: it.y, importe: parse(it.s), precioUnitario: null, startY: it.y }))
        .sort((a, b) => b.y - a.y);
    if (!anchors.length) return [];

    // Precio unitario por anchor (monto en la banda de "Precio Unit.").
    if (xPrecio != null && xBonif != null) {
        anchors.forEach(a => {
            const p = norm.find(it =>
                Math.abs(it.y - a.y) <= 3 && it.x >= xPrecio - 15 && it.x < xBonif - 5 && money.test(it.s));
            if (p) a.precioUnitario = parse(p.s);
        });
    }

    // Líneas de descripción (banda "Producto/Servicio").
    const descLines = norm
        .filter(it => enZona(it) && it.x >= xIniDesc && it.x < xFinDesc)
        .sort((a, b) => b.y - a.y);

    // Inicio de cada ítem = línea de descripción justo por encima de su anchor.
    anchors.forEach(a => {
        const start = descLines.find(d => d.y >= a.y - 1 && d.y <= a.y + 7);
        a.startY = start ? start.y : a.y;
    });
    const startsDesc = anchors.map(a => a.startY); // descendente

    // Asignar cada línea al ítem cuyo rango [startY siguiente, startY] la contiene.
    const buckets = anchors.map(() => []);
    descLines.forEach(d => {
        let idx = 0;
        for (let i = 0; i < startsDesc.length; i++) {
            if (d.y <= startsDesc[i] + 0.5) idx = i; else break;
        }
        buckets[idx].push(d);
    });

    return anchors
        .map((a, i) => ({
            descripcion: buckets[i].sort((x, y) => y.y - x.y).map(d => d.s).join(' ').replace(/\s+/g, ' ').trim(),
            importe: a.importe,
            precioUnitario: a.precioUnitario
        }))
        .filter(it => it.descripcion || it.importe != null);
}

/**
 * Extrae las descripciones de la tabla de ítems usando coordenadas X.
 *
 * La columna "Producto / Servicio" queda entre el header de su nombre y el de
 * "Cantidad". Tomar el texto que cae en esa banda X evita arrastrar el código
 * del ítem (columna izquierda) y la unidad/precios (columnas derechas, que a
 * veces parten "otras unidades" en dos renglones). Devuelve un array: un
 * elemento por renglón visual de la tabla (uno o varios ítems por comprobante).
 *
 * @param {Array} items - content.items crudos de pdfjs (con transform).
 * @returns {string[]}
 */
function extraerDescripciones(items) {
    const norm = items
        .map(it => ({ s: (it.str || '').trim(), x: it.transform[4], y: it.transform[5] }))
        .filter(it => it.s);

    const prod = norm.find(it => /Producto\s*\/\s*Servicio/i.test(it.s) || /^Producto$/i.test(it.s));
    if (!prod) return [];
    const cant = norm.find(it => /Cantidad/i.test(it.s) && Math.abs(it.y - prod.y) <= 4);
    const headerY = prod.y;
    const xIni = prod.x - 12;
    const xFin = (cant ? cant.x : prod.x + 150) - 8;

    // Inicio del bloque de totales: corta la zona de ítems por abajo para no
    // confundir descripciones con "Subtotal:" / "Importe Neto...".
    const totalesY = norm
        .filter(it => it.y < headerY && /^(Subtotal:|Importe\s+(Neto|Otros|Total))/i.test(it.s))
        .reduce((max, it) => Math.max(max, it.y), -Infinity);

    const filasMap = new Map();
    norm
        .filter(it => it.y < headerY - 3 && it.y > totalesY + 3 && it.x >= xIni && it.x < xFin)
        .forEach(it => {
            const k = [...filasMap.keys()].find(k => Math.abs(it.y - k) <= 3);
            const key = k !== undefined ? k : it.y;
            if (!filasMap.has(key)) filasMap.set(key, []);
            filasMap.get(key).push(it);
        });

    return [...filasMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, its]) => its.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim())
        .filter(s => s.length);
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
