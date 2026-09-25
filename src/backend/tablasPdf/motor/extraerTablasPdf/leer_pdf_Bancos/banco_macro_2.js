const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

// --- AUXILIARES ---

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

// Columnas ajustadas al formato A3 (según x reales observados):
// FECHA header x=44.55 / values ~40.50
// DESCRIPCION header x=141.77 / items 76-200
// REFERENCIA header x=263.29
// DEBITOS header x=336.20 / values ~340
// CREDITOS header x=413.16 / values ~417
// SALDO header x=506.33 / values 490-506
const COLUMNAS = {
    FECHA:       { min: 15,  max: 65  },
    DESCRIPCION: { min: 65,  max: 250 },
    REFERENCIA:  { min: 250, max: 325 },
    DEBITOS:     { min: 325, max: 400 },
    CREDITOS:    { min: 400, max: 475 },
    SALDO:       { min: 475, max: 650 }
};

const MARCADORES_FIN_CUENTA = [
    'Saldos consolidados por moneda',
    'Saldo Cuentas en PESOS',
    'Saldo Cuentas en DOLARES',
    'Los depósitos en pesos',
    'Los depositos en pesos',
    'ESTIMADO CLIENTE',
    'LINEAS DE CREDITO',
    'TOTAL COBRADO'
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
        if (esImporteMonetario(texto)) movimiento.DEBITOS = limpiarImporte(texto);
    } else if (x >= COLUMNAS.CREDITOS.min && x < COLUMNAS.SALDO.min) {
        if (esImporteMonetario(texto)) movimiento.CREDITOS = limpiarImporte(texto);
    } else if (x >= COLUMNAS.SALDO.min) {
        if (esImporteMonetario(texto)) movimiento.SALDO = limpiarImporte(texto);
    }
}

function extraerMetadatos(allFilas) {
    const metadatos = { cliente: '', cuit: '', periodo: '', sucursal: '' };
    for (const fila of allFilas) {
        const texto = filaAItems(fila).map(it => it.texto).join(' ');
        if (!metadatos.cuit) {
            const m = texto.match(/C\.U\.I\.T[^0-9]*(\d{11})/);
            if (m) metadatos.cuit = m[1];
        }
        if (!metadatos.periodo) {
            const m = texto.match(/Periodo del Extracto[^0-9]*(\d{2}\/\d{2}\/\d{4})/i);
            if (m) metadatos.periodo = m[1];
        }
        if (metadatos.cuit && metadatos.periodo) break;
    }
    return metadatos;
}

function esFilaEncabezado(textoCompleto) {
    // Encabezado de columnas del extracto (se repite por página en A3)
    return /\bFECHA\b/.test(textoCompleto) &&
           /\bDESCRIPCION\b/.test(textoCompleto) &&
           /\bDEBITOS\b/.test(textoCompleto) &&
           /\bCREDITOS\b/.test(textoCompleto) &&
           /\bSALDO\b/.test(textoCompleto);
}

function esFilaResumenHeader(textoCompleto) {
    // Resumen al pie de página: SALDO INICIAL · CREDITOS · DEBITOS · I.V.A. · SALDO FINAL
    return /SALDO\s+INICIAL/i.test(textoCompleto) && /SALDO\s+FINAL/i.test(textoCompleto);
}

function esFilaIgnorable(textoCompleto) {
    // Líneas de infraestructura/encabezado de página que no forman parte de la tabla
    return /Clave\s+Bancaria\s+Uniforme/i.test(textoCompleto);
}

function esFilaIIBB(textoCompleto) {
    return /IIBB\s+SIRCREB/i.test(textoCompleto);
}

function extraerFilaIIBB(items) {
    const textosDescripcion = [];
    const fechas = [];
    let importe = '';
    for (const it of items) {
        if (esFecha(it.texto)) {
            fechas.push(it.texto);
        } else if (esImporteMonetario(it.texto)) {
            importe = limpiarImporte(it.texto);
        } else if (it.texto.toLowerCase() !== 'al') {
            textosDescripcion.push(it.texto);
        }
    }
    return {
        DESCRIPCION: textosDescripcion.join(' '),
        DESDE: fechas[0] || '',
        HASTA: fechas[1] || '',
        IMPORTE: importe
    };
}

function procesarFilas(allFilas) {
    console.log(`[banco_macro_2] Procesando ${allFilas.length} filas...`);

    const metadatos = extraerMetadatos(allFilas);
    const registrosPorCuenta = {};
    const retencionesIIBB = [];
    let cuentaActual = null;
    let saltarValoresResumen = false;

    for (let i = 0; i < allFilas.length; i++) {
        const items = filaAItems(allFilas[i]);
        if (!items.length) continue;
        const textoCompleto = items.map(it => it.texto).join(' ');

        // Mini-tabla resumen al pie de página: saltar cabecera y su fila de valores
        if (esFilaResumenHeader(textoCompleto)) {
            saltarValoresResumen = true;
            continue;
        }
        if (saltarValoresResumen) {
            saltarValoresResumen = false;
            continue;
        }

        // Líneas de infraestructura (CBU + tasas, etc.)
        if (esFilaIgnorable(textoCompleto)) continue;

        // Retenciones IIBB SIRCREB (van a una hoja aparte del Excel)
        if (esFilaIIBB(textoCompleto)) {
            retencionesIIBB.push(extraerFilaIIBB(items));
            continue;
        }

        // Detectar apertura/continuación de cuenta
        const cuentaMatch = textoCompleto.match(/CUENTA\s+CORRIENTE[\s\S]*?NRO\.\s*:\s*([\d\-]+)/i);
        if (cuentaMatch) {
            cuentaActual = cuentaMatch[1].trim();
            const tipo = textoCompleto.substring(0, textoCompleto.indexOf('NRO.')).trim();
            if (!registrosPorCuenta[cuentaActual]) {
                registrosPorCuenta[cuentaActual] = { tipo, movimientos: [] };
            }
            continue;
        }

        // Marcador de fin de cuenta
        if (cuentaActual && MARCADORES_FIN_CUENTA.some(m => textoCompleto.includes(m))) {
            cuentaActual = null;
            continue;
        }

        if (!cuentaActual) continue;

        // Encabezado de tabla (se repite por página)
        if (esFilaEncabezado(textoCompleto)) continue;

        // Saldo inicial / final (contiene fecha pero no en columna FECHA)
        const mSaldo = textoCompleto.match(/SALDO\s+(ULTIMO EXTRACTO AL|FINAL AL DIA)\s+(\d{2}\/\d{2}\/\d{4})/i);
        if (mSaldo) {
            const saldoItem = items.find(it =>
                it.x >= COLUMNAS.SALDO.min && esImporteMonetario(it.texto)
            );
            registrosPorCuenta[cuentaActual].movimientos.push({
                FECHA: mSaldo[2],
                DESCRIPCION: `SALDO ${mSaldo[1]} ${mSaldo[2]}`,
                REFERENCIA: '',
                DEBITOS: '',
                CREDITOS: '',
                SALDO: saldoItem ? limpiarImporte(saldoItem.texto) : ''
            });
            continue;
        }

        // Movimiento: primer item es fecha en columna FECHA
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
            registrosPorCuenta[cuentaActual].movimientos.push(mov);
            continue;
        }

        // Continuación de descripción: solo si la fila NO contiene importes en columnas monetarias
        // (así las mini-tablas resumen, totales y demás no contaminan DEBITOS/CREDITOS/SALDO)
        const cuentaData = registrosPorCuenta[cuentaActual];
        if (cuentaData.movimientos.length > 0) {
            const ultimo = cuentaData.movimientos[cuentaData.movimientos.length - 1];
            if (ultimo.FECHA) {
                const tieneImporteEnMonetarias = items.some(it =>
                    it.x >= COLUMNAS.DEBITOS.min && esImporteMonetario(it.texto)
                );
                if (!tieneImporteEnMonetarias) {
                    for (const it of items) {
                        if (it.x >= COLUMNAS.DESCRIPCION.min && it.x < COLUMNAS.REFERENCIA.min) {
                            ultimo.DESCRIPCION += (ultimo.DESCRIPCION ? ' ' : '') + it.texto;
                        }
                    }
                }
            }
        }
    }

    return { metadatos, registrosPorCuenta, retencionesIIBB };
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
    const { metadatos, registrosPorCuenta, retencionesIIBB = [] } = procesado;

    const sheetMetadatos = workbook.addWorksheet('Datos Generales');
    sheetMetadatos.columns = [
        { header: 'Propiedad', key: 'propiedad', width: 20 },
        { header: 'Valor', key: 'valor', width: 40 }
    ];
    sheetMetadatos.addRows([
        { propiedad: 'Cliente', valor: metadatos.cliente },
        { propiedad: 'CUIT', valor: metadatos.cuit },
        { propiedad: 'Período', valor: metadatos.periodo },
        { propiedad: 'Sucursal', valor: metadatos.sucursal }
    ]);

    let numeroHoja = 1;
    for (const [numeroCuenta, datos] of Object.entries(registrosPorCuenta)) {
        const sheet = workbook.addWorksheet(`Cuenta ${numeroHoja}`);
        sheet.getCell('A1').value = `${datos.tipo} - NRO.: ${numeroCuenta}`;
        sheet.getCell('A1').font = { bold: true };
        sheet.mergeCells('A1:F1');

        const headerRow = sheet.getRow(2);
        headerRow.values = ['FECHA', 'DESCRIPCION', 'REFERENCIA', 'DEBITOS', 'CREDITOS', 'SALDO'];
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

        sheet.columns = [
            { key: 'FECHA', width: 12 },
            { key: 'DESCRIPCION', width: 45 },
            { key: 'REFERENCIA', width: 15 },
            { key: 'DEBITOS', width: 18 },
            { key: 'CREDITOS', width: 18 },
            { key: 'SALDO', width: 18 }
        ];

        datos.movimientos.forEach(mov => sheet.addRow(mov));
        numeroHoja++;
    }

    if (retencionesIIBB.length > 0) {
        const sheet = workbook.addWorksheet('Retenciones IIBB');
        sheet.columns = [
            { header: 'DESCRIPCION', key: 'DESCRIPCION', width: 65 },
            { header: 'DESDE', key: 'DESDE', width: 12 },
            { header: 'HASTA', key: 'HASTA', width: 12 },
            { header: 'IMPORTE', key: 'IMPORTE', width: 18 }
        ];
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
        retencionesIIBB.forEach(r => sheet.addRow(r));
    }

    await workbook.xlsx.writeFile(rutaSalida);
    console.log(`[banco_macro_2] Excel generado: ${rutaSalida}`);
    return rutaSalida;
}

async function procesarBancoMacro2(allFilas, metadata = {}) {
    try {
        const procesado = procesarFilas(allFilas);
        const numCuentas = Object.keys(procesado.registrosPorCuenta).length;
        const datosPlanos = aplanarMovimientos(procesado.registrosPorCuenta);
        const numIIBB = (procesado.retencionesIIBB || []).length;
        console.log(`[banco_macro_2] ${numCuentas} cuentas, ${datosPlanos.length} movimientos, ${numIIBB} retenciones IIBB`);

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
            retencionesIIBB: procesado.retencionesIIBB,
            metadatos: procesado.metadatos,
            excelPath: rutaSalida,
            suggestedFileName: baseName ? `${baseName}.xlsx` : undefined
        };
    } catch (err) {
        console.error(`Error al procesar PDF Banco Macro 2 (A3): ${err.message}`);
        console.error(err.stack);
        return null;
    }
}

// --- PRUEBA INDEPENDIENTE ---

if (require.main === module) {
    (async () => {
        console.log('Ejecutando [banco_macro_2.js] en modo de prueba independiente...');

        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

        const rutaDePrueba = path.join(
            __dirname,
            '../../../test/pdf_muestra/_GRUPO DALED SA .docx_S_ACTIVITY_ATT_1-2M4FARLV_1-MUDUTF.pdf'
        );

        console.log(`Procesando: ${rutaDePrueba}`);

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

        const resultado = await procesarBancoMacro2(allFilas, { rutaCompleta: rutaDePrueba });

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
    procesarBancoMacro2,
    procesarFilas
};
