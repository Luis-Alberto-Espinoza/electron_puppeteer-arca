const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
// Colores, fuentes y formatos compartidos por todos los Excel de salida.
const {
    FILL_TITULO, FONT_TITULO, FILL_ENCABEZADO, FONT_ENCABEZADO, FMT_MONTO,
    estilizarEncabezado, estilizarEtiqueta, aplicarCebra
} = require('../../utils/estilosExcel');

// --- FUNCIONES AUXILIARES ---

function esFecha(str) {
    if (!str) return false;
    return /^\d{2}\/\d{2}\/\d{2,4}$/.test(str.trim());
}

function esImporteMonetario(str) {
    if (!str) return false;
    const patterns = [
        /^-?\d{1,3}(\.\d{3})*,\d{2}$/,
        /^-?\d+,\d{2}$/
    ];
    return patterns.some(p => p.test(str.trim()));
}

function limpiarImporte(str) {
    if (!str) return '';
    return str.replace(/\s+/g, ' ').trim();
}

// Convierte un string monetario argentino ("1.234,56" / "-1.234,56") a Number.
// Si no es parseable, devuelve el string original para no perder información.
function parsearMontoNum(str) {
    if (typeof str === 'number') return str;
    if (typeof str !== 'string' || !str.trim()) return '';
    const s = str.trim();
    const negativo = s.startsWith('-');
    const limpio = s.replace(/^-/, '').replace(/\./g, '').replace(',', '.').trim();
    const num = parseFloat(limpio);
    if (isNaN(num)) return str;
    return negativo ? -Math.abs(num) : num;
}

// Convierte REFERENCIA a Number si es un entero puro; si no, la deja como string.
function parsearReferenciaNum(str) {
    if (typeof str === 'number') return str;
    if (typeof str !== 'string' || !str.trim()) return '';
    const s = str.trim();
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    return s;
}

const COLUMNAS = {
    FECHA:       { min: 15,  max: 65  },
    DESCRIPCION: { min: 65,  max: 255 },
    REFERENCIA:  { min: 255, max: 330 },
    DEBITOS:     { min: 330, max: 415 },
    CREDITOS:    { min: 415, max: 490 },
    SALDO:       { min: 490, max: 650 }
};

// Marcadores que cierran una cuenta (ya no capturamos más filas de esa cuenta).
// IMPORTANTE: TOTAL COBRADO y IIBB SIRCREB fueron REMOVIDOS — ahora se capturan
// como filas extra de la cuenta (totales impositivos debajo del SALDO FINAL).
const MARCADORES_FIN_CUENTA = [
    'ESTIMADO CLIENTE',
    'LINEAS DE CREDITO'
];

// Marcadores que OBLIGAN a salir del modo DETALLE (tabla de movimientos).
// Aparecen en el texto legal / encabezado de la página siguiente y harían que
// el código pegue basura a la descripción del último movimiento.
// No cierran la cuenta (puede continuar en la página siguiente con otro
// "DETALLE DE MOVIMIENTO"), solo detienen la acumulación.
const MARCADORES_SALIDA_DETALLE = [
    'Los depósitos en pesos',
    'Los depositos en pesos',
    'Banco Macro S.A.',
    'Sr(es):',
    'Información de su/s Cuenta/s',
    'Informacion de su/s Cuenta/s',
    'Resumen General',
    'Saldos consolidados',
    'Hoja Nro.'
];

// Patrones de filas de totales/impuestos que van debajo de la tabla de movimientos.
// Se suman como filas adicionales de la cuenta (no cortan la cuenta).
const PATRONES_TOTALES = [
    /TOTAL\s+COBRADO/i,
    /IMPUESTO\s+LEY\s+25413/i,
    /IIBB\s+SIRCREB/i,
    /^D\.\s*\d+\/\d{4}/i  // ej: "D. 409/2018 -" (referencia a decreto)
];

function filaAItems(fila) {
    return fila.items
        .map(it => ({ texto: (it.str || '').trim(), x: it.transform[4] }))
        .filter(it => it.texto);
}

function asignarPorColumna(movimiento, item) {
    const { x, texto } = item;
    if (x >= COLUMNAS.DESCRIPCION.min && x < COLUMNAS.REFERENCIA.min) {
        movimiento.DESCRIPCION += (movimiento.DESCRIPCION ? ' ' : '') + texto;
    } else if (x >= COLUMNAS.REFERENCIA.min && x < COLUMNAS.DEBITOS.min) {
        movimiento.REFERENCIA += (movimiento.REFERENCIA ? ' ' : '') + texto;
    } else if (x >= COLUMNAS.DEBITOS.min && x < COLUMNAS.CREDITOS.min) {
        if (esImporteMonetario(texto)) movimiento.DEBITOS = parsearMontoNum(texto);
    } else if (x >= COLUMNAS.CREDITOS.min && x < COLUMNAS.SALDO.min) {
        if (esImporteMonetario(texto)) movimiento.CREDITOS = parsearMontoNum(texto);
    } else if (x >= COLUMNAS.SALDO.min) {
        if (esImporteMonetario(texto)) movimiento.SALDO = parsearMontoNum(texto);
    }
}

// Parsea una fila del listado "Información de su/s Cuenta/s".
// La fila tiene la particularidad de que MONEDA y NRO_CUENTA pueden venir
// pegados en un solo item (ej: "DOLARES EE2-573-0954896071-9").
function parseFilaInfoCuenta(items) {
    const cuenta = { TIPO: '', SUBTIPO: '', SUCURSAL: '', MONEDA: '', NRO_CUENTA: '', CBU: '' };
    const REGEX_NRO_CUENTA = /(\d+-\d+-\d+-\d+)/;

    for (const it of items) {
        const { x, texto } = it;
        if (x < 100) {
            cuenta.TIPO += (cuenta.TIPO ? ' ' : '') + texto;
        } else if (x < 280) {
            cuenta.SUBTIPO += (cuenta.SUBTIPO ? ' ' : '') + texto;
        } else if (x < 325) {
            cuenta.SUCURSAL += (cuenta.SUCURSAL ? ' ' : '') + texto;
        } else if (x < 455) {
            // Zona MONEDA / NRO_CUENTA (pueden venir pegados)
            const m = texto.match(/^(.*?)(\d+-\d+-\d+-\d+)$/);
            if (m) {
                if (m[1].trim()) cuenta.MONEDA += (cuenta.MONEDA ? ' ' : '') + m[1].trim();
                cuenta.NRO_CUENTA = m[2];
            } else if (REGEX_NRO_CUENTA.test(texto)) {
                cuenta.NRO_CUENTA = texto.match(REGEX_NRO_CUENTA)[1];
            } else {
                cuenta.MONEDA += (cuenta.MONEDA ? ' ' : '') + texto;
            }
        } else {
            cuenta.CBU += (cuenta.CBU ? ' ' : '') + texto;
        }
    }

    Object.keys(cuenta).forEach(k => {
        cuenta[k] = cuenta[k].replace(/\s+/g, ' ').trim();
    });

    return (cuenta.NRO_CUENTA && cuenta.CBU) ? cuenta : null;
}

function extraerDatosCabecera(allFilas) {
    const datos = {
        // cliente
        cliente: '',
        cuit: '',
        domicilio: '',
        cantidadTitulares: '',
        sucursal: '',
        direccionSucursal: '',
        // resumen
        periodo: '',
        fechaSaldos: '',
        hojaNro: '',
        saldosConsolidados: [],
        // tabla de cuentas
        cuentas: []
    };

    const textoFila  = (f) => filaAItems(f).map(it => it.texto).join(' ');
    const textoIzq   = (f) => filaAItems(f).filter(it => it.x < 300).map(it => it.texto).join(' ').trim();
    const textoDer   = (f) => filaAItems(f).filter(it => it.x >= 300).map(it => it.texto).join(' ').trim();

    const ventana = allFilas.slice(0, 50);

    // --- Sucursal (bloque superior derecho) ---
    let idxSucursal = -1;
    for (let i = 0; i < ventana.length; i++) {
        const items = filaAItems(ventana[i]);
        const sucItem = items.find(it => /^Sucursal$/i.test(it.texto) && it.x > 300);
        if (sucItem) {
            idxSucursal = i;
            datos.sucursal = items
                .filter(it => it.x > 300 && !/^Sucursal$/i.test(it.texto))
                .map(it => it.texto).join(' ').trim();
            break;
        }
    }
    if (idxSucursal !== -1) {
        const partes = [];
        for (let i = idxSucursal + 1; i <= idxSucursal + 2 && i < ventana.length; i++) {
            const t = textoDer(ventana[i]);
            if (t && !/Sr\(es\)/i.test(t) && !/C\.U\.I\.T/i.test(t)) partes.push(t);
            // La 2ª fila puede incluir "Sr(es):" a la izq + ciudad a la der; tomamos solo la der
            if (i === idxSucursal + 2) {
                const itemsDer = filaAItems(ventana[i]).filter(it => it.x >= 300);
                const txt = itemsDer.map(it => it.texto).join(' ').trim();
                if (txt && !partes.includes(txt)) {
                    // ya agregado arriba si corresponde; evitamos duplicado
                }
            }
        }
        datos.direccionSucursal = partes.join(', ').replace(/\s+/g, ' ').trim();
    }

    // --- Bloque cliente (a partir de "Sr(es):") ---
    const idxSrEs = ventana.findIndex(f =>
        filaAItems(f).some(it => /^Sr\(es\):?$/i.test(it.texto))
    );
    if (idxSrEs !== -1 && ventana[idxSrEs + 1]) {
        datos.cliente = textoIzq(ventana[idxSrEs + 1]);
    }

    // --- CUIT ---
    for (const fila of ventana) {
        const t = textoFila(fila);
        const m = t.match(/C\.U\.I\.T[^0-9]*(\d{11})/i);
        if (m) { datos.cuit = m[1]; break; }
    }

    // --- Domicilio del cliente (filas a la izquierda, debajo de "cliente") ---
    if (idxSrEs !== -1) {
        const partes = [];
        for (let i = idxSrEs + 2; i < ventana.length && i < idxSrEs + 8; i++) {
            const tDer = textoDer(ventana[i]);
            const tIzq = textoIzq(ventana[i]);
            if (/Cantidad\s+Titulares/i.test(tDer)) {
                if (tIzq) partes.push(tIzq);
                break;
            }
            if (!tIzq) continue;
            if (/^Saldos?\b/i.test(tIzq)) break;
            if (/Resumen\s+General/i.test(tIzq)) break;
            partes.push(tIzq);
        }
        datos.domicilio = partes.join(' ').replace(/\s+/g, ' ').trim();
    }

    // --- Cantidad Titulares ---
    for (const fila of ventana) {
        const m = textoFila(fila).match(/Cantidad\s+Titulares[:\s]+(\d+)/i);
        if (m) { datos.cantidadTitulares = m[1]; break; }
    }

    // --- Periodo del Extracto ---
    for (const fila of allFilas) {
        const t = textoFila(fila);
        const m = t.match(/Periodo\s+del\s+Extracto[:\s]*(\d{2}\/\d{2}\/\d{4}(?:\s+al\s+\d{2}\/\d{2}\/\d{4})?)/i);
        if (m) { datos.periodo = m[1].trim(); break; }
    }

    // --- Fecha de los saldos consolidados ---
    for (const fila of allFilas) {
        const m = textoFila(fila).match(/Saldos?\s+consolidados[^0-9]*(\d{2}\/\d{2}\/\d{4})/i);
        if (m) { datos.fechaSaldos = m[1]; break; }
    }

    // --- Hoja Nro. ---
    for (const fila of allFilas) {
        const m = textoFila(fila).match(/Hoja\s+Nro\.?\s*:?\s*(\d+)/i);
        if (m) { datos.hojaNro = m[1]; break; }
    }

    // --- Saldos por moneda ---
    for (const fila of allFilas) {
        const t = textoFila(fila);
        const m = t.match(/Saldo\s+Cuentas\s+en\s+(.+?)\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/i);
        if (m) {
            datos.saldosConsolidados.push({
                moneda: m[1].trim(),
                valor: m[2]
            });
        }
    }

    // --- Tabla "Información de su/s Cuenta/s" ---
    const idxInfo = allFilas.findIndex(f => /Informaci[oó]n\s+de\s+su\/s\s+Cuenta\/s/i.test(textoFila(f)));
    if (idxInfo !== -1) {
        for (let i = idxInfo + 1; i < allFilas.length && i < idxInfo + 30; i++) {
            const items = filaAItems(allFilas[i]);
            if (!items.length) continue;
            const t = items.map(it => it.texto).join(' ');
            if (/_{3,}/.test(t)) break;
            if (/CUENTA\s+CORRIENTE[\s\S]*NRO\.\s*:/i.test(t)) break;
            if (/^TIPO\b/i.test(t)) continue; // encabezado
            const c = parseFilaInfoCuenta(items);
            if (c) datos.cuentas.push(c);
        }
    }

    return datos;
}

// Arma una fila "totales" uniendo TODO el texto a la izquierda de la columna
// SALDO (incluso items con x < DESCRIPCION.min como "TOTAL", "COBRADO", "D.",
// "409/2018") y tomando el monto que cae en la columna SALDO.
function armarFilaTotales(items) {
    const fila = {
        FECHA: '',
        DESCRIPCION: '',
        REFERENCIA: '',
        DEBITOS: '',
        CREDITOS: '',
        SALDO: ''
    };
    for (const it of items) {
        if (it.x < COLUMNAS.SALDO.min) {
            fila.DESCRIPCION += (fila.DESCRIPCION ? ' ' : '') + it.texto;
        } else if (esImporteMonetario(it.texto)) {
            fila.SALDO = parsearMontoNum(it.texto);
        }
    }
    fila.DESCRIPCION = fila.DESCRIPCION.replace(/\s+/g, ' ').trim();
    return fila;
}

// Absorbe la fila siguiente en una fila de totales cuando ésta quedó sin SALDO
// (caso típico: "(S.E.U.O.)  39.906,90" colgando debajo del IMPUESTO LEY 25413).
// Devuelve true si absorbió.
function intentarAbsorberContinuacion(filaTot, allFilas, idx) {
    if (filaTot.SALDO) return false;
    if (idx + 1 >= allFilas.length) return false;

    const siguienteItems = filaAItems(allFilas[idx + 1]);
    if (!siguienteItems.length) return false;

    const sigTexto = siguienteItems.map(it => it.texto).join(' ');

    // No absorber si la siguiente fila es en sí otra fila relevante
    const esApertura   = /CUENTA\s+CORRIENTE[\s\S]*?NRO\.\s*:/i.test(sigTexto);
    const esFin        = MARCADORES_FIN_CUENTA.some(m => sigTexto.includes(m));
    const esNuevoTotal = PATRONES_TOTALES.some(p => p.test(sigTexto));
    const esSaldo      = /^SALDO\s+(ULTIMO EXTRACTO AL|FINAL AL DIA)/i.test(sigTexto);
    const primerSig    = siguienteItems[0];
    const esMovimiento = primerSig && esFecha(primerSig.texto)
        && primerSig.x >= COLUMNAS.FECHA.min && primerSig.x <= COLUMNAS.FECHA.max;

    if (esApertura || esFin || esNuevoTotal || esSaldo || esMovimiento) return false;

    // Absorber: sumar texto a la DESCRIPCION y el monto al SALDO
    for (const it of siguienteItems) {
        if (it.x < COLUMNAS.SALDO.min) {
            filaTot.DESCRIPCION += (filaTot.DESCRIPCION ? ' ' : '') + it.texto;
        } else if (esImporteMonetario(it.texto)) {
            filaTot.SALDO = parsearMontoNum(it.texto);
        }
    }
    filaTot.DESCRIPCION = filaTot.DESCRIPCION.replace(/\s+/g, ' ').trim();
    return true;
}

function procesarFilas(allFilas) {
    console.log(`[banco_macro] Procesando ${allFilas.length} filas...`);

    const datosCabecera = extraerDatosCabecera(allFilas);
    const registrosPorCuenta = {};
    let cuentaActual = null;
    let modo = null; // 'DETALLE' | 'TOTALES' | null

    for (let i = 0; i < allFilas.length; i++) {
        const items = filaAItems(allFilas[i]);
        if (!items.length) continue;
        const textoCompleto = items.map(it => it.texto).join(' ');

        // Detectar apertura de cuenta: "CUENTA CORRIENTE ... NRO.: X-XXX-XXXXXXXXXX-X"
        const cuentaMatch = textoCompleto.match(/CUENTA\s+CORRIENTE[\s\S]*?NRO\.\s*:\s*([\d\-]+)/i);
        if (cuentaMatch) {
            cuentaActual = cuentaMatch[1].trim();
            const tipo = textoCompleto.substring(0, textoCompleto.indexOf('NRO.')).trim();
            if (!registrosPorCuenta[cuentaActual]) {
                registrosPorCuenta[cuentaActual] = { tipo, movimientos: [] };
            }
            modo = null;
            continue;
        }

        // Marcador de fin de cuenta
        if (cuentaActual && MARCADORES_FIN_CUENTA.some(m => textoCompleto.includes(m))) {
            cuentaActual = null;
            modo = null;
            continue;
        }

        if (!cuentaActual) continue;

        // Salir del modo DETALLE ante texto legal o encabezado de página.
        // Sin esto, el bloque de continuación de descripción pega basura al
        // último movimiento hasta encontrar la próxima cuenta.
        if (modo === 'DETALLE' && MARCADORES_SALIDA_DETALLE.some(m => textoCompleto.includes(m))) {
            modo = null;
            continue;
        }

        // Activar modo DETALLE cuando arranca la tabla de movimientos
        if (/DETALLE\s+DE\s+MOVIMIENTO/i.test(textoCompleto)) {
            modo = 'DETALLE';
            continue;
        }

        // Saltar la fila de encabezado de la tabla (FECHA DESCRIPCION ...)
        if (/\bFECHA\b/.test(textoCompleto) &&
            /\bDESCRIPCION\b/.test(textoCompleto) &&
            /\bDEBITOS\b/.test(textoCompleto) &&
            /\bCREDITOS\b/.test(textoCompleto) &&
            /\bSALDO\b/.test(textoCompleto)) {
            continue;
        }

        // Saldo inicial / final (no tiene fecha en columna FECHA)
        const mSaldo = textoCompleto.match(/SALDO\s+(ULTIMO EXTRACTO AL|FINAL AL DIA)\s+(\d{2}\/\d{2}\/\d{4})/i);
        if (mSaldo) {
            const etiqueta = mSaldo[0];
            const saldoItem = items.find(it =>
                it.x >= COLUMNAS.SALDO.min && esImporteMonetario(it.texto)
            );
            registrosPorCuenta[cuentaActual].movimientos.push({
                FECHA: mSaldo[2],
                DESCRIPCION: etiqueta,
                REFERENCIA: '',
                DEBITOS: '',
                CREDITOS: '',
                SALDO: saldoItem ? parsearMontoNum(saldoItem.texto) : ''
            });
            if (/FINAL AL DIA/i.test(mSaldo[1])) modo = 'TOTALES';
            continue;
        }

        // Filas de totales impositivos (debajo del SALDO FINAL):
        // TOTAL COBRADO, IMPUESTO LEY 25413, IIBB SIRCREB, D. NNNN/AAAA -, etc.
        const esFilaTotales = PATRONES_TOTALES.some(p => p.test(textoCompleto));
        if (esFilaTotales) {
            const filaTot = armarFilaTotales(items);
            if (intentarAbsorberContinuacion(filaTot, allFilas, i)) {
                i++;
            }
            if (filaTot.DESCRIPCION || filaTot.SALDO) {
                registrosPorCuenta[cuentaActual].movimientos.push(filaTot);
            }
            modo = 'TOTALES';
            continue;
        }

        // A partir de acá solo procesamos si estamos en DETALLE
        if (modo !== 'DETALLE') continue;

        // Movimiento: primer item debe ser fecha en columna FECHA
        const primer = items[0];
        if (esFecha(primer.texto) &&
            primer.x >= COLUMNAS.FECHA.min && primer.x <= COLUMNAS.FECHA.max) {
            const mov = {
                FECHA: primer.texto,
                DESCRIPCION: '',
                REFERENCIA: '',
                DEBITOS: '',
                CREDITOS: '',
                SALDO: ''
            };
            for (let k = 1; k < items.length; k++) {
                asignarPorColumna(mov, items[k]);
            }
            mov.REFERENCIA = parsearReferenciaNum(mov.REFERENCIA);
            registrosPorCuenta[cuentaActual].movimientos.push(mov);
            continue;
        }

        // Continuación de descripción: fila sin fecha, texto en columna DESCRIPCION
        const cuentaData = registrosPorCuenta[cuentaActual];
        if (cuentaData.movimientos.length > 0) {
            const ultimo = cuentaData.movimientos[cuentaData.movimientos.length - 1];
            if (ultimo.FECHA) {
                // REFERENCIA vuelve a string temporalmente para poder concatenar,
                // luego se re-parsea a número si corresponde.
                if (typeof ultimo.REFERENCIA === 'number') ultimo.REFERENCIA = String(ultimo.REFERENCIA);
                for (const it of items) {
                    if (it.x >= COLUMNAS.DESCRIPCION.min && it.x < COLUMNAS.REFERENCIA.min) {
                        ultimo.DESCRIPCION += (ultimo.DESCRIPCION ? ' ' : '') + it.texto;
                    } else if (it.x >= COLUMNAS.REFERENCIA.min) {
                        asignarPorColumna(ultimo, it);
                    }
                }
                ultimo.REFERENCIA = parsearReferenciaNum(ultimo.REFERENCIA);
            }
        }
    }

    return { datosCabecera, registrosPorCuenta };
}

function aplanarMovimientos(registrosPorCuenta) {
    const filas = [];
    for (const [numeroCuenta, datos] of Object.entries(registrosPorCuenta)) {
        for (const mov of datos.movimientos) {
            filas.push({
                CUENTA: numeroCuenta,
                TIPO_CUENTA: datos.tipo || '',
                ...mov
            });
        }
    }
    return filas;
}

async function generarExcel(procesado, rutaSalida) {
    const workbook = new ExcelJS.Workbook();
    const { datosCabecera, registrosPorCuenta } = procesado;

    const sheet = workbook.addWorksheet('Datos Generales');
    sheet.columns = [
        { key: 'a', width: 22 },
        { key: 'b', width: 32 },
        { key: 'c', width: 12 },
        { key: 'd', width: 18 },
        { key: 'e', width: 24 },
        { key: 'f', width: 28 }
    ];

    const escribirTitulo = (row, texto, mergeHasta = 'B') => {
        const celda = sheet.getCell(`A${row}`);
        celda.value = texto;
        celda.font = FONT_TITULO;
        celda.fill = FILL_TITULO;
        sheet.mergeCells(`A${row}:${mergeHasta}${row}`);
    };

    const escribirPropValor = (row, prop, val) => {
        const c1 = sheet.getCell(`A${row}`);
        c1.value = prop;
        estilizarEtiqueta(c1);
        sheet.getCell(`B${row}`).value = val;
    };

    let row = 1;

    // --- Sección: Datos del Cliente ---
    escribirTitulo(row++, 'DATOS DEL CLIENTE');
    const itemsCliente = [
        ['Cliente',            datosCabecera.cliente],
        ['C.U.I.T',            datosCabecera.cuit],
        ['Domicilio',          datosCabecera.domicilio],
        ['Cantidad Titulares', datosCabecera.cantidadTitulares],
        ['Sucursal',           datosCabecera.sucursal],
        ['Dirección Sucursal', datosCabecera.direccionSucursal]
    ];
    for (const [prop, val] of itemsCliente) {
        if (val) escribirPropValor(row++, prop, val);
    }

    row++; // espacio

    // --- Sección: Resumen General ---
    escribirTitulo(row++, 'RESUMEN GENERAL');
    const itemsResumen = [
        ['Período del Extracto',  datosCabecera.periodo],
        ['Saldos consolidados al', datosCabecera.fechaSaldos],
        ['Hoja Nro.',             datosCabecera.hojaNro]
    ];
    for (const [prop, val] of itemsResumen) {
        if (val) escribirPropValor(row++, prop, val);
    }
    for (const s of datosCabecera.saldosConsolidados) {
        escribirPropValor(row++, `Saldo Cuentas en ${s.moneda}`, s.valor);
    }

    row++; // espacio

    // --- Sección: Información de Cuentas (tabla) ---
    if (datosCabecera.cuentas.length > 0) {
        escribirTitulo(row++, 'INFORMACIÓN DE CUENTAS', 'F');

        const headers = ['TIPO', 'SUBTIPO', 'SUCURSAL', 'MONEDA', 'NRO. CUENTA', 'CBU'];
        headers.forEach((h, idx) => {
            const cell = sheet.getCell(row, idx + 1);
            cell.value = h;
            cell.font = FONT_ENCABEZADO;
            cell.fill = FILL_ENCABEZADO;
        });
        row++;

        for (const c of datosCabecera.cuentas) {
            sheet.getCell(row, 1).value = c.TIPO;
            sheet.getCell(row, 2).value = c.SUBTIPO;
            sheet.getCell(row, 3).value = c.SUCURSAL;
            sheet.getCell(row, 4).value = c.MONEDA;
            sheet.getCell(row, 5).value = c.NRO_CUENTA;
            sheet.getCell(row, 6).value = c.CBU;
            row++;
        }
    }

    let numeroHoja = 1;
    for (const [numeroCuenta, datos] of Object.entries(registrosPorCuenta)) {
        const nombreHoja = `Cuenta ${numeroHoja}`;
        const sheet = workbook.addWorksheet(nombreHoja);
        sheet.getCell('A1').value = `${datos.tipo} - NRO.: ${numeroCuenta}`;
        sheet.getCell('A1').font = FONT_TITULO;
        sheet.getCell('A1').fill = FILL_TITULO;
        sheet.mergeCells('A1:F1');

        const headerRow = sheet.getRow(2);
        headerRow.values = ['FECHA', 'DESCRIPCION', 'REFERENCIA', 'DEBITOS', 'CREDITOS', 'SALDO'];
        estilizarEncabezado(headerRow);

        sheet.columns = [
            { key: 'FECHA', width: 12 },
            { key: 'DESCRIPCION', width: 40 },
            { key: 'REFERENCIA', width: 15, style: { numFmt: '0' } },
            { key: 'DEBITOS',    width: 15, style: { numFmt: FMT_MONTO } },
            { key: 'CREDITOS',   width: 15, style: { numFmt: FMT_MONTO } },
            { key: 'SALDO',      width: 15, style: { numFmt: FMT_MONTO } }
        ];

        datos.movimientos.forEach(mov => sheet.addRow(mov));
        aplicarCebra(sheet, 3, sheet.rowCount, 6);
        sheet.views = [{ state: 'frozen', ySplit: 2 }];
        numeroHoja++;
    }

    await workbook.xlsx.writeFile(rutaSalida);
    console.log(`[banco_macro] Excel generado: ${rutaSalida}`);
    return rutaSalida;
}

async function procesarBancoMacro(allFilas, metadata = {}) {
    try {
        const procesado = procesarFilas(allFilas);
        const numCuentas = Object.keys(procesado.registrosPorCuenta).length;
        const datosPlanos = aplanarMovimientos(procesado.registrosPorCuenta);
        console.log(`[banco_macro] Se identificaron ${numCuentas} cuentas con ${datosPlanos.length} movimientos totales`);

        const baseName = metadata.rutaCompleta
            ? path.basename(metadata.rutaCompleta, path.extname(metadata.rutaCompleta))
            : null;

        let rutaSalida = null;
        if (baseName) {
            const nombreArchivo = `${baseName}.xlsx`;
            const dirSalida = path.dirname(metadata.rutaCompleta);
            rutaSalida = path.join(dirSalida, nombreArchivo);
            await generarExcel(procesado, rutaSalida);
        }

        return {
            datos: datosPlanos,
            registrosPorCuenta: procesado.registrosPorCuenta,
            datosCabecera: procesado.datosCabecera,
            excelPath: rutaSalida,
            suggestedFileName: baseName ? `${baseName}.xlsx` : undefined
        };
    } catch (err) {
        console.error(`Error al procesar PDF de Banco Macro: ${err.message}`);
        console.error(err.stack);
        return null;
    }
}

// --- BLOQUE DE PRUEBA INDEPENDIENTE ---

if (require.main === module) {
    (async () => {
        console.log('Ejecutando [banco_macro.js] en modo de prueba independiente...');

        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

        const rutaDePrueba = path.join(__dirname, '../../../test/pdf_muestra/octubre.pdf');

        console.log(`Procesando archivo: ${rutaDePrueba}`);

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await require('fs').promises.readFile(rutaDePrueba)), verbosity: 0 });
        const pdf = await loadingTask.promise;
        let allFilas = [];

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const content = await page.getTextContent();
            const filasMap = new Map();

            content.items.forEach(item => {
                const y = item.transform[5];
                const yExistente = [...filasMap.keys()].find(key => Math.abs(y - key) <= 5);
                if (yExistente !== undefined) {
                    filasMap.get(yExistente).push(item);
                } else {
                    filasMap.set(y, [item]);
                }
            });

            const filasDePagina = [...filasMap.entries()]
                .sort((a, b) => b[0] - a[0])
                .map(([y, items]) => ({ y, items: items.sort((a, b) => a.transform[4] - b.transform[4]) }));

            allFilas.push(...filasDePagina);
        }

        const resultado = await procesarBancoMacro(allFilas, { rutaCompleta: rutaDePrueba });

        if (resultado) {
            console.log(`✓ Procesamiento completado`);
            console.log(`  Movimientos: ${resultado.datos.length}`);
            console.log(`  Excel: ${resultado.excelPath}`);
        } else {
            console.log('✗ Error al procesar');
        }
    })();
}

module.exports = {
    procesarBancoMacro,
    procesarFilas
};
