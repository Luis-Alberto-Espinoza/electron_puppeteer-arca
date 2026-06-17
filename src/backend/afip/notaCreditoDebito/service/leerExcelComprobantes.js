/**
 * Lee un Excel de Consulta de Comprobantes y devuelve sus FACTURAS como filas
 * estructuradas, listas para que el usuario elija a cuáles hacerles NC/ND.
 *
 * Es el paso 2 del flujo de Notas (ver docs/AFIP_DOC/notaCreditoDebito.md). El
 * armador de NC (paso 3) consume estas filas.
 *
 * Contrato con feature 2 (`generarExcelComprobantes`): leemos por **nombre de
 * header**, NO por índice de columna (las columnas ya se corrieron una vez). Si
 * allá se renombran los headers, hay que actualizar el mapa HDR de acá.
 *
 * El Excel trae dos hojas:
 *   - "Comprobantes": una fila por comprobante (+ una fila final "TOTAL").
 *   - "Descripciones": N filas por comprobante; la clave (PV + Nro) figura solo
 *     en el primer renglón y las descripciones siguientes van debajo en blanco.
 * Las unimos por **Punto de Venta + Comprobante Nro** (el Nro se repite entre
 * puntos de venta, por eso la clave es compuesta).
 */

const XLSX = require('xlsx');

// Nombres EXACTOS de los headers en el Excel de consulta (el contrato).
const HDR = {
    tipo:            'Tipo de Comprobante',
    puntoVenta:      'Punto de Venta',
    numero:          'Comprobante Nro',
    fechaEmision:    'Fecha de Emisión',
    cuit:            'CUIT',
    razonSocial:     'Apellido / Razón Social',
    condVenta:       'Condición de Venta',
    condIvaEmisor:   'Cond. IVA Emisor',
    condIvaReceptor: 'Cond. IVA Receptor',
    netoGravado:     'Importe Neto Gravado',
    iva0:            'IVA 0%',
    iva25:           'IVA 2.5%',
    iva5:            'IVA 5%',
    iva105:          'IVA 10.5%',
    iva21:           'IVA 21%',
    iva27:           'IVA 27%',
    otrosTributos:   'Importe Otros Tributos',
    total:           'Total',
    // Hoja Descripciones (una fila por ítem)
    descripcion:     'Descripción',
    importe:         'Importe'
};

/** Convierte una celda a número, o null si está vacía / no es numérica. */
function numOrNull(v) {
    if (typeof v === 'number') return isNaN(v) ? null : v;
    if (v == null || v === '') return null;
    // Defensivo: por si alguna celda quedó como texto estilo AR ("1.234,56").
    const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? null : n;
}

const txt = (v) => String(v == null ? '' : v).trim();

/**
 * Extrae la letra (A/B/C) del tipo de comprobante. La letra va al final, tanto
 * en "Factura A" como en "Factura de Crédito Electrónica MiPyMEs (FCE) A".
 */
function extraerLetra(tipoComprobante) {
    const m = txt(tipoComprobante).match(/([ABC])\s*$/i);
    return m ? m[1].toUpperCase() : '';
}

/** Solo Facturas (incluye FCE). Excluye NC/ND, Recibos y la fila "TOTAL". */
function esFactura(tipoComprobante) {
    return /^factura/i.test(txt(tipoComprobante));
}

/**
 * Reconstruye el mapa `PV||Nro` → [descripciones] desde la hoja Descripciones,
 * propagando la clave hacia abajo (las filas sin clave pertenecen al último
 * comprobante visto).
 */
function indexarItems(filasDesc) {
    const mapa = new Map();
    let claveActual = null;
    for (const row of filasDesc) {
        const pv = txt(row[HDR.puntoVenta]);
        const nro = txt(row[HDR.numero]);
        const desc = txt(row[HDR.descripcion]);
        const importe = numOrNull(row[HDR.importe]);
        if (pv || nro) {
            claveActual = `${pv}||${nro}`;
            if (!mapa.has(claveActual)) mapa.set(claveActual, []);
        }
        if (claveActual && (desc || importe != null)) {
            mapa.get(claveActual).push({ descripcion: desc, importe });
        }
    }
    return mapa;
}

/**
 * @param {string} ruta - Ruta absoluta al .xlsx de consulta de comprobantes.
 * @returns {{facturas: Array<Object>, leidasTotal: number}}
 *          `facturas`: solo comprobantes tipo Factura, estructurados.
 *          `leidasTotal`: total de filas leídas (antes de filtrar) — para avisos.
 * @throws {Error} si el archivo no tiene la hoja "Comprobantes" (viejo/corrupto).
 */
function leerExcelComprobantes(ruta) {
    const wb = XLSX.readFile(ruta);

    const hojaComp = wb.Sheets['Comprobantes'];
    if (!hojaComp) {
        throw new Error('El Excel no tiene la hoja "Comprobantes". ¿Es un archivo de consulta válido?');
    }

    // defval:'' → las celdas vacías vienen como '' (consistente), no faltantes.
    const filasComp = XLSX.utils.sheet_to_json(hojaComp, { defval: '' });

    // La hoja Descripciones puede no existir (consulta sin descripciones).
    const hojaDesc = wb.Sheets['Descripciones'];
    const filasDesc = hojaDesc ? XLSX.utils.sheet_to_json(hojaDesc, { defval: '' }) : [];
    const itemsPorClave = indexarItems(filasDesc);

    const facturas = filasComp
        .filter(row => esFactura(row[HDR.tipo]))
        .map(row => {
            const puntoVenta = txt(row[HDR.puntoVenta]);
            const comprobanteNumero = txt(row[HDR.numero]);
            const items = itemsPorClave.get(`${puntoVenta}||${comprobanteNumero}`) || [];
            const descripciones = items.map(it => it.descripcion).filter(Boolean);

            return {
                tipoComprobante:     txt(row[HDR.tipo]),
                letra:               extraerLetra(row[HDR.tipo]),
                puntoVenta,
                comprobanteNumero,
                fechaEmision:        txt(row[HDR.fechaEmision]),
                cuitReceptor:        txt(row[HDR.cuit]),
                razonSocialReceptor: txt(row[HDR.razonSocial]),
                condicionVenta:      txt(row[HDR.condVenta]),
                condicionIvaReceptor: txt(row[HDR.condIvaReceptor]),
                // Montos (números o null). El paso 3 despeja el neto por alícuota.
                netoGravado:   numOrNull(row[HDR.netoGravado]),
                iva0:          numOrNull(row[HDR.iva0]),
                iva25:         numOrNull(row[HDR.iva25]),
                iva5:          numOrNull(row[HDR.iva5]),
                iva105:        numOrNull(row[HDR.iva105]),
                iva21:         numOrNull(row[HDR.iva21]),
                iva27:         numOrNull(row[HDR.iva27]),
                otrosTributos: numOrNull(row[HDR.otrosTributos]),
                total:         numOrNull(row[HDR.total]),
                // Ítems con su importe (subtotal) por separado, para emitir una
                // línea por ítem en la nota. `descripciones` queda como texto plano.
                items,
                descripciones,
                primerItem:    descripciones[0] || ''
            };
        });

    return { facturas, leidasTotal: filasComp.length };
}

module.exports = { leerExcelComprobantes };
