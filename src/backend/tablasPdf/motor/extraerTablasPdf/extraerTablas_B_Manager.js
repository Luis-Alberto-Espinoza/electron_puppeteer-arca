const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/build/pdf.js');

// --- Configuración de PDF.js (Centralizada aquí) ---
// La ruta base ahora se construye dinámicamente en la función principal,
// pero dejamos una configuración por defecto para el worker.
// Esta línea será sobreescrita por la lógica dentro de procesarPdfConFallback.
// require.resolve lo ubica tanto en dev como empaquetado; NO usar process.cwd()
// porque en el portable de Windows apunta a donde se lanzó el .exe, no a la app.
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');

// --- Importar los módulos especialistas ---
const { PDFTableExtractor } = require('./leer_pdf_Bancos/lectorBasePdf.js');
const { procesarBancoNacion } = require('./leer_pdf_Bancos/banco_nacion.js');
const { procesarPlanDePago } = require('./leer_pdf_ATM/planDePago_extraeTabla.js');
const { procesarConstanciaFiscal } = require('./leer_pdf_ATM/constancia_fiscal.js');
const { procesarDeudaPdf } = require('./leer_pdf_AFIP/detalle_de_deuda.js');
const { procesarDeudaImpagaPdf } = require('./leer_pdf_AFIP/Detalle_de_Deuda_Impaga.js');
const { procesarObligacionesPdf } = require('./leer_pdf_AFIP/detalle_de_obligaciones.js');
const { procesarPlanDePagoPdf } = require('./leer_pdf_AFIP/detalle_pagos_estado_1.js');  
const { procesarPlanDePagoPdf2 } = require('./leer_pdf_AFIP/detalle_pagos_estado_2.js');
const { procesarImputacionesDeCuota } = require('./leer_pdf_AFIP/detalle_de_imputaciones_de_cuota.js');
const { procesarObligacionesPdf2 } = require('./leer_pdf_AFIP/detalle_de_obligaciones_2.js');
const { procesarCarrilRodriguezPena } = require('./leer_pdf_Bancos/carril_rodriguez_pena.js');
const { procesarCredicop2 } = require('./leer_pdf_Bancos/credicop_2.js');
const { procesarCredicop3 } = require('./leer_pdf_Bancos/credicop_3.js');
const { procesarCondonacionDeDeuda } = require('./leer_pdf_AFIP/condonacion_de_deuda.js');
const { procesarDdjj931 } = require('./leer_pdf_AFIP/ddjj_931.js');
const { procesarIvaF2002 } = require('./leer_pdf_AFIP/iva_f2002.js');
const { procesarIvaF2051 } = require('./leer_pdf_AFIP/iva_f2051.js');
const { procesarBbvaCuentaEmpresaPersonaJuridica } = require('./leer_pdf_Bancos/bbva_cuenta_empresa_persona_juridica.js');
const { procesarSantander } = require('./leer_pdf_Bancos/santander.js');
const { procesarBancoMacro } = require('./leer_pdf_Bancos/banco_macro.js');
const { procesarBancoMacro2 } = require('./leer_pdf_Bancos/banco_macro_2.js');
const { procesarBancoGalicia } = require('./leer_pdf_Bancos/banco_galicia.js');
const { procesarBancoSupervielle } = require('./leer_pdf_Bancos/banco_supervielle.js');

const NOMBRE_ESPECIALISTAS = {
    'procesarDeudaPdf': 'Detalle_de_Deuda_Impaga',
    'procesarImputacionesDeCuota': 'Detalle_de_Imputaciones_de_cuota',
    'procesarObligacionesPdf': 'Detalle_Obligaciones_Regularizadas',
    'procesarObligacionesPdf2': 'Detalle_Obligaciones_Regularizadas_Impositivas',
    'procesarCondonacionDeDeuda': 'Condonacion_De_Deuda',
    'procesarDdjj931': 'DDJJ_931',
    'procesarIvaF2002': 'DDJJ_IVA_F2002',
    'procesarIvaF2051': 'DDJJ_IVA_F2051',
    'procesarDeudaImpagaPdf': 'detalle_deuda',
    'procesarPlanDePagoPdf2': 'Detalle_plan_pago_estado',
    'procesarPlanDePagoPdf': 'detalle_pagos_estado',
    'procesarBbvaCuentaEmpresaPersonaJuridica': 'BBVA_Cuenta_Empresa',
    'procesarSantander': 'Santander_Resumen_Cuenta',
    'procesarBancoMacro': 'BancoMacro_Resumen_Cuenta',
    'procesarBancoMacro2': 'BancoMacro2_Resumen_Cuenta',
    'procesarBancoGalicia': 'BancoGalicia_Resumen_Cuenta',
    'procesarBancoSupervielle': 'Supervielle_Resumen_Cuenta'
};

// --- REGLAS DE SELECCIÓN DEL ROUTER ---
const REGLAS_DE_SELECCION = {
    ddjj931: {// DDJJ F.931 - Seguridad Social (AFIP/ARCA)
        procesador: procesarDdjj931,
        palabrasClave: [
            'Declaración en línea Formulario F.931',
            'REGIMEN NACIONAL DE SEGURIDAD SOCIAL',
            'REGIMEN NACIONAL DE OBRAS SOCIALES',
            'MONTOS QUE SE INGRESAN'
        ],
        umbral: 3
    },
    ivaF2002: {// DDJJ IVA - Formulario F.2002 ("Mis Aplicaciones Web", modelo viejo)
        procesador: procesarIvaF2002,
        palabrasClave: [
            'Determinación de la base imponible del período',
            'Determinación de la Declaración Jurada mensual',
            'F. 2002',
            'Mis Aplicaciones Web'
        ],
        umbral: 3
    },
    ivaF2051: {// DDJJ IVA - Formulario F.2051 ("IVA Simple", ARCA, modelo nuevo)
        procesador: procesarIvaF2051,
        palabrasClave: [
            'Determinación del impuesto',
            'Determinación de la posición mensual',
            'F.2051'
        ],
        umbral: 3
    },
    condonacionDeuda: {
        procesador: procesarCondonacionDeDeuda,
        palabrasClave: ["Condonación de deudas - Título I - Ley 27.653", "Transacción N°", "Fecha de tramitación de solicitud", "Detalle de deuda"],
        umbral: 4
    },
    planDePago: {//plan de pago de atm
        procesador: procesarPlanDePago,
        palabrasClave: ['NÚMERO:', 'CANTIDAD CUOTAS:', 'VIGENTE', 'IMPORTE CUOTA:', 'ESTADO:', 'IMPUESTO:', 'TIPO:', 'MONTO A FINANCIAR:'],
        umbral: 5
    },
    bancoNacion: {// banco nacion 
        procesador: procesarBancoNacion,
        palabrasClave: ['Fecha:', 'Últimos movimientos', 'Fecha', 'Comprobante'],
        umbral: 4
    },
    carrilRodriguezPena: {
        procesador: procesarCarrilRodriguezPena,
        palabrasClave: ['CARRIL RODRIGUEZ', 'CUENTA CORRIENTE BANCARIA', 'Periodo del Extracto', '396 GODOY CRUZ'],
        umbral: 3
    },
    constanciaFiscal: {// constancia fiscal 
        procesador: procesarConstanciaFiscal,
        palabrasClave: ['ADMINISTRACIÓN TRIBUTARIA MENDOZA', 'INFORMACIÓN GENERAL - SITUACIÓN FISCAL', 'CUIT:', 'Razón Social:'],
        umbral: 3
    },
    detalleObligacionesImpositivas: {
        procesador: procesarObligacionesPdf2,
        palabrasClave: ['Detalle de Obligaciones Regularizadas - Obligaciones Impositivas', 'Año', 'subconcepto'],
        umbral: 2
    },
    detalleDeuda: {// numero 4
        procesador: procesarDeudaPdf,
        palabrasClave: ['Detalle de Deuda Impaga', 'Periodo', 'Subconcepto', 'Concepto', 'Importe'],
        umbral: 4
    },
    deudaImpaga: {// numero 3
        procesador: procesarDeudaImpagaPdf,
        palabrasClave: ['Detalle', 'Ant./Cta', 'Establ.', 'Subcpto.', 'Cancelar($)'],
        umbral: 4
    },
    detalleObligaciones: {// numero 2
        procesador: procesarObligacionesPdf,
        palabrasClave: ['Detalle de Obligaciones Regularizadas', 'subconcepto', 'fh. Vto.', 'monto obligación($)', 'total pagos($)'],
        umbral: 4
    },
    planDePago2: {// numero 5
        procesador: procesarPlanDePagoPdf2,
        palabrasClave: ['Cuota', 'Vencimiento', 'Capital($)', 'Financiero($)', 'Total($)'],
        umbral: 5
    },
    planDePago1: {// numero 6
        procesador: procesarPlanDePagoPdf,
        palabrasClave: ['Cuota N°', 'Vencimiento', 'Capital($)', 'Interés Financiero($)', 'Total($)', 'Estado de Cuota'], 
        umbral: 4
    },
    detalleImputaciones: { // numero 0
        procesador: procesarImputacionesDeCuota,
        palabrasClave: ['Detalle de Imputaciones de cuota', 'Cancela($)'],
        umbral: 2
    },
    credicop2: {
        procesador: procesarCredicop2,
        palabrasClave: ['EURO', 'Sucursal 115 −', 'Cuenta', 'Corriente − Modulo 1', 'CUIT 30−57142135−2'],
        umbral: 3
    },
    credicop3: {
        procesador: procesarCredicop3,
        palabrasClave: ['Sucursal 315 − Lavalle', 'Cuenta','Corriente Comercial',  'CUIT 30−57142135−2'],
        umbral: 3
    },
    bbvaCuentaEmpresa: {
        procesador: procesarBbvaCuentaEmpresaPersonaJuridica,
        palabrasClave: ['Cuenta Empresas Persona Juridica','Tarjetas de D','DETALLE', 'Movimientos en cuentas', 'Cta.Cte.Bancaria', 'BBVA'],
        umbral: 3
    },
    santander: {
        procesador: procesarSantander,
        palabrasClave: ['Resumen de cuenta', 'Saldo en cuenta', 'Emisión mensual', 'Banco Santander Argentina S.A.'],
        umbral: 3
    },
    bancoGalicia: {
        procesador: procesarBancoGalicia,
        palabrasClave: [
            'EXTRACTO DEL',
            'DETALLE DE OPERACIONES',
            'PRODUCTO SUC CUENTA CBU',
            'FECHA REFERENCIA NRO DEBITO CREDITO SALDO'
        ],
        umbral: 3
    },
    bancoMacro2: {
        procesador: procesarBancoMacro2,
        palabrasClave: [
            'CUENTA CORRIENTE BANCARIA',
            'Clave Bancaria Uniforme para Debito Directo',
            'Tasa Nom. Anual',
            'Tasa Efec. Anual',
            'Periodo del Extracto'
        ],
        exclusiones: ['DETALLE DE MOVIMIENTO'],
        umbral: 3
    },
    bancoMacro: {
        procesador: procesarBancoMacro,
        palabrasClave: ['Sr(es):', 'Sucursal', 'Resumen General', 'Información de su/s Cuenta/s'],
        umbral: 3
    },
    // Se evalúa ÚLTIMA a propósito: este resumen no matcheaba ninguna regla previa
    // (caía en genérico), así que agregarla al final no cambia el enrutamiento
    // de ningún PDF que hoy ya funciona.
    bancoSupervielle: {
        procesador: procesarBancoSupervielle,
        palabrasClave: [
            'INFORMACION SOBRE EL SALDO DE SUS CUENTAS',
            'Servicio Moneda Saldo Inicial Débitos Créditos Saldo Final',
            'RESUMEN DE CUENTA DESDE',
            'Cantidad Total de Titulares',
            'Saldo del período anterior',
            'Detalle de Movimientos'
        ],
        umbral: 4
    }
};

async function parsePdfToRows(filePath) {
    try {
        // Pasar los bytes, no la ruta: con la ruta pdfjs intenta leerla como URL
        // y en el portable de Windows la extracción sale vacía.
        const data = new Uint8Array(await fs.promises.readFile(filePath));
        const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
        const pdf = await loadingTask.promise;
        let allFilas = [];
        for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
            const page = await pdf.getPage(numPagina);
            const content = await page.getTextContent();
            const filasMap = new Map();
            content.items.forEach(item => {
                const y = item.transform[5];
                const yExistente = [...filasMap.keys()].find(key => Math.abs(y - key) <= 5);
                if (yExistente) {
                    filasMap.get(yExistente).push(item);
                } else {
                    filasMap.set(y, [item]);
                }
            });
            const filasDePagina = [...filasMap.entries()]
                .sort((a, b) => b[0] - a[0])
                .map(([y, filaItems]) => ({ y, items: filaItems.sort((a, b) => a.transform[4] - b.transform[4]) }));
            allFilas.push(...filasDePagina);
        }
        return allFilas;
    } catch (error) {
        console.error(`Error al parsear el PDF: ${error.message}`);
        return null;
    }
}

function seleccionarProcesador(allFilas) {
    const filasDeAnalisis = allFilas.slice(0, 50);
    const textosPresentes = filasDeAnalisis.flatMap(fila => fila.items.map(item => item.str.trim()));
    const textosPorFila = filasDeAnalisis.map(fila =>
        fila.items.map(it => (it.str || '').trim()).filter(Boolean).join(' ')
    );
    const contiene = (palabra) =>
        textosPresentes.some(t => t.includes(palabra)) ||
        textosPorFila.some(t => t.includes(palabra));

    for (const reglaNombre in REGLAS_DE_SELECCION) {
        const regla = REGLAS_DE_SELECCION[reglaNombre];
        if (regla.exclusiones && regla.exclusiones.some(contiene)) {
            continue;
        }
        let coincidencias = 0;
        for (const palabraClave of regla.palabrasClave) {
            if (contiene(palabraClave)) coincidencias++;
        }
        if (coincidencias >= regla.umbral) {
            console.log(`Regla cumplida: [${reglaNombre}]. Usando su procesador especialista.`);
            return regla.procesador;
        }
    }
    console.log('Ninguna regla => de especialista cumplida. Intentando con método genérico.');
    return 'generico';
}

function extraerCuit(allFilas) {
    for (const fila of allFilas.slice(0, 25)) { // Buscar en las primeras 25 líneas
        for (let i = 0; i < fila.items.length; i++) {
            const item = fila.items[i];
            if (item.str.trim().toUpperCase() === 'CUIT:') {
                // Buscar el valor en los siguientes items de la misma línea
                for (let j = i + 1; j < fila.items.length; j++) {
                    const cuitValue = fila.items[j].str.trim();
                    // Un CUIT válido tiene al menos 11 dígitos
                    if (cuitValue && cuitValue.replace(/-/g, '').length >= 11) {
                        return cuitValue;
                    }
                }
            }
        }
    }
    return null; // Si no se encuentra
}

async function procesarPdfConFallback(filePath, options = {}) {
    // Worker y fuentes de PDF.js con require.resolve, que funciona tanto en dev
    // como empaquetado. NO usar process.cwd() ni options.projectRoot para esto:
    // en el portable de Windows cwd apunta a donde se lanzó el .exe, no a la app.
    const workerPath = require.resolve('pdfjs-dist/build/pdf.worker.js');
    // Verificar existencia del worker y asignarlo a pdfjs
    if (!fs.existsSync(workerPath)) {
      throw new Error(`El archivo worker de PDF.js no se encuentra en la ruta esperada: ${workerPath}`);
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
    const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
    pdfjsLib.GlobalWorkerOptions.standardFontDataUrl = path.join(pdfjsRoot, 'standard_fonts/');

    console.log(`Iniciando procesamiento orquestado para: ${filePath}`);

    const allFilas = await parsePdfToRows(filePath);
    if (!allFilas) {
        return { exito: false, error: 'No se pudo leer y parsear el archivo PDF.' };
    }

    const cuitGeneral = extraerCuit(allFilas);
    const procesadorSeleccionado = seleccionarProcesador(allFilas);

    let resultado;
    let metodoUsado;

    if (typeof procesadorSeleccionado === 'function') {
        metodoUsado = procesadorSeleccionado.name;
        try {
            // Pasar metadata adicional (nombre del archivo) a los procesadores
            const metadata = {
                nombreArchivo: path.basename(filePath),
                rutaCompleta: filePath
            };
            resultado = await procesadorSeleccionado(allFilas, metadata);
        } catch (error) {
            console.error(`El especialista [${metodoUsado}] falló: ${error.message}`);
            resultado = null;
        }
    } else {
        metodoUsado = 'generico';
        try {
            const extractorGenerico = new PDFTableExtractor();
            const registros = await extractorGenerico.extractFromPDF(filePath);
            if (registros && registros.length > 0) {
                const cabeceras = Object.keys(registros[0]);
                const filasCsv = [cabeceras.join(',')];
                registros.forEach(registro => {
                    const fila = cabeceras.map(cabecera => `"${String(registro[cabecera] || '').split('"').join('""')}"`);
                    filasCsv.push(fila.join(','));
                });
                resultado = { datos: registros, csv: filasCsv.join('\n') };
            } else {
                resultado = null;
            }
        } catch (error) {
            console.error(`El extractor genérico falló: ${error.message}`);
            resultado = null;
        }
    }

    const tieneDatos = resultado && (
        (resultado.tabla && resultado.tabla.length > 0) ||
        (resultado.datos && resultado.datos.length > 0) ||
        (resultado.tablas && resultado.tablas.length > 0)
    );

    if (tieneDatos) {
        console.log(`Éxito con el método: [${metodoUsado}]`);
        
        const cuitFinal = (resultado.encabezado && resultado.encabezado.cuit) || cuitGeneral;
        const cuitSuffix = cuitFinal ? `_${cuitFinal.replace(/-/g, '')}` : '';

        let suggestedFileName;
        // Si el procesador ya devolvió un suggestedFileName, usarlo
        if (resultado.suggestedFileName) {
            suggestedFileName = resultado.suggestedFileName;
        } else if (NOMBRE_ESPECIALISTAS[metodoUsado]) {
            const baseName = NOMBRE_ESPECIALISTAS[metodoUsado];
            suggestedFileName = `${baseName}${cuitSuffix}.csv`;
        } else {
            const pdfBaseName = path.basename(filePath, path.extname(filePath));
            suggestedFileName = `${pdfBaseName}${cuitSuffix}.csv`;
        }

        // Devolvemos el objeto de resultado completo para que el siguiente paso en la cadena
        // (el convertidor a Excel) pueda procesarlo.
        return {
            exito: true,
            metodo: metodoUsado,
            suggestedFileName: suggestedFileName,
            datos: resultado.tabla || resultado.datos,
            tablas: resultado.tablas,
            hojaUnica: resultado.hojaUnica || false,
            cuit: cuitFinal,
            allFilas: allFilas,
            excelPath: resultado.excelPath || null
        };
    } else {
        console.error(`Todos los métodos de extracción fallaron para: ${path.basename(filePath)}`);
        return { exito: false, error: 'No se pudieron extraer datos con ninguno de los métodos disponibles.', cuit: cuitGeneral };
    }
}

if (require.main === module) {
    (async () => {
        const filePathArg = process.argv[2];
        if (!filePathArg) {
            console.error("Error: Debes proporcionar la ruta a un archivo PDF como argumento.");
            console.log("Uso: node src/backend/extraerTablasPdf/extraerTablas_B_Manager.js <ruta_al_pdf>");
            return;
        }

        const filePath = path.resolve(filePathArg);
        console.log("\n--- MODO PRUEBA ---");
        
        const resultado = await procesarPdfConFallback(filePath, { outputDir: __dirname });

        if (resultado && resultado.exito) {
            console.log(`\n🎉 PRUEBA COMPLETADA CON ÉXITO.`);
            console.log(`Archivo de salida: ${resultado.rutaCsv}`);
        } else {
            console.error('\n❌ La prueba falló.');
            if(resultado.error) console.error(`Motivo: ${resultado.error}`);
        }
    })();
}

module.exports = procesarPdfConFallback;
