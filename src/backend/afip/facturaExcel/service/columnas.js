// facturaExcel/service/columnas.js
// Las dos hojas del Excel y sus columnas: las usan el modelo (para escribir los
// encabezados) y el lector (para encontrarlas por nombre, en cualquier orden).

const HOJA_FACTURAS = 'Facturas';
const HOJA_LINEAS = 'Líneas';

// clave interna → encabezado que ve el usuario
const COLUMNAS_FACTURAS = [
    { clave: 'numero', titulo: 'N°', ancho: 6 },
    { clave: 'fecha', titulo: 'Fecha', ancho: 12 },
    { clave: 'comprobante', titulo: 'Comprobante', ancho: 18 },
    { clave: 'actividad', titulo: 'Actividad', ancho: 11 },
    { clave: 'desde', titulo: 'Desde', ancho: 12 },
    { clave: 'hasta', titulo: 'Hasta', ancho: 12 },
    { clave: 'vtoPago', titulo: 'Vto. pago', ancho: 12 },
    { clave: 'documento', titulo: 'N° doc.', ancho: 14 },
    { clave: 'condicionIva', titulo: 'Condición IVA', ancho: 24 },
    { clave: 'condicionVenta', titulo: 'Condición de venta', ancho: 30 },
    { clave: 'nombre', titulo: 'Nombre', ancho: 24 },
];

const COLUMNAS_LINEAS = [
    { clave: 'factura', titulo: 'N° factura', ancho: 10 },
    { clave: 'descripcion', titulo: 'Descripción', ancho: 40 },
    { clave: 'cantidad', titulo: 'Cantidad', ancho: 10 },
    { clave: 'unidad', titulo: 'Unidad', ancho: 14 },
    { clave: 'precio', titulo: 'Precio unitario', ancho: 16 },
    { clave: 'alicuota', titulo: 'Alícuota IVA', ancho: 12 },
];

// "N° doc." / "n doc" / "Nº DOC" → "ndoc": así un encabezado escrito a mano igual se reconoce.
function normalizarTitulo(texto) {
    return String(texto || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]/g, '');
}

module.exports = { HOJA_FACTURAS, HOJA_LINEAS, COLUMNAS_FACTURAS, COLUMNAS_LINEAS, normalizarTitulo };
