// PASO 12: Descargar el PDF del VEP generado desde el SCT.
//
// Estructura general (idéntica al paso_10_descargarPDF.js del VEP):
//   1. Configurar Page.setDownloadBehavior con CDP a un tempdir.
//   2. Click en el link "Exportar detalle en archivo PDF" (vive en el iframe).
//   3. Esperar archivo en tempdir (polling — patrón 7.0.1).
//   4. Extraer metadatos con pdfjs-dist (Nro VEP, periodo, CUIT).
//   5. Mover a archivos_afip/<cliente>/ con el nombre estandarizado.
//
// Patrones aplicados (ver doc §7.0):
//   7.0.1 esperar archivo (polling), no setTimeout fijo,
//   7.0.2 click real,
//   7.0.6 link vive en el iframe del SCT.

const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { getDownloadPath, moverArchivo } = require('../../../../utils/fileManager.js');
const { frameConPredicado } = require('./_helpers.js');

// ============================================================
// EXTRACCIÓN DE METADATOS DEL PDF (copiado/adaptado del módulo VEP)
// ============================================================

async function extraerDatosDelPDF(pdfPath) {
    try {
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(
            process.cwd(),
            'node_modules/pdfjs-dist/build/pdf.worker.js'
        );

        const loadingTask = pdfjsLib.getDocument(pdfPath);
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

// ============================================================
// HELPERS
// ============================================================

async function esperarArchivoListo(tempDir, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const items = await fs.readdir(tempDir);
            const listos = items.filter(n => !n.endsWith('.crdownload') && !n.endsWith('.tmp'));
            if (listos.length > 0) return listos[0];
        } catch (_) {}
        await new Promise(r => setTimeout(r, 500));
    }
    return null;
}

async function clickLinkPDF(frame) {
    return await frame.evaluate(() => {
        // 1) Buscar por title (más robusto).
        let link = document.querySelector('a[title="Exportar detalle en archivo PDF"]');
        // 2) Fallback: link que contenga el ícono picture_as_pdf.
        if (!link) {
            const spans = Array.from(document.querySelectorAll('span'));
            const pdfIcon = spans.find(s => (s.textContent || '').trim() === 'picture_as_pdf');
            if (pdfIcon) link = pdfIcon.closest('a') || pdfIcon.closest('button');
        }
        if (!link) return { encontrado: false };

        try { link.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (_) {}
        link.click();
        return { encontrado: true };
    });
}

function fechaHoy() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// ============================================================
// EJECUTAR
// ============================================================

async function ejecutar(page, cliente, cuitAsociado, medioPago, downloadsPath) {
    let tempDir = null;
    try {
        console.log('  → [SCT] Descargando PDF del VEP...');

        // 1. Tempdir + CDP setDownloadBehavior.
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sct-vep-pdf-'));
        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: tempDir
        });

        // 2. Buscar el frame que tenga el link/botón de PDF (puede vivir en
        //    cualquier frame, no necesariamente en el del SCT).
        const predicateSrc = `() => {
            if (document.querySelector('a[title="Exportar detalle en archivo PDF"]')) return true;
            const spans = Array.from(document.querySelectorAll('span'));
            return spans.some(s => (s.textContent || '').trim() === 'picture_as_pdf');
        }`;

        const inicioBusq = Date.now();
        let frame = null;
        while (Date.now() - inicioBusq < 20000) {
            frame = await frameConPredicado(page, predicateSrc);
            if (frame) break;
            await new Promise(r => setTimeout(r, 400));
        }
        if (!frame) {
            throw new Error('No se encontró el link de descarga del PDF en ningún frame');
        }

        const r = await clickLinkPDF(frame);
        if (!r.encontrado) {
            throw new Error('No se encontró el link de descarga del PDF');
        }

        // 3. Esperar archivo (polling).
        const originalName = await esperarArchivoListo(tempDir, 30000);
        if (!originalName) {
            throw new Error('La descarga del PDF no se completó en el tiempo esperado');
        }

        const srcPath = path.join(tempDir, originalName);

        // 4. Extraer metadatos.
        const { nroVep, periodo, cuit, esConsolidado, cantidadSubVeps } = await extraerDatosDelPDF(srcPath);

        // 5. Generar nombre y mover.
        // En VEPs Consolidados (varias deudas en un único pago) no hay un
        // período único; armar un nombre con todos los períodos quedaría
        // demasiado largo y, si son discontinuos, ni siquiera se puede usar
        // un rango. Reemplazamos por "Consolidado-N" (donde N es la cantidad
        // de subVEPs si está disponible).
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

        console.log(`  ✅ [SCT] PDF descargado: ${nuevoNombre}`);
        console.log(`     Nro VEP: ${nroVep || 'N/A'} | Período: ${periodoFinal} | CUIT: ${cuit || 'N/A'}${esConsolidado ? ' | Consolidado' : ''}`);

        // 6. Si el medio de pago es QR, guardar también la imagen del código QR.
        //    AFIP la renderiza como <img src="data:image/...;base64,..."> dentro
        //    de un <div> que menciona "billeteras". Filtramos por ese contexto
        //    porque la página tiene otras imágenes base64 (logo, etc.) y el
        //    primer match genérico cae con el logo. Además, AFIP declara mime
        //    `image/png` aunque el binario es JPEG, así que detectamos el tipo
        //    real desde la firma del base64 y elegimos la extensión correcta.
        let qrPath = null;
        let qrNombre = null;
        if (medioPago && medioPago.id === 'pago_qr') {
            try {
                console.log('  → [SCT] Buscando código QR en la vista...');

                const predicadoQR = `() => {
                    const imgs = Array.from(document.querySelectorAll('img'));
                    return imgs.some(img => {
                        if (!(img.src || '').startsWith('data:image')) return false;
                        const cont = img.closest('div');
                        return !!(cont && /billetera/i.test(cont.textContent || ''));
                    });
                }`;

                let frameQR = null;
                const inicioQR = Date.now();
                while (Date.now() - inicioQR < 10000) {
                    frameQR = await frameConPredicado(page, predicadoQR);
                    if (frameQR) break;
                    await new Promise(r => setTimeout(r, 400));
                }

                if (!frameQR) {
                    console.log('  ℹ️ [SCT] No se encontró imagen QR (contenedor "billeteras") en ningún frame');
                } else {
                    const qrDataUrl = await frameQR.evaluate(() => {
                        const imgs = Array.from(document.querySelectorAll('img'));
                        const imgQR = imgs.find(img => {
                            if (!(img.src || '').startsWith('data:image')) return false;
                            const cont = img.closest('div');
                            return !!(cont && /billetera/i.test(cont.textContent || ''));
                        });
                        return imgQR ? imgQR.src : null;
                    });

                    if (qrDataUrl) {
                        // Separar header y payload base64. AFIP a veces deja un
                        // espacio después de la coma — lo limpiamos.
                        const idxComa = qrDataUrl.indexOf(',');
                        const base64Data = qrDataUrl.slice(idxComa + 1).trim();

                        // Detectar el tipo real por la firma del base64 (los
                        // primeros bytes decodificados): el header de AFIP miente.
                        let extension = 'png';
                        if (base64Data.startsWith('/9j/')) {
                            extension = 'jpg';                    // JPEG (FF D8 FF)
                        } else if (base64Data.startsWith('iVBOR')) {
                            extension = 'png';                    // PNG (89 50 4E 47)
                        } else if (base64Data.startsWith('R0lGOD')) {
                            extension = 'gif';                    // GIF
                        }

                        qrNombre = nuevoNombre.replace(/\.pdf$/i, `.${extension}`);
                        qrPath = path.join(destinoDir, qrNombre);
                        await fs.writeFile(qrPath, base64Data, 'base64');
                        console.log(`  ✅ [SCT] Código QR guardado: ${qrNombre}`);
                    } else {
                        console.log('  ℹ️ [SCT] Frame matcheado pero no se pudo extraer el data URI');
                    }
                }
            } catch (errorQR) {
                console.warn(`  ⚠️ [SCT] Error al guardar QR (continuando): ${errorQR.message}`);
            }
        }

        return {
            success: true,
            pdfDescargado: {
                nombre: nuevoNombre,
                path: destinoPath,
                datos: { nroVep, periodo, cuit, esConsolidado, cantidadSubVeps }
            },
            qrDescargado: qrPath ? { nombre: qrNombre, path: qrPath } : null
        };

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_12_descargarPdfCT:', error);
        return { success: false, message: error.message };
    } finally {
        if (tempDir) {
            try {
                if (fsSync.existsSync(tempDir)) {
                    await fs.rm(tempDir, { recursive: true, force: true });
                }
            } catch (_) {}
        }
    }
}

module.exports = { ejecutar };
