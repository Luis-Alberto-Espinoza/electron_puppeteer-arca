// PASO 5: Exportar la tabla de deudas a Excel (.xlsx).
// Click en "Exportar" → "XLS", captura la descarga con CDP (tempdir),
// y mueve el archivo a archivos_afip/<cliente>/ con un nombre estandarizado.

const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { getDownloadPath } = require('../../../../utils/fileManager.js');
const { getSctFrame } = require('./_helpers.js');

function fechaHoy() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function esperarArchivo(tempDir, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const items = await fs.readdir(tempDir);
            const listos = items.filter(n => !n.endsWith('.crdownload') && !n.endsWith('.tmp'));
            if (listos.length > 0) return listos[0];
        } catch (_) { /* ignore */ }
        await new Promise(r => setTimeout(r, 500));
    }
    return null;
}

async function ejecutar(page, usuario, cuitAsociado, downloadsPath) {
    let tempDir = null;
    try {
        console.log('  → [SCT] Exportando Excel de deudas...');

        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sct-xls-'));

        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: tempDir
        });

        // El botón Exportar y su dropdown están dentro del iframe del SCT.
        const frame = await getSctFrame(page);

        // Asegurar que el iframe en sí esté en pantalla (el scroll desde adentro
        // del iframe no siempre arrastra al host).
        const iframeHandle = await page.$('.v-iframe iframe');
        if (iframeHandle) {
            try { await iframeHandle.scrollIntoView(); } catch (_) { /* no es crítico */ }
        }

        // 1) Buscar el botón "Exportar" VISIBLE (Bootstrap-Vue renderiza todas las
        // tabs en el DOM pero solo la activa tiene tamaño; las otras tienen
        // display:none → su botón "Exportar" no es clickeable).
        const exportarHandle = await frame.evaluateHandle(() => {
            const botones = Array.from(document.querySelectorAll('button.dropdown-toggle'));
            return botones.find(b => {
                if (!(b.textContent || '').toLowerCase().includes('exportar')) return false;
                const rect = b.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }) || null;
        });
        const exportarEl = exportarHandle.asElement();
        if (!exportarEl) throw new Error('No se encontró un botón "Exportar" visible en la tab activa');
        await exportarEl.scrollIntoView();
        await new Promise(r => setTimeout(r, 200));
        await exportarEl.click(); // click "real" — isTrusted=true

        // 2) Esperar a que aparezca el item XLS VISIBLE (mismo razonamiento: hay
        // un dropdown por tab; solo el de la tab activa tiene tamaño real).
        await frame.waitForFunction(() => {
            const items = Array.from(document.querySelectorAll('a.dropdown-item'));
            return items.some(el => {
                if (!(el.textContent || '').trim().toUpperCase().includes('XLS')) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            });
        }, { timeout: 8000 });

        // 3) Click real en el <a.dropdown-item> visible de XLS.
        const xlsHandle = await frame.evaluateHandle(() => {
            const items = Array.from(document.querySelectorAll('a.dropdown-item'));
            return items.find(el => {
                if (!(el.textContent || '').trim().toUpperCase().includes('XLS')) return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0;
            }) || null;
        });
        const xlsEl = xlsHandle.asElement();
        if (!xlsEl) throw new Error('No se encontró el <a.dropdown-item> visible con "XLS"');
        await xlsEl.scrollIntoView();
        await new Promise(r => setTimeout(r, 200));
        await xlsEl.click();

        // 3) Esperar descarga.
        const originalName = await esperarArchivo(tempDir, 20000);
        if (!originalName) {
            throw new Error('La descarga del Excel no se completó en el tiempo esperado');
        }

        const srcPath = path.join(tempDir, originalName);
        const ext = path.extname(originalName) || '.xlsx';

        // 4) Mover a archivos_afip/<cliente>/ con nombre estandarizado.
        const destinoDir = getDownloadPath(downloadsPath, usuario.nombre, 'archivos_afip');
        const nuevoNombre = `DeudaCT_${cuitAsociado || usuario.cuit}_${fechaHoy()}${ext}`;
        const destinoPath = path.join(destinoDir, nuevoNombre);
        await fs.rename(srcPath, destinoPath);

        console.log(`  ✅ [SCT] Excel guardado: ${nuevoNombre}`);
        return {
            success: true,
            excelDescargado: {
                nombre: nuevoNombre,
                path: destinoPath
            }
        };

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_5_exportarExcel:', error);
        return { success: false, message: error.message };
    } finally {
        if (tempDir) {
            try {
                if (fsSync.existsSync(tempDir)) {
                    await fs.rm(tempDir, { recursive: true, force: true });
                }
            } catch (_) { /* ignore */ }
        }
    }
}

module.exports = { ejecutar };
