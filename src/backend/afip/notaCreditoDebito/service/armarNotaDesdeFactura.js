/**
 * Armador de Nota de Crédito/Débito a partir de una factura del Excel.
 *
 * Paso 3 del flujo (ver docs/AFIP_DOC/notaCreditoDebito.md). Función PURA: toma
 * una fila de `leerExcelComprobantes` + opciones del cabezal y devuelve el objeto
 * `data` que `procesarFacturaIndividual` ya sabe consumir (mismo contrato que una
 * factura de cliente), más warnings y un resumen para la UI.
 *
 * Claves del diseño:
 *  - La NC se arma como **una línea por alícuota** (no réplica ítem-por-ítem).
 *    AFIP pide NETO + alícuota y le suma el IVA, así que despejamos el neto desde
 *    el monto de IVA del Excel: `neto = IVA / tasa`.
 *  - La **letra** (A/B/C) sale de la factura, no del emisor. El lote puede ser
 *    mixto. De la letra derivamos también el tipoContribuyente (C = sin IVA).
 *  - El usuario solo elige **Crédito o Débito**.
 */

const { CONDICIONES_IVA, CONDICIONES_VENTA } = require('../../factura/service/procesarFacturaCliente.js');

// Value del <option> del select #universocomprobante de AFIP para cada nota,
// por letra. Tomado del catálogo del frontend (HTML real de AFIP).
const NOTA_VALUES = {
    credito: { A: '12', B: '23', C: '4' },
    debito:  { A: '11', B: '21', C: '3' }
};

// Mapeo tasa% → value del select de alícuota IVA de AFIP (#detalle_tipo_iva).
// CONFIRMADO en código: 21% = '5' (paso_3 modo normal). El resto sigue la tabla
// de Id de IVA de AFIP; verificar contra el select real si aparece 2.5%/5%.
const ALICUOTA_VALUE = {
    '0':    '3',
    '10.5': '4',
    '21':   '5',
    '27':   '6',
    '5':    '8',
    '2.5':  '9'
};

// Otros valores del select #detalle_tipo_iva de AFIP (no son tasas):
// "No gravado" = 1, "Exento" = 2. Los usamos cuando el comprobante no tiene
// base gravada ni IVA (servicios exentos).
const EXENTO_VALUE = '2';

// Orden de alícuotas con su campo en la fila del Excel.
const ALICUOTAS = [
    { tasa: '2.5', campo: 'iva25' },
    { tasa: '5',   campo: 'iva5' },
    { tasa: '10.5', campo: 'iva105' },
    { tasa: '21',  campo: 'iva21' },
    { tasa: '27',  campo: 'iva27' }
];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Recorta una descripción al máximo de caracteres que AFIP acepta por línea.
const MAX_DESC = 400;
const clamp = (s, max = MAX_DESC) => {
    s = String(s || '');
    return s.length > max ? s.slice(0, max) : s;
};

/**
 * Alícuota ÚNICA del comprobante (para poder emitir una línea por ítem con el
 * mismo IVA). Devuelve { value, ok }:
 *   - C (monotributo): { null, true } (sin IVA).
 *   - una sola alícuota con IVA: su value.
 *   - sin IVA: 0% si hay neto gravado, si no Exento.
 *   - varias alícuotas distintas: { null, false } → no se puede por ítem (mixto).
 */
function alicuotaUnica(factura, tipoContribuyente) {
    if (tipoContribuyente === 'C') return { value: null, ok: true };
    const conIva = ALICUOTAS.filter(({ campo }) => typeof factura[campo] === 'number' && factura[campo] > 0);
    if (conIva.length > 1) return { value: null, ok: false };
    if (conIva.length === 1) return { value: ALICUOTA_VALUE[conIva[0].tasa], ok: true };
    if (factura.netoGravado && factura.netoGravado > 0) return { value: ALICUOTA_VALUE['0'], ok: true };
    return { value: EXENTO_VALUE, ok: true };
}

function normalizar(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Texto de condición IVA del Excel → código del select de AFIP (default 5). */
function mapearCondicionIVA(texto) {
    const objetivo = normalizar(texto);
    if (!objetivo) return 5; // Consumidor Final (default histórico)
    const par = Object.entries(CONDICIONES_IVA).find(([, t]) => normalizar(t) === objetivo);
    return par ? Number(par[0]) : 5;
}

/** Texto de condición de venta del Excel → array canónico (default Cta. Cte.). */
function mapearCondicionVenta(texto) {
    const objetivo = normalizar(texto);
    const canon = CONDICIONES_VENTA.find(c => normalizar(c) === objetivo);
    return canon ? [canon] : ['Cuenta Corriente'];
}

/** Documento del receptor: 11 dígitos → CUIT (80); si no, DNI (96). */
function detectarDocumento(cuitTexto) {
    const numero = String(cuitTexto || '').replace(/\D/g, '');
    const tipoDocumento = numero.length === 11 ? 80 : 96;
    return { tipoDocumento, numeroDocumento: numero };
}

function fechaHoy() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * @param {Object} factura - Fila de `leerExcelComprobantes`.
 * @param {Object} [opciones]
 * @param {'credito'|'debito'} [opciones.tipoNota='credito']
 * @param {'Producto'|'Servicio'} [opciones.tipoActividad='Servicio']
 * @param {string} [opciones.puntoVenta] - PV del emisor para emitir la nota.
 * @param {string} [opciones.cuitEmisor] - Para detectar receptor = emisor (Excels viejos).
 * @param {string} [opciones.fechaComprobante] - Fecha de la nota (DD/MM/YYYY); default hoy.
 * @param {number} [opciones.montoOverride] - Nuevo total (NC parcial); ≤ total original.
 * @param {string} [opciones.fechaDesde] @param {string} [opciones.fechaHasta]
 * @param {string} [opciones.fechaVtoPago]
 * @param {string} [opciones.carpetaPDF] @param {string} [opciones.nombreArchivoPDF]
 * @param {number} [opciones.unidadMedida=7]
 * @returns {{data: Object, warnings: string[], resumen: Object}}
 * @throws {Error} si la factura no tiene letra reconocible o monto override inválido.
 */
function armarNotaDesdeFactura(factura, opciones = {}) {
    const warnings = [];

    const tipoNota = opciones.tipoNota === 'debito' ? 'debito' : 'credito';
    const letra = String(factura.letra || '').toUpperCase();

    const tipoComprobante = (NOTA_VALUES[tipoNota] || {})[letra];
    if (!tipoComprobante) {
        throw new Error(
            `No puedo armar la nota: letra de comprobante no reconocida ("${factura.tipoComprobante}").`
        );
    }

    // La letra manda: C = monotributo (sin IVA), A/B = responsable inscripto.
    const tipoContribuyente = letra === 'C' ? 'C' : 'B';

    // --- Monto / factor de escala (para NC parcial) ---
    const totalOriginal = factura.total != null ? factura.total : (factura.netoGravado || 0);
    let factor = 1;
    if (opciones.montoOverride != null && opciones.montoOverride !== '') {
        const override = Number(opciones.montoOverride);
        if (!(override > 0)) {
            throw new Error('El monto de la nota debe ser mayor a 0.');
        }
        if (override > totalOriginal + 0.01) {
            throw new Error(`El monto de la nota (${override}) no puede superar el total original (${totalOriginal}).`);
        }
        factor = totalOriginal > 0 ? override / totalOriginal : 1;
    }

    if (factura.otrosTributos && factura.otrosTributos > 0) {
        warnings.push(
            `La factura ${factura.puntoVenta}-${factura.comprobanteNumero} tiene Otros Tributos ` +
            `($${factura.otrosTributos}) que la nota NO replica (paso_3 solo maneja neto + IVA).`
        );
    }

    // --- Descripción concatenada ---
    const conceptoOriginal = (factura.descripciones || []).filter(Boolean).join(' | ');
    const prefijo = tipoNota === 'debito' ? 'Nota de Débito' : 'Nota de Crédito';
    const descripcion =
        `${prefijo} de ${factura.tipoComprobante} ${factura.puntoVenta}-${factura.comprobanteNumero}` +
        (conceptoOriginal ? `. Concepto original: "${conceptoOriginal}"` : '');

    const unidadMedida = opciones.unidadMedida || 7; // 7 = unidades

    // --- Líneas de detalle ---
    const lineasDetalle = [];

    // CAMINO PREFERIDO: una línea por ÍTEM (con su importe real del Excel). Aplica
    // cuando hay ítems con importe, el comprobante tiene UNA sola alícuota (o es
    // exento/monotributo) y NO es una nota parcial (sin montoOverride). Resuelve el
    // límite de 400 chars (cada ítem es más corto) y deja montos reales por línea.
    const itemsConImporte = (Array.isArray(factura.items) ? factura.items : [])
        .filter(it => it && typeof it.importe === 'number' && it.importe > 0);
    const ali = alicuotaUnica(factura, tipoContribuyente);
    // El monto solo cuenta como "parcial" si REDUCE el total. El picker manda el
    // total por defecto (monto editable precargado), y eso NO es una reducción:
    // en ese caso sí queremos el camino por ítem.
    const ovr = (opciones.montoOverride == null || opciones.montoOverride === '') ? null : Number(opciones.montoOverride);
    const esParcial = ovr != null && ovr > 0 && ovr < totalOriginal - 0.01;

    if (itemsConImporte.length && ali.ok && !esParcial) {
        for (const it of itemsConImporte) {
            lineasDetalle.push({
                descripcion: clamp(it.descripcion) || descripcion,
                unidadMedida, cantidad: 1,
                precioUnitario: round2(it.importe),
                alicuotaIVA: ali.value
            });
        }
    } else if (tipoContribuyente === 'C') {
        // Monotributo: sin IVA, una sola línea por el total.
        lineasDetalle.push({
            descripcion, unidadMedida, cantidad: 1,
            precioUnitario: round2(totalOriginal * factor),
            alicuotaIVA: null
        });
    } else {
        let netoAsignado = 0;
        for (const { tasa, campo } of ALICUOTAS) {
            const ivaMonto = factura[campo];
            if (typeof ivaMonto === 'number' && ivaMonto > 0) {
                const neto = ivaMonto / (parseFloat(tasa) / 100);
                netoAsignado += neto;
                lineasDetalle.push({
                    descripcion, unidadMedida, cantidad: 1,
                    precioUnitario: round2(neto * factor),
                    alicuotaIVA: ALICUOTA_VALUE[tasa]
                });
            }
        }
        // Resto del neto gravado no cubierto por alícuotas con IVA → gravado al 0%
        // (hay base gravada declarada, pero su IVA es 0).
        const netoTotal = factura.netoGravado || 0;
        const resto = netoTotal - netoAsignado;
        if (resto > 0.01) {
            lineasDetalle.push({
                descripcion, unidadMedida, cantidad: 1,
                precioUnitario: round2(resto * factor),
                alicuotaIVA: ALICUOTA_VALUE['0']
            });
        }
        // Ni neto gravado ni IVA, solo total → comprobante EXENTO (caso típico:
        // servicios exentos, p. ej. traslado de afiliados con discapacidad). AFIP
        // usa "Exento" (value 2), distinto de 0%. El Excel de consulta no guarda el
        // importe exento por separado, así que tomamos el total.
        if (lineasDetalle.length === 0) {
            warnings.push(
                `La factura ${factura.puntoVenta}-${factura.comprobanteNumero} no trae neto ni IVA en el Excel; ` +
                `asumo EXENTO por el total. Verificá en la captura (si en realidad era gravada, la consulta ` +
                `perdió el desglose).`
            );
            lineasDetalle.push({
                descripcion, unidadMedida, cantidad: 1,
                precioUnitario: round2(totalOriginal * factor),
                alicuotaIVA: EXENTO_VALUE
            });
        }
    }

    let { tipoDocumento, numeroDocumento } = detectarDocumento(factura.cuitReceptor);

    // Excels viejos de Consulta de Comprobantes traen como receptor el CUIT del
    // emisor en facturas a Consumidor Final (bug del parser ya corregido). AFIP
    // rechaza "receptor = emisor", así que lo tratamos como Consumidor Final.
    const cuitEmisor = String(opciones.cuitEmisor || '').replace(/\D/g, '');
    if (cuitEmisor && numeroDocumento === cuitEmisor) {
        warnings.push(
            `La factura ${factura.puntoVenta}-${factura.comprobanteNumero} tiene como receptor el CUIT del ` +
            `propio emisor (Excel generado con un parser viejo); la nota va a Consumidor Final.`
        );
        numeroDocumento = '';
    }

    const data = {
        tipoActividad: opciones.tipoActividad || 'Servicio',
        tipoContribuyente,
        tipoComprobante, // value del select de AFIP para la NC/ND con su letra
        comprobanteAsociado: {
            tipo: factura.tipoComprobante,       // texto; paso_2 lo matchea por texto
            puntoVenta: factura.puntoVenta,
            numero: factura.comprobanteNumero,
            fecha: factura.fechaEmision
        },
        fechaComprobante: opciones.fechaComprobante || fechaHoy(),
        puntoVenta: opciones.puntoVenta,
        fechaDesde: opciones.fechaDesde,
        fechaHasta: opciones.fechaHasta,
        fechaVtoPago: opciones.fechaVtoPago,
        receptor: {
            tipoDocumento,
            numeroDocumento,
            condicionIVA: mapearCondicionIVA(factura.condicionIvaReceptor),
            condicionesVenta: mapearCondicionVenta(factura.condicionVenta),
            nombreCliente: factura.razonSocialReceptor || ''
        },
        lineasDetalle,
        carpetaPDF: opciones.carpetaPDF || null,
        nombreArchivoPDF: opciones.nombreArchivoPDF || null
    };

    const resumen = {
        tipoNota,
        letra,
        tipoComprobanteValue: tipoComprobante,
        asociado: `${factura.tipoComprobante} ${factura.puntoVenta}-${factura.comprobanteNumero}`,
        totalOriginal: round2(totalOriginal),
        totalNota: round2(totalOriginal * factor),
        cantidadLineas: lineasDetalle.length
    };

    return { data, warnings, resumen };
}

module.exports = { armarNotaDesdeFactura, NOTA_VALUES, ALICUOTA_VALUE };
