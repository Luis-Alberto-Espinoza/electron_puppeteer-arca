// _pdfComun.js
// Helpers compartidos entre paso_12 (descarga normal del VEP) y
// paso_12b (descarga del VEP completo para XN Group vía "Ver Detalle").
//
//   - extraerDatosDelPDF(pdfPath): parsea el PDF con pdfjs y devuelve
//     { nroVep, periodo, cuit, esConsolidado, cantidadSubVeps }.
//   - construirNombreYMover(srcPath, ctx): extrae metadatos, arma el nombre
//     estandarizado y mueve el PDF a archivos_afip/<cliente>/.
//
// Se separó en su propio módulo para que paso_12 y paso_12b lo reusen sin
// generar un require circular entre ellos.

const fs = require('fs/promises');
const path = require('path');
const { getDownloadPath, moverArchivo } = require('../../../../utils/fileManager.js');

// ============================================================
// EXTRACCIÓN DE METADATOS DEL PDF (copiado/adaptado del módulo VEP)
// ============================================================

async function extraerDatosDelPDF(pdfPath) {
    try {
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        // require.resolve ubica el worker tanto en dev como empaquetado en
        // app.asar. NO usar process.cwd(): en el portable de Windows apunta a
        // donde se lanzó el .exe, no a la app.
        pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

        // Pasar los bytes (no la ruta): getDocument(string) trata el argumento
        // como URL y una ruta Windows ("C:\...") rompe el parseo. verbosity:0
        // silencia los warnings de fuentes (no hacen falta para extraer texto).
        const data = new Uint8Array(await fs.readFile(pdfPath));
        const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
        const pdf = await loadingTask.promise;

        let allFilas = [];
        for (let numPagina = 1; numPagina <= pdf.numPages; numPagina++) {
            const pagina = await pdf.getPage(numPagina);
            const content = await pagina.getTextContent();

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
                .map(([y, filaItems]) => ({
                    y,
                    items: filaItems.sort((a, b) => a.transform[4] - b.transform[4])
                }));

            allFilas.push(...filasDePagina);
        }

        let nroVep = null;
        let periodo = null;
        let cuit = null;
        let esConsolidado = false;
        let cantidadSubVeps = null;

        // Detectores para los labels (más permisivos que la regex estricta del VEP).
        const matcheaLabelVEP = (s) => {
            const t = s.toLowerCase();
            // Cualquier label que mencione "VEP" cerca de "Nro", "Nº", "Numero", "N°"
            // o el texto solo "VEP:".
            return /\b(nro\.?|n[º°]\.?|numero|número)\s*(\.|de)?\s*v\.?e\.?p\.?\s*:?/.test(t)
                || /^v\.?e\.?p\.?\s*:?$/.test(t.trim());
        };
        const matcheaLabelPeriodo = (s) => {
            const t = s.toLowerCase();
            // "Período:", "Periodo:", "Período/s:", "Periodos:", "Período(s):", etc.
            return /per[ií]odo[s/()]*\s*:?$/.test(t.trim());
        };

        for (const fila of allFilas) {
            for (let i = 0; i < fila.items.length; i++) {
                const texto = fila.items[i].str.trim();
                if (!texto) continue;

                // Señales de "VEP Consolidado" — cualquiera basta.
                if (!esConsolidado && /consolidad[oa]/i.test(texto)) {
                    esConsolidado = true;
                }

                // Cantidad de SubVeps (solo aparece en consolidados).
                if (cantidadSubVeps == null && /cantidad\s*de\s*sub\s*veps?/i.test(texto)) {
                    for (let j = i + 1; j < fila.items.length; j++) {
                        const v = fila.items[j].str.trim();
                        if (/^\d+$/.test(v)) { cantidadSubVeps = v; break; }
                    }
                }

                if (!nroVep && matcheaLabelVEP(texto)) {
                    // Buscar el primer dígito-string en la misma fila a la derecha.
                    for (let j = i + 1; j < fila.items.length; j++) {
                        const valor = fila.items[j].str.trim();
                        if (valor && /^\d{6,}$/.test(valor)) { nroVep = valor; break; }
                    }
                }

                if (!periodo && matcheaLabelPeriodo(texto)) {
                    // AAAA-MM, MM/AAAA, o múltiples concatenados.
                    for (let j = i + 1; j < fila.items.length; j++) {
                        const valor = fila.items[j].str.trim();
                        let m;
                        if (m = valor.match(/^(\d{4})-(\d{2})$/)) {
                            periodo = `${m[1]}-${m[2]}`;
                            break;
                        }
                        if (m = valor.match(/^(\d{2})\/(\d{4})$/)) {
                            periodo = `${m[2]}-${m[1]}`;
                            break;
                        }
                        // El período también puede venir como solo el año
                        // (obligaciones anuales). Lo dejamos tal cual: "2023".
                        if (m = valor.match(/^(\d{4})$/)) {
                            periodo = m[1];
                            break;
                        }
                    }
                }

                if (!cuit && texto.toUpperCase().replace(/\s+/g, '') === 'CUIT:') {
                    for (let j = i + 1; j < fila.items.length; j++) {
                        const valor = fila.items[j].str.trim();
                        const m = valor.match(/\d{2}-?\d{8}-?\d/);
                        if (m) { cuit = m[0].replace(/-/g, ''); break; }
                    }
                }
            }
            if (nroVep && periodo && cuit) break;
        }

        // En un VEP Consolidado el campo "Período:" no existe — eso es
        // esperable, no es un fallo de extracción. Solo logueamos a modo
        // informativo cuando es consolidado.
        const periodoFaltanteEsperado = !periodo && esConsolidado;

        // Si algún campo no esperado falta, volcar el PDF a consola para
        // diagnóstico (así podemos ajustar las regex sin abrirlo a mano).
        const algoFalta = !nroVep || (!periodo && !esConsolidado) || !cuit;
        if (algoFalta) {
            const dump = allFilas
                .slice(0, 30)
                .map((f, idx) => {
                    const linea = f.items.map(it => it.str).join(' | ');
                    return `  [${String(idx).padStart(2, '0')}] ${linea}`;
                })
                .join('\n');
            console.warn('  ⚠️ [SCT] Campos faltantes en el PDF — volcado de las primeras 30 filas:');
            console.warn(`  faltan: nroVep=${!nroVep} periodo=${!periodo} cuit=${!cuit} consolidado=${esConsolidado}`);
            console.warn(dump);
        } else if (periodoFaltanteEsperado) {
            console.log(`  ℹ️ [SCT] VEP Consolidado detectado${cantidadSubVeps ? ` (${cantidadSubVeps} subVEPs)` : ''} — sin período único`);
        }

        return { nroVep, periodo, cuit, esConsolidado, cantidadSubVeps };
    } catch (error) {
        console.error('  ❌ [SCT] Error al extraer datos del PDF:', error);
        return { nroVep: null, periodo: null, cuit: null, esConsolidado: false, cantidadSubVeps: null };
    }
}

function fechaHoy() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// ============================================================
// NOMBRADO + MOVIDO ESTANDARIZADO
// ============================================================

/**
 * Extrae los metadatos del PDF, arma el nombre estandarizado
 * (VEP-CT_<nroVep>_<cuit>_<medio>_<periodo>_<fecha>.pdf) y lo mueve a
 * archivos_afip/<cliente>/. Devuelve los datos y rutas resultantes para que
 * el llamador pueda seguir (ej.: guardar el QR en el mismo destinoDir).
 *
 * @param {string} srcPath  PDF de origen (en un tempdir).
 * @param {Object} ctx { cliente, cuitAsociado, medioPago, downloadsPath }
 */
async function construirNombreYMover(srcPath, { cliente, cuitAsociado, medioPago, downloadsPath }) {
    const { nroVep, periodo, cuit, esConsolidado, cantidadSubVeps } = await extraerDatosDelPDF(srcPath);

    // En VEPs Consolidados (varias deudas en un único pago) no hay un período
    // único; armar un nombre con todos los períodos quedaría demasiado largo y,
    // si son discontinuos, ni siquiera se puede usar un rango. Reemplazamos por
    // "Consolidado-N" (donde N es la cantidad de subVEPs si está disponible).
    let periodoFinal;
    if (periodo) {
        periodoFinal = periodo;
    } else if (esConsolidado) {
        periodoFinal = cantidadSubVeps ? `Consolidado-${cantidadSubVeps}` : 'Consolidado';
    } else {
        periodoFinal = 'SinPeriodo';
    }

    const fecha = fechaHoy();
    const cuitFinal = cuit || cuitAsociado || (cliente && cliente.cuitLogin) || 'SinCuit';
    const nroVepFinal = nroVep || 'SinNumero';
    const medioPagoId = (medioPago && medioPago.id) || 'sinMedio';
    const nuevoNombre = `VEP-CT_${nroVepFinal}_${cuitFinal}_${medioPagoId}_${periodoFinal}_${fecha}.pdf`;

    // Pasar el objeto cliente con CUIT para que la carpeta sea canónica
    // (ver fileManager.nombreCarpetaCliente). En SCT el `cliente` viene
    // como `{id, nombre, cuitLogin}` desde el flujo, así que mapeamos
    // `cuitLogin` → `cuit` y caemos a `cuitAsociado` si falta.
    const clienteParaCarpeta = {
        cuit: (cliente && cliente.cuitLogin) || cuitAsociado,
        nombre: cliente && cliente.nombre,
        apellido: cliente && cliente.apellido
    };
    const destinoDir = getDownloadPath(downloadsPath, clienteParaCarpeta, 'archivos_afip');
    const destinoPath = path.join(destinoDir, nuevoNombre);

    await moverArchivo(srcPath, destinoPath);

    return {
        nuevoNombre,
        destinoPath,
        destinoDir,
        periodoFinal,
        // `datos.periodo` queda crudo (AAAA-MM o null) como antes; `periodoFinal`
        // es el que se usó en el nombre (puede ser "Consolidado-N"/"SinPeriodo").
        datos: { nroVep, periodo, cuit, esConsolidado, cantidadSubVeps }
    };
}

module.exports = { extraerDatosDelPDF, fechaHoy, construirNombreYMover };
