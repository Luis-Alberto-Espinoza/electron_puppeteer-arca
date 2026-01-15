/**
 * Procesador de datos para facturas de cliente específico
 * Recibe datos estructurados desde el frontend y los prepara para el flujo de Puppeteer
 * SOPORTA MÚLTIPLES FACTURAS: puede recibir un array de facturas o una sola factura
 */

function procesarDatosFacturaCliente(data) {
    console.log("Procesando datos de factura para cliente:", data);

    // Si recibimos un array, procesar cada factura
    if (Array.isArray(data)) {
        console.log(`Procesando ${data.length} facturas`);
        return data.map((factura, index) => {
            console.log(`  - Procesando factura ${index + 1}/${data.length}`);
            return procesarFacturaIndividual(factura);
        });
    }

    // Si es un objeto único, procesarlo directamente
    return procesarFacturaIndividual(data);
}

/**
 * Procesa una factura individual
 */
function procesarFacturaIndividual(data) {
    // Validar datos mínimos requeridos
    if (!data.tipoActividad || !data.tipoContribuyente) {
        throw new Error("Faltan datos obligatorios: tipoActividad y tipoContribuyente");
    }

    // Estructura de datos esperada desde el frontend
    const facturaCliente = {
        // Datos básicos (igual que factura normal)
        tipoActividad: data.tipoActividad, // "Producto" o "Servicio"
        tipoContribuyente: data.tipoContribuyente, // "B" o "C"
        fechaComprobante: data.fechaComprobante, // Formato: DD/MM/YYYY

        // Datos de emisión (Paso 1)
        puntoVenta: data.puntoVenta, // Número de punto de venta
        fechaDesde: data.fechaDesde, // Para servicios: DD/MM/YYYY
        fechaHasta: data.fechaHasta, // Para servicios: DD/MM/YYYY
        fechaVtoPago: data.fechaVtoPago, // DD/MM/YYYY

        // Datos del receptor (Paso 2) - NUEVO
        receptor: {
            tipoDocumento: data.receptor?.tipoDocumento || 80, // 80=CUIT, 96=DNI
            numeroDocumento: data.receptor?.numeroDocumento, // CUIT o DNI sin guiones
            condicionIVA: data.receptor?.condicionIVA || 5, // Ver mapeo abajo
            condicionesVenta: data.receptor?.condicionesVenta || ["Cuenta Corriente"], // Array de strings
            nombreCliente: data.receptor?.nombreCliente || "" // Opcional, para carpeta PDF
        },

        // Datos de operación (Paso 3) - NUEVO: múltiples líneas
        lineasDetalle: data.lineasDetalle || [{
            descripcion: data.descripcion || "Servicio profesional",
            unidadMedida: data.unidadMedida || 7, // Ver mapeo abajo (7=unidades)
            cantidad: data.cantidad || 1,
            precioUnitario: data.precioUnitario || 0,
            alicuotaIVA: data.tipoContribuyente === 'B' ? (data.alicuotaIVA || 5) : null // Solo para B
        }],

        // Configuración de guardado
        carpetaPDF: data.carpetaPDF || null, // Ruta donde guardar el PDF
        nombreArchivoPDF: data.nombreArchivoPDF || null // Nombre del archivo PDF
    };

    // Validar datos del receptor
    if (!facturaCliente.receptor.numeroDocumento) {
        throw new Error("El número de documento del receptor es obligatorio");
    }

    // Validar que haya al menos una línea de detalle
    if (!facturaCliente.lineasDetalle || facturaCliente.lineasDetalle.length === 0) {
        throw new Error("Debe haber al menos una línea de detalle");
    }

    // Validar cada línea de detalle
    facturaCliente.lineasDetalle.forEach((linea, index) => {
        if (!linea.descripcion || linea.precioUnitario === undefined) {
            throw new Error(`Línea ${index + 1}: faltan descripción o precio unitario`);
        }
    });

    return facturaCliente;
}

/**
 * Mapeo de condiciones IVA (según AFIP)
 * Estos valores corresponden al select #idivareceptor del formulario AFIP
 */
const CONDICIONES_IVA = {
    1: "IVA Responsable Inscripto",
    2: "IVA Responsable no Inscripto",
    3: "IVA no Responsable",
    4: "IVA Sujeto Exento",
    5: "Consumidor Final",
    6: "Responsable Monotributo",
    7: "Sujeto No Categorizado",
    8: "Proveedor del Exterior",
    9: "Cliente del Exterior",
    10: "IVA Liberado - Ley Nº 19.640",
    11: "Responsable Inscripto - Agente de Percepción",
    12: "Pequeño Contribuyente Eventual",
    13: "Monotributista Social",
    14: "Pequeño Contribuyente Eventual Social",
    15: "IVA No Alcanzado",
    // Agregar más según necesidad
};

/**
 * Mapeo de unidades de medida (según AFIP)
 * Estos valores corresponden al select de unidad de medida del formulario
 */
const UNIDADES_MEDIDA = {
    1: "kilogramos",
    2: "metros",
    3: "metros cuadrados",
    4: "metros cúbicos",
    5: "litros",
    6: "1000 kWh",
    7: "unidades",
    8: "pares",
    9: "docenas",
    10: "quilates",
    11: "millares",
    12: "gramos",
    13: "milímetros",
    14: "mm cúbicos",
    15: "kilómetros",
    16: "hectolitros",
    17: "centímetros",
    18: "jgo. pqt. mazo naipes",
    19: "cm cúbicos",
    20: "toneladas",
    21: "dam cúbicos",
    22: "hm cúbicos",
    23: "km cúbicos",
    24: "microgramos",
    25: "nanogramos",
    26: "picogramos",
    27: "miligramos",
    28: "mililitros",
    29: "curie",
    30: "milicurie",
    31: "microcurie",
    32: "uiacthor",
    33: "muiacthor",
    34: "kg base",
    35: "gruesa",
    36: "kg bruto",
    37: "uiactant",
    38: "muiactant",
    39: "uiactig",
    40: "muiactig",
    41: "kg activo",
    42: "gramo activo",
    43: "gramo base",
    44: "packs",
    99: "otras unidades"
};

/**
 * Mapeo de condiciones de venta (checkboxes)
 */
const CONDICIONES_VENTA = [
    "Contado",
    "Tarjeta de Débito",
    "Tarjeta de Crédito",
    "Cuenta Corriente",
    "Cheque",
    "Transferencia Bancaria",
    "Otra",
    "Otros medios de pago electrónico"
];

module.exports = {
    procesarDatosFacturaCliente,
    CONDICIONES_IVA,
    UNIDADES_MEDIDA,
    CONDICIONES_VENTA
};
