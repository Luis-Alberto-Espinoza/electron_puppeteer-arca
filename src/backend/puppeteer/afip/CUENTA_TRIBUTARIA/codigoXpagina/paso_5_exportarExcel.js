// PASO 5: Exportar la tabla de deudas a Excel (.xlsx).
// Click en "Exportar" → "XLS", captura la descarga con CDP (tempdir),
// y mueve el archivo a archivos_afip/<cliente>/ con un nombre estandarizado.

const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const path = require('path');
const { getDownloadPath, moverArchivo } = require('../../../../utils/fileManager.js');
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

        // 0) Pre-check: esperar a que la tabla tenga al menos una fila ANTES
        // de tocar Exportar. Si AFIP aún no terminó de poblar la tabla, el
        // dropdown puede no abrirse correctamente al primer click.
        try {
            await frame.waitForFunction(
                () => document.querySelectorAll('.tab-pane.active tbody tr[role="row"]').length > 0,
                { timeout: 15000 }
            );
        } catch (_) {
            console.warn('  ⚠️ [SCT] La tabla parece vacía al iniciar Exportar (continuando igual).');
        }

        // 1) Helper para localizar el botón "Exportar" visible — lo re-buscamos
        // en cada intento porque el handle puede invalidarse si Vue re-renderiza.
        async function buscarExportarEl() {
            const handle = await frame.evaluateHandle(() => {
                const botones = Array.from(document.querySelectorAll('button.dropdown-toggle'));
                return botones.find(b => {
                    if (!(b.textContent || '').toLowerCase().includes('exportar')) return false;
                    const rect = b.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                }) || null;
            });
            return handle.asElement();
        }

        async function dropdownAbierto() {
            return await frame.evaluate(() => {
                const items = Array.from(document.querySelectorAll('a.dropdown-item'));
                return items.some(el => {
                    if (!(el.textContent || '').trim().toUpperCase().includes('XLS')) return false;
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                });
            });
        }

        // 2) Click "Exportar" con retry. Si tras el primer click el dropdown
        // no se abre en 6s, reintentar (típico cuando Vue todavía estaba
        // atando handlers al botón).
        const MAX_INTENTOS_EXPORTAR = 3;
        let dropdownListo = false;
        for (let intento = 1; intento <= MAX_INTENTOS_EXPORTAR; intento++) {
            const exportarEl = await buscarExportarEl();
            if (!exportarEl) {
                throw new Error('No se encontró un botón "Exportar" visible en la tab activa');
            }
            try { await exportarEl.scrollIntoView(); } catch (_) {}
            await new Promise(r => setTimeout(r, 200));
            await exportarEl.click(); // click real — isTrusted=true

            // Polling activo: el dropdown puede tardar entre 100ms y varios segundos.
            const inicio = Date.now();
            while (Date.now() - inicio < 6000) {
                if (await dropdownAbierto()) { dropdownListo = true; break; }
                await new Promise(r => setTimeout(r, 200));
            }
            if (dropdownListo) break;

            console.warn(`  ⚠️ [SCT] Dropdown "Exportar" no abrió tras click ${intento}/${MAX_INTENTOS_EXPORTAR}; reintentando.`);
        }

        if (!dropdownListo) {
            throw new Error('El dropdown "Exportar" no se abrió tras varios intentos');
        }

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
        const destinoDir = getDownloadPath(downloadsPath, {
            cuit: usuario.cuit || cuitAsociado,
            nombre: usuario.nombre,
            apellido: usuario.apellido
        }, 'archivos_afip');
        const nuevoNombre = `DeudaCT_${cuitAsociado || usuario.cuit}_${fechaHoy()}${ext}`;
        const destinoPath = path.join(destinoDir, nuevoNombre);
        await moverArchivo(srcPath, destinoPath);

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
