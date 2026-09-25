// ============================================================================
// PROCESADOR BANCO SANTANDER - RESUMEN DE CUENTA CORRIENTE
// ============================================================================
// Estructura del PDF:
//   Página 1:   resumen general (Cuentas, saldos totales)
//   Páginas 2+: detalle por cuenta con tabla de movimientos
//   Página 4:   Detalle impositivo (tabla impuestos + tabla tasas)
//   Página 5:   Legales (se ignora)
//
// Columnas de la tabla de movimientos (posiciones X del PDF):
//   Fecha           x  20–65
//   Comprobante     x  65–115
//   Movimiento      x 115–365
//   Débito          x 365–440
//   Crédito         x 440–525
//   Saldo en cuenta x 525–610
// ============================================================================

// --- UTILIDADES ---

function parsearMonto(str) {
    if (typeof str !== 'string' || str.trim() === '') return '';
    const negativo = str.trim().startsWith('-');
    const limpio = str.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(limpio);
    if (isNaN(num)) return str.trim();
    return negativo ? -Math.abs(num) : num;
}

function extraerTexto(fila) {
    if (!fila || !fila.items) return '';
    return fila.items.map(i => i.str).join(' ').trim();
}

function esFilaFantasma(fila) {
    return fila.items.every(it => it.height < 1);
}

// --- MAPA DE COLUMNAS — MOVIMIENTOS ---

const MAPA_MOV = {
    columnas: [
        { nombre: 'Fecha',           inicioX: 20,  finX: 65  },
        { nombre: 'Comprobante',     inicioX: 65,  finX: 115 },
        { nombre: 'Movimiento',      inicioX: 115, finX: 350 },
        { nombre: 'Débito',          inicioX: 350, finX: 425 },
        { nombre: 'Crédito',         inicioX: 425, finX: 515 },
        { nombre: 'Saldo en cuenta', inicioX: 515, finX: 610 }
    ]
};

const COLS_MON_MOV = new Set(['Débito', 'Crédito', 'Saldo en cuenta']);

// --- MAPA DE COLUMNAS — TASAS ---

const MAPA_TASAS = {
    columnas: [
        { nombre: 'Fecha',           inicioX: 20,  finX: 67  },
        { nombre: 'Tipo',            inicioX: 67,  finX: 120 },
        { nombre: 'Número',          inicioX: 120, finX: 207 },
        { nombre: 'Límite',          inicioX: 207, finX: 251 },
        { nombre: 'Vencimiento',     inicioX: 251, finX: 283 },
        { nombre: 'Util. desde',     inicioX: 283, finX: 330 },
        { nombre: 'Util. hasta',     inicioX: 330, finX: 380 },
        { nombre: 'TNA',             inicioX: 380, finX: 415 },
        { nombre: 'TEA',             inicioX: 415, finX: 447 },
        { nombre: 'CFTEA',           inicioX: 447, finX: 524 },
        { nombre: 'Interés cobrado', inicioX: 524, finX: 600 }
    ]
};

const REGEX_FECHA = /^\d{2}\/\d{2}\/\d{2,4}$/;

// --- FUNCIONES DE MAPEO ---

function encontrarColumna(x, mapa) {
    return mapa.columnas.find(c => x >= c.inicioX && x < c.finX)?.nombre ?? null;
}

function convertirItemsARegistro(items, mapa, colsMonetarias) {
    const reg = {};
    mapa.columnas.forEach(c => reg[c.nombre] = '');

    items.forEach(it => {
        if (!it.str.trim()) return;
        const col = encontrarColumna(it.transform[4], mapa);
        if (!col) return;
        reg[col] = reg[col] ? reg[col] + ' ' + it.str.trim() : it.str.trim();
    });

    mapa.columnas.forEach(c => {
        if (colsMonetarias.has(c.nombre)) {
            reg[c.nombre] = parsearMonto(reg[c.nombre]);
        } else {
            reg[c.nombre] = reg[c.nombre].trim().replace(/\s+/g, ' ');
        }
    });

    return Object.values(reg).some(v => v !== '' && v !== 0) ? reg : null;
}

// ============================================================================
// EXTRACCIÓN DE MOVIMIENTOS
// ============================================================================

// Marcadores de sección que identifican el tipo de moneda
const MARCADORES_SECCION = [
    { regex: /Movimientos en pesos/i,    titulo: 'Movimientos en pesos'   },
    { regex: /Movimientos en d[oó]lares/i, titulo: 'Movimientos en dólares' }
];

// Devuelve array de { titulo, datos } — una entrada por sección encontrada
function extraerMovimientos(filasFiltradas) {
    // Encontrar índices de cada marcador de sección
    const secciones = [];
    for (let i = 0; i < filasFiltradas.length; i++) {
        const texto = extraerTexto(filasFiltradas[i]);
        for (const marcador of MARCADORES_SECCION) {
            if (marcador.regex.test(texto)) {
                secciones.push({ titulo: marcador.titulo, indiceInicio: i });
                break;
            }
        }
    }

    // Si no hay marcadores (PDF sin sección explícita), fallback: buscar headers directamente
    if (secciones.length === 0) {
        const registros = extraerRegistrosEntreIndices(filasFiltradas, 0, filasFiltradas.length);
        return registros.length > 0 ? [{ titulo: 'Movimientos', datos: registros }] : null;
    }

    const tablas = [];
    for (let s = 0; s < secciones.length; s++) {
        const inicio = secciones[s].indiceInicio;
        const fin = s + 1 < secciones.length ? secciones[s + 1].indiceInicio : filasFiltradas.length;
        const registros = extraerRegistrosEntreIndices(filasFiltradas, inicio, fin);
        if (registros.length > 0) {
            tablas.push({ titulo: secciones[s].titulo, datos: registros });
        }
    }

    return tablas.length > 0 ? tablas : null;
}

function extraerRegistrosEntreIndices(filasFiltradas, desdeIdx, hastaIdx) {
    const registros = [];

    // Encontrar los headers de tabla dentro del bloque
    const indicesHeader = [];
    for (let i = desdeIdx; i < hastaIdx; i++) {
        const texto = extraerTexto(filasFiltradas[i]).toUpperCase();
        if (texto.includes('FECHA') && texto.includes('COMPROBANTE') && texto.includes('MOVIMIENTO')) {
            indicesHeader.push(i);
        }
    }
    if (indicesHeader.length === 0) return registros;

    for (let h = 0; h < indicesHeader.length; h++) {
        const inicio = indicesHeader[h] + 1;
        const fin = h + 1 < indicesHeader.length ? indicesHeader[h + 1] : hastaIdx;

        let i = inicio;
        while (i < fin) {
            const fila = filasFiltradas[i];
            if (!fila.items || fila.items.length === 0) { i++; continue; }
            if (/Banco Santander Argentina/i.test(extraerTexto(fila))) { i++; continue; }

            const primerItem = fila.items.find(it => it.str.trim() !== '');
            if (!primerItem || !REGEX_FECHA.test(primerItem.str.trim())) { i++; continue; }

            const itemsDelRegistro = [...fila.items];
            while (i + 1 < fin) {
                const sigFila = filasFiltradas[i + 1];
                if (!sigFila?.items?.length) break;
                const sigPrimerItem = sigFila.items.find(it => it.str.trim() !== '');
                if (!sigPrimerItem) break;
                const esContinuacion = !REGEX_FECHA.test(sigPrimerItem.str.trim())
                    && sigPrimerItem.transform[4] >= 115
                    && sigPrimerItem.transform[4] < 365;
                if (!esContinuacion) break;
                itemsDelRegistro.push(...sigFila.items);
                i++;
            }

            const registro = convertirItemsARegistro(itemsDelRegistro, MAPA_MOV, COLS_MON_MOV);
            if (registro) registros.push(registro);
            i++;
        }
    }
    return registros;
}

// ============================================================================
// EXTRACCIÓN DE DETALLE IMPOSITIVO
// ============================================================================

function extraerDetalleImpositivo(filasFiltradas) {
    // Encontrar inicio de la sección "Detalle impositivo"
    const indiceInicio = filasFiltradas.findIndex(f =>
        /Detalle impositivo/i.test(extraerTexto(f))
    );
    if (indiceInicio === -1) return null;

    // Encontrar inicio de "Legales" (fin de la sección)
    let indiceFin = filasFiltradas.findIndex((f, i) =>
        i > indiceInicio && /^Legales$/i.test(extraerTexto(f).trim())
    );
    if (indiceFin === -1) indiceFin = filasFiltradas.length;

    const bloque = filasFiltradas.slice(indiceInicio + 1, indiceFin);
    const tablas = [];

    // --- TABLA 1: IMPUESTOS (Tipo de impuesto | Importe) ---
    const idxHeaderImp = bloque.findIndex(f => {
        const t = extraerTexto(f).toUpperCase();
        return t.includes('TIPO DE IMPUESTO') && t.includes('IMPORTE');
    });

    if (idxHeaderImp !== -1) {
        const idxTasas = bloque.findIndex((f, i) =>
            i > idxHeaderImp && /Tasas de Acuerdos/i.test(extraerTexto(f))
        );
        const finImp = idxTasas !== -1 ? idxTasas : bloque.length;
        const datosImp = [];

        for (let i = idxHeaderImp + 1; i < finImp; i++) {
            const fila = bloque[i];
            if (!fila.items || fila.items.length === 0) continue;

            // Recolectar texto y monto de la fila
            let descripcion = '';
            let importe = '';

            fila.items.forEach(it => {
                const txt = it.str.trim();
                if (!txt) return;
                const x = it.transform[4];
                if (x < 480) {
                    descripcion = descripcion ? descripcion + ' ' + txt : txt;
                } else {
                    importe = importe ? importe + ' ' + txt : txt;
                }
            });

            descripcion = descripcion.trim().replace(/\s+/g, ' ');
            if (!descripcion) continue;

            datosImp.push({
                'Tipo de impuesto': descripcion,
                'Importe': importe ? parsearMonto(importe) : ''
            });
        }

        if (datosImp.length > 0) {
            tablas.push({ titulo: 'Detalle Impositivo', datos: datosImp });
        }
    }

    // --- TABLA 2: TASAS DE ACUERDOS Y DESCUBIERTO ---
    const idxTasas = bloque.findIndex(f => /Tasas de Acuerdos/i.test(extraerTexto(f)));

    if (idxTasas !== -1) {
        // Buscar el encabezado de la tabla de tasas (contiene "Fecha" y "TNA")
        const idxHeaderTasas = bloque.findIndex((f, i) => {
            if (i <= idxTasas) return false;
            const t = extraerTexto(f).toUpperCase();
            return t.includes('FECHA') && t.includes('TNA');
        });

        if (idxHeaderTasas !== -1) {
            // El header puede ocupar dos líneas (ej: "Utilizado / desde" y "hasta")
            // Buscar primera fila de datos: empieza con fecha
            let idxPrimerDato = idxHeaderTasas + 1;
            while (idxPrimerDato < bloque.length) {
                const primerItem = bloque[idxPrimerDato].items?.find(it => it.str.trim() !== '');
                if (primerItem && REGEX_FECHA.test(primerItem.str.trim())) break;
                idxPrimerDato++;
            }

            const datosTasas = [];
            for (let i = idxPrimerDato; i < bloque.length; i++) {
                const fila = bloque[i];
                if (!fila.items || fila.items.length === 0) continue;
                const primerItem = fila.items.find(it => it.str.trim() !== '');
                if (!primerItem || !REGEX_FECHA.test(primerItem.str.trim())) continue;

                const registro = convertirItemsARegistro(fila.items, MAPA_TASAS, new Set(['Límite', 'Interés cobrado']));
                if (registro) datosTasas.push(registro);
            }

            if (datosTasas.length > 0) {
                tablas.push({ titulo: 'Tasas de Acuerdos y Descubierto', datos: datosTasas });
            }
        }
    }

    return tablas.length > 0 ? tablas : null;
}

// ============================================================================
// FUNCIÓN PRINCIPAL
// ============================================================================

async function procesarSantander(allFilas, metadata = {}) {
    if (!allFilas || allFilas.length === 0) {
        return { exito: false, error: 'No se recibieron datos del PDF.' };
    }

    const filasFiltradas = allFilas.filter(f => f && Array.isArray(f.items) && !esFilaFantasma(f));

    const tablasMovimientos = extraerMovimientos(filasFiltradas);
    if (!tablasMovimientos) {
        return { exito: false, error: 'No se encontró la tabla de movimientos.' };
    }

    const tablas = [...tablasMovimientos];

    const tablasImpositivas = extraerDetalleImpositivo(filasFiltradas);
    if (tablasImpositivas) {
        tablas.push(...tablasImpositivas);
    }

    let nombreExcel = 'Santander_Extracto.xlsx';
    if (metadata.nombreArchivo) {
        nombreExcel = metadata.nombreArchivo.replace(/\.pdf$/i, '.xlsx');
    }

    return { exito: true, tablas, suggestedFileName: nombreExcel };
}

module.exports = { procesarSantander };
