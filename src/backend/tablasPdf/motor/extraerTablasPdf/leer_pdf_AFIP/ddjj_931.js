// ============================================================================
// PROCESADOR DDJJ F.931 - AFIP / ARCA (Declaración Jurada Seguridad Social)
// ============================================================================
// El PDF tiene una sola página con un layout muy denso y "a dos columnas":
//
//   - Mitad superior IZQUIERDA: texto legal narrativo (fuentes grandes
//     height 9-27) que se ignora; comparte la misma coordenada Y con los datos.
//   - Mitad superior DERECHA: encabezado (CUIT, Mes-Año...) y Remuneraciones.
//   - Zona media: TABLAS GEMELAS lado a lado, separadas en x ≈ 312:
//        IZQUIERDA (x 40-312)        |  DERECHA (x 313-565)
//        I  - Seguridad Social       |  II  - Obras Sociales
//        III- Retenciones            |  IV/V- Vales / RENATRE
//        VI - L.R.T. + Leyes         |  VII - Seguro de Vida
//   - Zona baja: VIII - Montos que se ingresan (dos columnas de pares
//     código-valor), IX - Forma de pago, y footer (URL / página).
//
// Estrategia híbrida:
//   * Tablas tabulares limpias  -> extracción por BANDAS de columna (x).
//   * Zonas irregulares         -> anclaje por ETIQUETA / patrón de valor.
//
// Salida: { exito, tablas: [{ titulo, datos: [{Concepto, Valor}] }], ... }
// ============================================================================

const X_SPLIT = 312; // frontera entre tabla izquierda y derecha

// --- UTILIDADES BÁSICAS ---------------------------------------------------

function limpiar(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
}

const REGEX_MONTO = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;

function esMonto(str) {
    return REGEX_MONTO.test(String(str).trim());
}

// Aplana las filas del PDF a una lista de items con coordenadas explícitas.
// allFilas: [{ y, items:[{ str, transform, width, height, fontName }] }]
function aplanarItems(allFilas) {
    const items = [];
    for (const fila of allFilas) {
        if (!fila || !Array.isArray(fila.items)) continue;
        for (const it of fila.items) {
            const s = it.str;
            if (typeof s !== 'string' || s.trim() === '') continue;
            items.push({
                str: s,
                x: it.transform[4],
                y: it.transform[5],
                w: it.width || 0,
                h: it.height || 0,
                font: it.fontName || ''
            });
        }
    }
    return items;
}

// Encuentra la coordenada Y de la primera ocurrencia de un texto.
function yDeTexto(items, texto, { xMin = -Infinity, xMax = Infinity } = {}) {
    const it = items.find(i => i.x >= xMin && i.x < xMax && i.str.includes(texto));
    return it ? it.y : null;
}

// Agrupa items por su coordenada Y (tolerancia), devuelve filas de items
// ordenadas de arriba hacia abajo y, dentro de cada fila, de izq a der.
function agruparPorY(items, tol = 4) {
    const ordenados = [...items].sort((a, b) => b.y - a.y);
    const filas = [];
    for (const it of ordenados) {
        const fila = filas.find(f => Math.abs(f.yRef - it.y) <= tol);
        if (fila) {
            fila.items.push(it);
        } else {
            filas.push({ yRef: it.y, items: [it] });
        }
    }
    return filas.map(f => f.items.sort((a, b) => a.x - b.x));
}

// ============================================================================
// EXTRACTOR GENÉRICO POR BANDAS (para tablas tabulares limpias)
// ============================================================================
// region = { yTop, yBot, labelMin, labelMax, valorMin, valorMax }
// Toma los items con yBot < y < yTop dentro de la banda X, los agrupa por
// fila y separa Concepto (banda label) de Valor (banda valor).
function extraerPorBandas(items, region) {
    const { yTop, yBot, labelMin, labelMax, valorMin, valorMax } = region;
    const enRegion = items.filter(i =>
        i.y > yBot + 0.5 && i.y < yTop - 0.5 &&
        i.x >= labelMin && i.x <= valorMax
    );
    const filas = agruparPorY(enRegion);
    const datos = [];
    for (const fila of filas) {
        const labelItems = fila.filter(i => i.x >= labelMin && i.x < valorMin);
        const valorItems = fila.filter(i => i.x >= valorMin && i.x <= valorMax);
        const concepto = limpiar(labelItems.map(i => i.str).join(' '));
        const valor = limpiar(valorItems.map(i => i.str).join(' '));
        if (!concepto || !valor) continue;          // saltar headers / filas sueltas
        datos.push({ Concepto: concepto, Valor: valor });
    }
    return datos;
}

// ============================================================================
// EXTRACTOR POR ETIQUETA (para zonas irregulares)
// ============================================================================
// Busca la etiqueta y devuelve el valor a su derecha (misma fila ± yTol),
// limitado a la banda X indicada. Sirve para etiquetas anchas con el valor
// pegado. `xMinLabel` permite desambiguar etiquetas duplicadas (izq vs der).
function valorPorEtiqueta(items, etiqueta, {
    xMinLabel = -Infinity, xMaxLabel = Infinity,
    xMaxValor = Infinity, yTol = 4
} = {}) {
    const lab = items.find(i =>
        i.x >= xMinLabel && i.x < xMaxLabel && i.str.includes(etiqueta)
    );
    if (!lab) return null;
    const finLabel = lab.x + lab.w;
    const valItems = items
        .filter(i =>
            i !== lab &&
            Math.abs(i.y - lab.y) <= yTol &&
            i.x >= finLabel - 1 &&
            i.x <= xMaxValor &&
            i.str.trim() !== ''
        )
        .sort((a, b) => a.x - b.x);
    return limpiar(valItems.map(i => i.str).join(' '));
}

// Igual que valorPorEtiqueta pero devuelve solo los MONTOS (tokens numéricos)
// hallados a la derecha de la etiqueta, como array ordenado por X.
function montosPorEtiqueta(items, etiqueta, opts = {}) {
    const { xMinLabel = -Infinity, xMaxLabel = Infinity, xMaxValor = Infinity, yTol = 4 } = opts;
    const lab = items.find(i =>
        i.x >= xMinLabel && i.x < xMaxLabel && i.str.includes(etiqueta)
    );
    if (!lab) return [];
    const finLabel = lab.x + lab.w;
    return items
        .filter(i =>
            i !== lab &&
            Math.abs(i.y - lab.y) <= yTol &&
            i.x >= finLabel - 1 &&
            i.x <= xMaxValor &&
            esMonto(i.str)
        )
        .sort((a, b) => a.x - b.x)
        .map(i => limpiar(i.str));
}

// ============================================================================
// SECCIÓN 1 - ENCABEZADO
// ============================================================================
function extraerEncabezado(items) {
    const datos = [];
    const push = (c, v) => { if (v) datos.push({ Concepto: c, Valor: v }); };

    // Valores identificables por patrón
    const fechaHora = items.find(i => /^\d{1,2}\/\d{1,2}\/\d{2},\s*\d/.test(i.str.trim()));
    push('Fecha/Hora', fechaHora ? limpiar(fechaHora.str) : '');

    const cuit = items.find(i => /^\d{2}-\d{8}-\d$/.test(i.str.trim()));
    push('CUIT', cuit ? limpiar(cuit.str) : '');

    const mesAnio = items.find(i => /^\d{2}\/\d{4}$/.test(i.str.trim()));
    push('Mes - Año', mesAnio ? limpiar(mesAnio.str) : '');

    push('Orig. (0) - Rect. (1/9)', valorPorEtiqueta(items, 'Orig. (0)', { xMinLabel: 400, xMaxValor: 545, yTol: 3 }));
    push('Servicios Eventuales', valorPorEtiqueta(items, 'Servicios Eventuales', { xMaxValor: 545, yTol: 3 }));
    push('Empleados en nómina', valorPorEtiqueta(items, 'Empleados en nómina', { xMaxValor: 560, yTol: 3 }));

    return datos;
}

// ============================================================================
// SECCIÓN 2 - REMUNERACIONES (Suma de Rem. 1..10)
// ============================================================================
function extraerRemuneraciones(items) {
    const datos = [];
    for (let n = 1; n <= 10; n++) {
        const etiqueta = `Suma de Rem. ${n}:`;
        const lab = items.find(i => i.str.includes(etiqueta));
        if (!lab) continue;
        // El valor (monto) está a la derecha, x > 460, y casi a la misma altura
        // (a veces en una fila contigua con ±2 de diferencia).
        const val = items
            .filter(i => i.x > 460 && Math.abs(i.y - lab.y) <= 3 && esMonto(i.str))
            .sort((a, b) => Math.abs(a.y - lab.y) - Math.abs(b.y - lab.y))[0];
        datos.push({ Concepto: `Suma de Rem. ${n}`, Valor: val ? limpiar(val.str) : '' });
    }
    return datos;
}

// ============================================================================
// SECCIÓN 3 - DATOS DE IDENTIDAD
// ============================================================================
function extraerIdentidad(items) {
    const datos = [];
    const push = (c, v) => datos.push({ Concepto: c, Valor: v || '' });

    // Apellido/Razón Social: la etiqueta está en una fila y el valor en la
    // fila inmediatamente inferior, alineado a la izquierda (x ≈ 43).
    const labApellido = items.find(i => i.str.includes('Apellido y Nombre o Razón Social'));
    let razonSocial = '';
    if (labApellido) {
        const cand = items
            .filter(i => i.x >= 40 && i.x < 320 && i.y < labApellido.y - 5 && i.y > labApellido.y - 30 && i.str.trim() !== '')
            .sort((a, b) => b.y - a.y || b.str.length - a.str.length);
        razonSocial = cand.length ? limpiar(cand[0].str) : '';
    }
    push('Apellido y Nombre o Razón Social', razonSocial);

    // Verificador: etiqueta x≈328, valor numérico debajo a la derecha.
    const labVerif = items.find(i => i.str.includes('Verificador'));
    let verificador = '';
    if (labVerif) {
        const cand = items
            .filter(i => i.x >= 325 && i.x < 430 && Math.abs(i.y - labVerif.y) <= 14 && /^\d+$/.test(i.str.trim()))
            .sort((a, b) => Math.abs(a.y - labVerif.y) - Math.abs(b.y - labVerif.y));
        verificador = cand.length ? limpiar(cand[0].str) : '';
    }
    push('Verificador', verificador);

    // Domicilio Fiscal: etiqueta y valor en la misma fila (x ≈ 104 en adelante).
    push('Domicilio Fiscal', valorPorEtiqueta(items, 'Domicilio Fiscal', { xMaxLabel: 200, xMaxValor: 560, yTol: 3 }));

    return datos;
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================
async function procesarDdjj931(allFilas, metadata = {}) {
    if (!allFilas || allFilas.length === 0) {
        return { exito: false, error: 'No se recibieron datos del PDF.' };
    }

    const items = aplanarItems(allFilas);

    // --- Anclas de sección (Y de cada encabezado) ---
    const yI    = yDeTexto(items, 'REGIMEN NACIONAL DE SEGURIDAD SOCIAL', { xMax: X_SPLIT }); // ~618
    const yIII  = yDeTexto(items, 'III - RETENCIONES');                                       // ~488
    const yVI   = yDeTexto(items, 'LEY DE RIESGOS DE TRABAJO');                               // ~387
    const yVIII = yDeTexto(items, 'MONTOS QUE SE INGRESAN');                                  // ~299
    const yPago = yDeTexto(items, 'Forma de Pago');                                           // ~222

    const tablas = [];
    const addTabla = (titulo, datos) => {
        if (datos && datos.length > 0) tablas.push({ titulo, datos });
    };

    // 1. Encabezado
    addTabla('1. Encabezado', extraerEncabezado(items));

    // 2. Remuneraciones
    addTabla('2. Remuneraciones', extraerRemuneraciones(items));

    // 3. Datos de identidad
    addTabla('3. Datos de identidad', extraerIdentidad(items));

    // 4. I - Régimen Nacional de Seguridad Social (columna izquierda)
    if (yI && yIII) {
        addTabla('4. I - Régimen Nacional de Seguridad Social', extraerPorBandas(items, {
            yTop: yI, yBot: yIII, labelMin: 40, labelMax: 240, valorMin: 240, valorMax: X_SPLIT
        }));
        // 5. II - Régimen Nacional de Obras Sociales (columna derecha)
        addTabla('5. II - Régimen Nacional de Obras Sociales', extraerPorBandas(items, {
            yTop: yI, yBot: yIII, labelMin: 313, labelMax: 505, valorMin: 505, valorMax: 565
        }));
    }

    // 6. III - Retenciones (columna izquierda de su banda)
    if (yIII && yVI) {
        addTabla('6. III - Retenciones', extraerPorBandas(items, {
            yTop: yIII, yBot: yVI, labelMin: 40, labelMax: 250, valorMin: 250, valorMax: X_SPLIT
        }));
        // 7. IV/V - Vales Alimentarios / RENATRE (columna derecha)
        addTabla('7. IV/V - Vales Alimentarios / RENATRE', extraerPorBandas(items, {
            yTop: yIII, yBot: yVI, labelMin: 313, labelMax: 505, valorMin: 505, valorMax: 565
        }));
    }

    // 8. VI/VII - L.R.T. / Seguro de Vida (zona irregular -> por etiqueta)
    if (yVI && yVIII) {
        addTabla('8. VI/VII - L.R.T. / Seguro de Vida', extraerLrtSeguros(items));
    }

    // 9. VIII - Montos que se ingresan (dos columnas de pares código-valor)
    if (yVIII && yPago) {
        const izq = extraerPorBandas(items, {
            yTop: yVIII, yBot: yPago, labelMin: 40, labelMax: 235, valorMin: 235, valorMax: 300
        });
        const der = extraerPorBandas(items, {
            yTop: yVIII, yBot: yPago, labelMin: 305, labelMax: 505, valorMin: 505, valorMax: 565
        });
        addTabla('9. VIII - Montos que se ingresan', [...izq, ...der]);
    }

    // 10. Forma de pago + footer
    const datosPago = [];
    const formaPago = valorPorEtiqueta(items, 'Forma de Pago', { xMaxLabel: 200, xMaxValor: 300, yTol: 3 });
    if (formaPago) datosPago.push({ Concepto: 'Forma de Pago', Valor: formaPago });
    const url = items.find(i => /^https?:\/\//.test(i.str.trim()));
    if (url) datosPago.push({ Concepto: 'URL', Valor: limpiar(url.str) });
    const pagina = items.find(i => /^\d+\/\d+$/.test(i.str.trim()) && i.x > 500);
    if (pagina) datosPago.push({ Concepto: 'Página', Valor: limpiar(pagina.str) });
    addTabla('10. Forma de pago', datosPago);

    if (tablas.length === 0) {
        return { exito: false, error: 'No se pudieron extraer datos del F.931.' };
    }

    let nombreExcel = 'DDJJ_931.xlsx';
    if (metadata.nombreArchivo) {
        nombreExcel = metadata.nombreArchivo.replace(/\.pdf$/i, '.xlsx');
    }

    // hojaUnica: el F.931 son 10 secciones de una misma declaración (pares
    // Concepto/Valor); se entrega todo apilado en una sola hoja para poder
    // operar con referencias/fórmulas entre tablas sin saltar de pestaña.
    return { exito: true, tablas, suggestedFileName: nombreExcel, hojaUnica: true };
}

// ----------------------------------------------------------------------------
// VI/VII - L.R.T., Leyes y Seguro de Vida (etiquetas anchas con valor pegado)
// ----------------------------------------------------------------------------
function extraerLrtSeguros(items) {
    const datos = [];
    const push = (c, v) => { if (v) datos.push({ Concepto: c, Valor: v }); };

    // Columna izquierda (VI). Las filas de CUILES y Remun. con ART traen,
    // además del valor principal, el desglose del cálculo de L.R.T.
    // (suma fija + alícuota variable, que suman el "L.R.T. total a pagar").
    const cuilesTodo = valorPorEtiqueta(items, 'Cantidad de CUILES con ART', { xMaxLabel: X_SPLIT, xMaxValor: X_SPLIT, yTol: 3 }) || '';
    const cuilesCount = (cuilesTodo.match(/^\d+/) || [''])[0];
    const lrtSumaFija = montosPorEtiqueta(items, 'Cantidad de CUILES con ART', { xMaxLabel: X_SPLIT, xMaxValor: X_SPLIT, yTol: 3 })[0];
    push('Cantidad de CUILES con ART', cuilesCount);
    if (lrtSumaFija) push('L.R.T. Suma Fija', lrtSumaFija);

    const remunMontos = montosPorEtiqueta(items, 'Remun. con ART', { xMaxLabel: X_SPLIT, xMaxValor: X_SPLIT, yTol: 3 });
    push('Remun. con ART', remunMontos[0]);
    if (remunMontos[1]) push('L.R.T. Alícuota Variable', remunMontos[1]);

    push('L.R.T. total a pagar',       valorPorEtiqueta(items, 'L.R.T. total a pagar',       { xMaxLabel: X_SPLIT, xMaxValor: X_SPLIT, yTol: 3 }));
    push('Ley 25.922 Encuadre',        valorPorEtiqueta(items, 'Ley 25.922 Encuadre',        { xMaxLabel: X_SPLIT, xMaxValor: X_SPLIT, yTol: 3 }));
    push('Ley 27.430 - Monto Total Detraido', valorPorEtiqueta(items, 'Ley 27.430', { xMaxLabel: X_SPLIT, xMaxValor: X_SPLIT, yTol: 3 }));

    // Columna derecha (VII)
    push('Cuiles c/S.C.V.O. - Prima', valorPorEtiqueta(items, 'Cuiles c/S.C.V.O.', { xMinLabel: X_SPLIT, xMaxValor: 565, yTol: 3 }));
    push('S.C.V.O. a Pagar',          valorPorEtiqueta(items, 'S.C.V.O. a Pagar', { xMinLabel: X_SPLIT, xMaxValor: 565, yTol: 3 }));
    push('Costo Emisión',             valorPorEtiqueta(items, 'Costo Emisión',    { xMinLabel: X_SPLIT, xMaxValor: 565, yTol: 3 }));

    return datos;
}

module.exports = { procesarDdjj931 };
