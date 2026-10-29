// facturaExcel/service/leerExcelFacturas.js
// Lee el Excel de facturas (hojas "Facturas" y "Líneas"), valida fila por fila y
// arma los grupos que entiende el motor de Factura Tipificada
// (facturaTipificada:generarLote): un grupo por factura, con su cabezal y sus líneas.
// Lo que falta del grupo (usuario, PDV, empresa, modo prueba) lo agrega la vista.

const { cuitValido } = require('../../importarLibroIva/service/validarArchivosIva.js');
const {
    COMPROBANTES, esLetraA, ACTIVIDADES, CONDICIONES_IVA, CONSUMIDOR_FINAL,
    CONDICIONES_VENTA, CONDICION_VENTA_DEFECTO, UNIDADES, ALICUOTAS, ALICUOTA_DEFECTO,
} = require('./catalogo.js');
const { HOJA_FACTURAS, HOJA_LINEAS, COLUMNAS_FACTURAS, COLUMNAS_LINEAS, normalizarTitulo } = require('./columnas.js');

// ---------- valores de celda ----------

// Lo que exceljs devuelve en una celda → valor simple (texto, número o Date).
function valorDe(celda) {
    const v = celda && celda.value;
    if (v === null || v === undefined) return '';
    if (v instanceof Date || typeof v === 'number') return v;
    if (typeof v === 'object') {
        if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('');
        if ('result' in v) return v.result ?? '';
        if ('text' in v) return v.text;
        return '';
    }
    return String(v);
}

const texto = (v) => (v instanceof Date ? '' : String(v ?? '')).trim();
const dosDigitos = (n) => String(n).padStart(2, '0');

// Fecha de celda → "dd/mm/aaaa"; '' si está vacía; null si no se entiende.
function fechaDe(v) {
    if (v === '' || v === null || v === undefined) return '';
    let d = null;
    if (v instanceof Date) d = v;
    else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 86400000));   // serial de Excel
    if (d) return isNaN(d) ? null : `${dosDigitos(d.getUTCDate())}/${dosDigitos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    const t = texto(v);
    let m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (!m) {
        const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (iso) m = [null, iso[3], iso[2], iso[1]];
    }
    if (!m) return null;
    const [dia, mes, anio] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const prueba = new Date(Date.UTC(anio, mes - 1, dia));
    if (prueba.getUTCDate() !== dia || prueba.getUTCMonth() !== mes - 1) return null;
    return `${dosDigitos(dia)}/${dosDigitos(mes)}/${anio}`;
}

// Número de celda → number; '' si está vacía; NaN si no se entiende.
// Texto con coma = formato argentino ("150.000,50"); sin coma, punto decimal.
function numeroDe(v) {
    if (typeof v === 'number') return v;
    const t = texto(v).replace(/[$\s]/g, '');
    if (t === '') return '';
    const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
    return Number.isFinite(n) ? n : NaN;
}

// Busca un texto en una lista sin importar mayúsculas ni acentos.
function buscar(lista, valor, campo = (x) => x) {
    const buscado = normalizarTitulo(valor);
    return lista.find(x => normalizarTitulo(campo(x)) === buscado) || null;
}

// ---------- hojas ----------

// Filas de una hoja como objetos { fila, <clave>: valor } por nombre de columna.
// Devuelve { filas, error } (error = falta la hoja o una columna obligatoria).
function leerHoja(libro, nombreHoja, columnas, obligatorias) {
    const hoja = libro.worksheets.find(h => normalizarTitulo(h.name) === normalizarTitulo(nombreHoja));
    if (!hoja) return { filas: [], error: `Falta la hoja "${nombreHoja}".` };

    const posicion = {};
    hoja.getRow(1).eachCell((celda, col) => {
        const def = columnas.find(c => normalizarTitulo(c.titulo) === normalizarTitulo(valorDe(celda)));
        if (def) posicion[def.clave] = col;
    });
    const faltan = obligatorias.filter(c => !posicion[c]).map(c => `"${columnas.find(x => x.clave === c).titulo}"`);
    if (faltan.length) return { filas: [], error: `Hoja "${nombreHoja}": falta la columna ${faltan.join(', ')}.` };

    const filas = [];
    hoja.eachRow((fila, n) => {
        if (n === 1) return;
        const datos = { fila: n };
        let vacia = true;
        for (const { clave } of columnas) {
            const v = posicion[clave] ? valorDe(fila.getCell(posicion[clave])) : '';
            datos[clave] = v;
            if (texto(v) !== '' || v instanceof Date || typeof v === 'number') vacia = false;
        }
        if (!vacia) filas.push(datos);
    });
    return { filas, error: null };
}

// ---------- validación ----------

function armarFactura(f, tipoEmisor, hoy, errores) {
    const err = (msg) => errores.push(`Facturas, fila ${f.fila}: ${msg}`);
    const antes = errores.length;

    const fecha = fechaDe(f.fecha);
    if (fecha === null) err(`la fecha "${texto(f.fecha)}" no se entiende (usá dd/mm/aaaa).`);
    const fechaComprobante = fecha || hoy;

    const comprobantes = COMPROBANTES[tipoEmisor] || [];
    const comprobante = texto(f.comprobante)
        ? buscar(comprobantes, texto(f.comprobante), c => c.texto)
        : comprobantes[0];
    if (!comprobante) err(`el comprobante "${texto(f.comprobante)}" no se puede emitir (opciones: ${comprobantes.map(c => c.texto).join(', ')}).`);

    const actividad = texto(f.actividad) ? buscar(ACTIVIDADES, texto(f.actividad)) : 'Servicio';
    if (!actividad) err(`la actividad "${texto(f.actividad)}" tiene que ser Servicio o Producto.`);

    const fechasServicio = {};
    for (const [clave, titulo] of [['desde', 'Desde'], ['hasta', 'Hasta'], ['vtoPago', 'Vto. pago']]) {
        const valor = fechaDe(f[clave]);
        if (valor === null) err(`"${titulo}" (${texto(f[clave])}) no se entiende (usá dd/mm/aaaa).`);
        fechasServicio[clave] = valor || fechaComprobante;
    }

    const condicionIva = texto(f.condicionIva)
        ? buscar(CONDICIONES_IVA, texto(f.condicionIva), c => c.texto)
        : CONDICIONES_IVA.find(c => c.codigo === CONSUMIDOR_FINAL);
    if (!condicionIva) err(`la condición IVA "${texto(f.condicionIva)}" no existe.`);

    // Documento: el tipo sale del largo (11 = CUIT, 7 u 8 = DNI). Vacío = consumidor
    // final sin identificar, que solo vale en B/C con Consumidor Final.
    const documento = texto(f.documento).replace(/\D/g, '');
    let tipoDocumento = null;
    if (documento.length === 11) {
        tipoDocumento = 80;
        if (!cuitValido(documento)) err(`el CUIT ${documento} no es válido (dígito verificador).`);
    } else if (documento.length === 7 || documento.length === 8) {
        tipoDocumento = 96;
    } else if (documento) {
        err(`el N° de doc. "${texto(f.documento)}" no es un CUIT (11 dígitos) ni un DNI (7 u 8).`);
    }
    const letraA = comprobante && esLetraA(comprobante.texto);
    if (letraA && tipoDocumento !== 80) err(`${comprobante.texto} necesita el CUIT del receptor.`);
    if (letraA && condicionIva && condicionIva.codigo === CONSUMIDOR_FINAL) err(`${comprobante.texto} no se puede hacer a un Consumidor Final.`);
    if (!letraA && !documento && condicionIva && condicionIva.codigo !== CONSUMIDOR_FINAL) {
        err(`sin N° de doc. el receptor tiene que ser Consumidor Final (dice "${condicionIva.texto}").`);
    }

    const ventas = texto(f.condicionVenta) ? texto(f.condicionVenta).split(';').map(s => s.trim()).filter(Boolean) : [CONDICION_VENTA_DEFECTO];
    const condicionesVenta = [];
    for (const v of ventas) {
        const encontrada = buscar(CONDICIONES_VENTA, v);
        if (encontrada) condicionesVenta.push(encontrada);
        else err(`la condición de venta "${v}" no existe.`);
    }

    if (errores.length > antes) return null;
    return {
        comprobante: comprobante.texto,
        datosComunes: {
            tipoActividad: actividad,
            tipoContribuyente: tipoEmisor,
            tipoComprobante: comprobante.codigo,
            fechaComprobante,
            fechaDesde: fechasServicio.desde,
            fechaHasta: fechasServicio.hasta,
            fechaVtoPago: fechasServicio.vtoPago,
            receptor: {
                tipoDocumento: tipoDocumento || 80,
                numeroDocumento: documento,
                condicionIVA: condicionIva.codigo,
                condicionesVenta,
                nombreCliente: texto(f.nombre),
            },
            comprobanteAsociado: null,
        },
        receptor: documento ? `${texto(f.nombre) || documento}${texto(f.nombre) ? ` (${documento})` : ''}` : 'Consumidor final',
    };
}

// Excel guarda "21%" como 0.21 si la celda tiene formato porcentaje: 0.21 → "21%", 0.105 → "10,5%".
function alicuotaComoTexto(v) {
    if (typeof v !== 'number') return texto(v);
    const porcentaje = Math.round((v < 1 ? v * 100 : v) * 10) / 10;
    return `${String(porcentaje).replace('.', ',')}%`;
}

function armarLinea(l, tipoEmisor, errores) {
    const err = (msg) => errores.push(`Líneas, fila ${l.fila}: ${msg}`);
    const antes = errores.length;

    const descripcion = texto(l.descripcion);
    if (!descripcion) err('falta la descripción.');

    const cantidad = numeroDe(l.cantidad) === '' ? 1 : numeroDe(l.cantidad);
    if (!(cantidad > 0)) err(`la cantidad "${texto(l.cantidad)}" tiene que ser un número mayor a 0.`);

    const unidad = texto(l.unidad) ? buscar(UNIDADES, texto(l.unidad)) : 'unidades';
    if (!unidad) err(`la unidad "${texto(l.unidad)}" no existe en AFIP.`);

    const precio = numeroDe(l.precio);
    if (precio === '') err('falta el precio unitario.');
    else if (!(precio > 0)) err(`el precio "${texto(l.precio)}" tiene que ser un número mayor a 0.`);

    const linea = { descripcion, unidadMedida: unidad, cantidad, precioUnitario: Math.round(precio * 100) / 100 };
    if (tipoEmisor === 'B') {
        const escrita = alicuotaComoTexto(l.alicuota);
        const alicuota = escrita ? buscar(ALICUOTAS, escrita, a => a.texto) : ALICUOTAS.find(a => a.codigo === ALICUOTA_DEFECTO);
        if (!alicuota) err(`la alícuota "${escrita}" no existe (opciones: ${ALICUOTAS.map(a => a.texto).join(', ')}).`);
        else linea.alicuotaIVA = alicuota.codigo;
    }
    return errores.length > antes ? null : linea;
}

/**
 * @param {import('exceljs').Workbook} libro  Excel ya cargado
 * @param {{ tipoEmisor: 'B'|'C', hoy: string }} opciones  hoy = "dd/mm/aaaa" (fecha por defecto)
 * @returns {{ facturas: Array, errores: string[] }}
 *   facturas: [{ numero, fila, comprobante, receptor, lineas, total, grupo }] (grupo = lo que va al motor)
 *   Con algún error, facturas viene igual (para la vista previa) pero no se debe emitir.
 */
function leerExcelFacturas(libro, { tipoEmisor, hoy }) {
    const errores = [];
    if (tipoEmisor !== 'B' && tipoEmisor !== 'C') {
        return { facturas: [], errores: ['El cliente no tiene tipo de contribuyente (B o C): cargalo en Clientes.'] };
    }

    const hojaF = leerHoja(libro, HOJA_FACTURAS, COLUMNAS_FACTURAS, ['numero', 'documento']);
    const hojaL = leerHoja(libro, HOJA_LINEAS, COLUMNAS_LINEAS, ['factura', 'descripcion', 'precio']);
    for (const h of [hojaF, hojaL]) if (h.error) errores.push(h.error);
    if (errores.length) return { facturas: [], errores };
    if (hojaF.filas.length === 0) return { facturas: [], errores: [`La hoja "${HOJA_FACTURAS}" no tiene facturas.`] };

    // Facturas por N° (sin repetir)
    const porNumero = new Map();
    for (const f of hojaF.filas) {
        const numero = numeroDe(f.numero);
        if (!Number.isInteger(numero) || numero <= 0) {
            errores.push(`Facturas, fila ${f.fila}: el N° "${texto(f.numero)}" tiene que ser un número entero (1, 2, 3…).`);
            continue;
        }
        if (porNumero.has(numero)) {
            errores.push(`Facturas, fila ${f.fila}: el N° ${numero} está repetido (también en la fila ${porNumero.get(numero).fila}).`);
            continue;
        }
        porNumero.set(numero, { fila: f.fila, cabezal: armarFactura(f, tipoEmisor, hoy, errores), lineas: [] });
    }

    for (const l of hojaL.filas) {
        const numero = numeroDe(l.factura);
        const factura = porNumero.get(numero);
        if (!factura) {
            errores.push(`Líneas, fila ${l.fila}: la factura N° ${texto(l.factura) || '(vacío)'} no está en la hoja "${HOJA_FACTURAS}".`);
            continue;
        }
        const linea = armarLinea(l, tipoEmisor, errores);
        if (linea) factura.lineas.push(linea);
        else factura.lineaMala = true;
    }

    const facturas = [];
    for (const [numero, f] of [...porNumero].sort((a, b) => a[0] - b[0])) {
        if (f.lineas.length === 0 && !f.lineaMala) errores.push(`Factura N° ${numero} (fila ${f.fila}): no tiene líneas en la hoja "${HOJA_LINEAS}".`);
        if (!f.cabezal) continue;
        facturas.push({
            numero,
            fila: f.fila,
            fecha: f.cabezal.datosComunes.fechaComprobante,
            comprobante: f.cabezal.comprobante,
            receptor: f.cabezal.receptor,
            lineas: f.lineas.length,
            total: Math.round(f.lineas.reduce((s, l) => s + l.cantidad * l.precioUnitario, 0) * 100) / 100,
            grupo: { datosComunes: f.cabezal.datosComunes, facturas: [{ numeroFactura: numero, lineasDetalle: f.lineas }] },
        });
    }
    return { facturas, errores };
}

module.exports = { leerExcelFacturas, fechaDe, numeroDe };
