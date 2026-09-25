// ============================================================================
// PROCESADOR BBVA - CUENTA EMPRESAS PERSONA JURIDICA
// ============================================================================
// Maneja múltiples tablas principales (cuentas) y múltiples subtablas (impuestos)
// Cada tabla se retorna como elemento independiente en array secuencial

// --- FUNCIONES DE UTILIDAD ---
function esMonetario(str) {
    if (typeof str !== 'string') return false;
    return /^-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?$/.test(str.trim()) || /^-?\d+(?:\.\d{2})?$/.test(str.trim());
}

function normalizarMonetario(str) {
    if (typeof str !== 'string' || str.trim() === '') return 0;
    let numeroNormalizado = str.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(numeroNormalizado);
    return isNaN(parsed) ? 0 : parsed;
}

function normalizarTexto(str) {
    if (typeof str !== 'string') return '';
    // Limpia espacios múltiples y normaliza caracteres especiales comunes
    return str.trim().replace(/\s+/g, ' ');
}

function extraerTextoCompleto(fila) {
    if (!fila || !fila.items) return '';
    return fila.items.map(item => item.str).join(' ').trim();
}

// --- DETECTORES DE PATRONES ---
const PATRONES = {
    // Detecta inicio de tabla principal: "CC $ 286-007204/3" o "CC U$S 286-060422/6"
    inicioCuenta: /CC\s+[$U][S$]*\s+\d{3}-\d{6}\/\d/i,

    // Detecta encabezado de movimientos (puede tener letras separadas como "D É BITO")
    encabezadoMovimientos: /FECHA.*ORIGEN.*CONCEPTO.*D[EÉ\s]*BITO.*CR[EÉ\s]*DITO.*SALDO/i,

    // Detecta fin de tabla principal
    totalMovimientos: /TOTAL\s+MOVIMIENTOS/i,

    // Detecta saldo final
    saldoFinal: /SALDO\s+AL\s+\d{1,2}\s+DE\s+\w+/i,

    // Detecta inicio de subtabla de impuestos (texto puede estar mal formado)
    inicioImpuestos: /Impuesto.*d[eé\s]*bito.*cr[eé\s]*dito/i,

    // Detecta fin de subtabla (línea de período con total)
    finImpuestos: /PERIODO.*TOTAL.*DEBITADO/i,

    // Detecta fecha de movimiento (DD/MM o DD/MM/YY)
    fecha: /^\d{2}\/\d{2}/,

    // Detecta saldo anterior
    saldoAnterior: /SALDO\s+ANTERIOR/i
};

// --- MAPAS DE DISEÑO ---
const MAPA_MOVIMIENTOS = {
    columnas: [
        { nombre: "Fecha",    inicioX: 60,  finX: 95 },
        { nombre: "Origen",   inicioX: 95,  finX: 134 },
        { nombre: "Concepto", inicioX: 134, finX: 300 },
        { nombre: "Débito",   inicioX: 300, finX: 420 },
        { nombre: "Crédito",  inicioX: 420, finX: 490 },
        { nombre: "Saldo",    inicioX: 490, finX: 600 }
    ]
};

const MAPA_IMPUESTOS = {
    columnas: [
        { nombre: "DebitoCobrado",   inicioX: 98,  finX: 192 },
        { nombre: "CreditoCobrado",  inicioX: 192, finX: 285 },
        { nombre: "DebitoDevuelto",  inicioX: 285, finX: 380 },
        { nombre: "CreditoDevuelto", inicioX: 380, finX: 473 },
        { nombre: "ImpuestoNeto",    inicioX: 473, finX: 550 }
    ]
};

// --- FUNCIONES DE MAPEO ---
function encontrarColumnaPorLayout(itemX, layout) {
    const columna = layout.columnas.find(c => itemX >= c.inicioX && itemX < c.finX);
    return columna ? columna.nombre : null;
}

function convertirFilaAObjeto(lineaItems, layout, columnasMonetarias = []) {
    const registro = {};
    layout.columnas.forEach(c => registro[c.nombre] = '');

    lineaItems.forEach(item => {
        const colName = encontrarColumnaPorLayout(item.transform[4], layout);
        if (colName && item.str.trim()) {
            registro[colName] = (registro[colName] + ' ' + item.str.trim()).trim();
        }
    });

    // Normalizar valores monetarios
    for (const key in registro) {
        if (columnasMonetarias.includes(key)) {
            registro[key] = normalizarMonetario(registro[key]);
        } else {
            registro[key] = normalizarTexto(registro[key]);
        }
    }

    return Object.values(registro).some(v => v !== '' && v !== 0) ? registro : null;
}

// --- PROCESADOR DE TABLA PRINCIPAL (MOVIMIENTOS) ---
function procesarTablaPrincipal(filas, indiceInicio, nombreCuenta) {
    const movimientos = [];
    let indiceFin = indiceInicio + 1; // Siempre avanzar al menos 1 para evitar loops
    let encontroEncabezado = false;

    // Buscar encabezado de la tabla (buscar hasta 20 líneas adelante)
    const limitesBusqueda = Math.min(indiceInicio + 20, filas.length);
    for (let i = indiceInicio; i < limitesBusqueda; i++) {
        const texto = extraerTextoCompleto(filas[i]).toUpperCase();

        // Detección más simple: buscar palabras clave sin importar caracteres especiales
        const tieneFecha = texto.includes('FECHA');
        const tieneOrigen = texto.includes('ORIGEN');
        const tieneConcepto = texto.includes('CONCEPTO');
        const tieneDebito = texto.includes('BITO'); // Detecta "DÉBITO" o "DEBITO" o "D É BITO"
        const tieneCredito = texto.includes('DITO'); // Detecta "CRÉDITO" o "CREDITO" o "CR É DITO"
        const tieneSaldo = texto.includes('SALDO');

        if (tieneFecha && tieneOrigen && tieneConcepto && tieneDebito && tieneCredito && tieneSaldo) {
            encontroEncabezado = true;
            indiceFin = i + 1;
            break;
        }
    }

    if (!encontroEncabezado) {
        console.warn(`[BBVA] No se encontró encabezado de movimientos para ${nombreCuenta} en las siguientes ${limitesBusqueda - indiceInicio} líneas`);
        return { movimientos: [], indiceFin: indiceInicio + 1 }; // Avanzar 1 línea para evitar loop
    }

    // Procesar movimientos hasta encontrar "TOTAL MOVIMIENTOS"
    let i = indiceFin;
    while (i < filas.length) {
        const texto = extraerTextoCompleto(filas[i]);

        // Verificar fin de tabla
        if (PATRONES.totalMovimientos.test(texto) || PATRONES.saldoFinal.test(texto)) {
            indiceFin = i;
            break;
        }

        // Ignorar línea de "SALDO ANTERIOR"
        if (PATRONES.saldoAnterior.test(texto)) {
            i++;
            continue;
        }

        // Verificar si es inicio de movimiento (tiene fecha)
        const primerItem = filas[i].items.find(item => item.str.trim() !== '');
        if (!primerItem || !PATRONES.fecha.test(primerItem.str.trim())) {
            i++;
            continue;
        }

        // Procesar solo la fila actual (sin agrupar multi-línea)
        const movimiento = convertirFilaAObjeto(
            filas[i].items,
            MAPA_MOVIMIENTOS,
            ['Débito', 'Crédito', 'Saldo']
        );

        if (movimiento) {
            movimientos.push(movimiento);
        }

        i++;
    }

    return { movimientos, indiceFin };
}

// --- PROCESADOR DE SUBTABLA (IMPUESTOS) ---
function procesarSubtablaImpuestos(filas, indiceInicio) {
    let periodo = '';
    let datos = {
        debitoCobrado: 0,
        creditoCobrado: 0,
        debitoDevuelto: 0,
        creditoDevuelto: 0,
        impuestoNeto: 0,
        periodoSIRCREB: '',
        totalDebitado: 0
    };
    let indiceFin = indiceInicio;

    // Extraer período del mes (buscar "FEBRERO 2023" o similar)
    for (let i = indiceInicio; i < Math.min(indiceInicio + 5, filas.length); i++) {
        const texto = extraerTextoCompleto(filas[i]);
        const matchPeriodo = texto.match(/([A-Z]+)\s+(\d{4})/);
        if (matchPeriodo) {
            periodo = `${matchPeriodo[1]} ${matchPeriodo[2]}`;
            break;
        }
    }

    // Buscar fila con los valores numéricos de impuestos
    let encontroDatos = false;
    for (let i = indiceInicio + 1; i < filas.length; i++) {
        const texto = extraerTextoCompleto(filas[i]);
        const textoUpper = texto.toUpperCase();

        // NUEVO: Detectar inicio de otra subtabla (terminar antes de ella)
        if (i > indiceInicio + 5 && textoUpper.includes('IMPUESTO') && textoUpper.includes('BITO') && textoUpper.includes('DITO')) {
            console.log(`[BBVA] Detectada nueva subtabla en línea ${i}, terminando subtabla actual`);
            break;
        }

        // Verificar fin de subtabla
        if (PATRONES.finImpuestos.test(texto)) {
            indiceFin = i;

            // Extraer datos de SIRCREB de esta misma línea
            const matchSIRCREB = texto.match(/PERIODO\s+([\d\/]+\s+AL\s+[\d\/]+).*DEBITADO[.\s]*([\d.,]+)/i);
            if (matchSIRCREB) {
                datos.periodoSIRCREB = matchSIRCREB[1];
                datos.totalDebitado = normalizarMonetario(matchSIRCREB[2]);
            }
            break;
        }

        // Buscar fila con 5 valores numéricos (los totales de impuestos)
        const items = filas[i].items;
        const numerosEnFila = items.filter(item => esMonetario(item.str.trim()));

        if (numerosEnFila.length >= 5 && !encontroDatos) {
            // Mapear por posición X
            const valoresPorPosicion = items
                .filter(item => esMonetario(item.str.trim()))
                .map(item => ({
                    x: item.transform[4],
                    valor: normalizarMonetario(item.str.trim())
                }))
                .sort((a, b) => a.x - b.x);

            if (valoresPorPosicion.length >= 5) {
                datos.debitoCobrado = valoresPorPosicion[0].valor;
                datos.creditoCobrado = valoresPorPosicion[1].valor;
                datos.debitoDevuelto = valoresPorPosicion[2].valor;
                datos.creditoDevuelto = valoresPorPosicion[3].valor;
                datos.impuestoNeto = valoresPorPosicion[4].valor;
                encontroDatos = true;
            }
        }
    }

    return {
        periodo,
        datos,
        indiceFin: indiceFin > indiceInicio ? indiceFin : indiceInicio + 1
    };
}

// --- FUNCIÓN PRINCIPAL ---
async function procesarBbvaCuentaEmpresaPersonaJuridica(allFilas, metadata = {}) {
    const tablas = [];
    let i = 0;
    let cuentaActual = ''; // Trackear la cuenta actual para asociar subtablas

    console.log(`[BBVA] Iniciando procesamiento de ${allFilas.length} filas...`);

    while (i < allFilas.length) {
        const texto = extraerTextoCompleto(allFilas[i]);
        const textoUpper = texto.toUpperCase();

        // --- DETECTAR SUBTABLA DE IMPUESTOS PRIMERO ---
        // (Para capturar múltiples subtablas seguidas antes de buscar nueva tabla principal)
        if (textoUpper.includes('IMPUESTO') && textoUpper.includes('BITO') && textoUpper.includes('DITO')) {
            const { periodo, datos, indiceFin } = procesarSubtablaImpuestos(allFilas, i);

            // Incluir cuenta actual en el nombre para hacerlo único
            const cuentaSufijo = cuentaActual.replace(/[^a-zA-Z0-9]/g, '_');
            const nombreTabla = periodo
                ? `Impuestos_${cuentaSufijo}_${periodo.replace(/\s+/g, '_')}`
                : `Impuestos_${cuentaSufijo}`;

            // Convertir datos de objeto a array para que sea compatible con Excel
            const datosArray = [
                {
                    "TOTAL COBRADO DEBITOS": datos.debitoCobrado,
                    "TOTAL COBRADO CREDITOS": datos.creditoCobrado,
                    "TOTAL DEVUELTO DEBITOS": datos.debitoDevuelto,
                    "TOTAL DEVUELTO CREDITOS": datos.creditoDevuelto,
                    "IMPUESTO NETO RETENIDO": datos.impuestoNeto
                },
                {
                    "PERIODO SIRCREB": datos.periodoSIRCREB,
                    "TOTAL DEBITADO": datos.totalDebitado
                }
            ];

            tablas.push({
                tipo: 'subtabla',
                titulo: nombreTabla,
                nombre: periodo ? `Impuestos - ${periodo}` : 'Impuestos',
                periodo: periodo,
                cuenta: cuentaActual,
                datos: datosArray
            });

            // Asegurar que siempre avanzamos
            i = Math.max(indiceFin, i + 1);
            continue;
        }

        // --- DETECTAR TABLA PRINCIPAL ---
        const matchCuenta = texto.match(PATRONES.inicioCuenta);
        if (matchCuenta) {
            const nombreCuenta = matchCuenta[0];

            // Verificar que tenga encabezado de movimientos en las siguientes líneas
            let tieneEncabezado = false;
            const limiteVerificacion = Math.min(i + 5, allFilas.length);
            for (let j = i; j < limiteVerificacion; j++) {
                const textoSig = extraerTextoCompleto(allFilas[j]).toUpperCase();
                if (textoSig.includes('FECHA') && textoSig.includes('ORIGEN') && textoSig.includes('CONCEPTO')) {
                    tieneEncabezado = true;
                    break;
                }
            }

            // Solo procesar si tiene encabezado de movimientos
            if (tieneEncabezado) {
                // Actualizar cuenta actual
                cuentaActual = nombreCuenta;

                // Procesar movimientos
                const { movimientos, indiceFin } = procesarTablaPrincipal(allFilas, i, nombreCuenta);

                // Solo agregar si encontró movimientos
                if (movimientos.length > 0) {
                    tablas.push({
                        tipo: 'principal',
                        titulo: `Movimientos_${nombreCuenta.replace(/[^a-zA-Z0-9]/g, '_')}`,
                        nombre: nombreCuenta,
                        cuenta: nombreCuenta,
                        datos: movimientos
                    });

                    console.log(`[BBVA] Procesados ${movimientos.length} movimientos para ${nombreCuenta}`);
                }

                // Asegurar que siempre avanzamos
                i = Math.max(indiceFin, i + 1);
                continue;
            } else {
                // No tiene encabezado, no es una tabla principal, seguir adelante
                i++;
                continue;
            }
        }

        i++;
    }

    console.log(`[BBVA] Procesamiento completado. Total de tablas encontradas: ${tablas.length}`);

    // Usar el nombre del PDF original para el Excel
    let nombreExcel = 'BBVA_Cuenta_Empresa.xlsx';
    if (metadata.nombreArchivo) {
        nombreExcel = metadata.nombreArchivo.replace(/\.pdf$/i, '.xlsx');
    }

    return {
        exito: true,
        tablas: tablas,
        suggestedFileName: nombreExcel
    };
}

module.exports = {
    procesarBbvaCuentaEmpresaPersonaJuridica
};
