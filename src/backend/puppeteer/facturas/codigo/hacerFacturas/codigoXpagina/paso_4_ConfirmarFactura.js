const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { fork } = require('child_process');

async function paso_4_ConfirmarFactura(newPage, modoTest, usuarioSeleccionado = null, downloadsPath = null) {
    try {
        // Esperar a que los elementos estén disponibles
        await newPage.waitForSelector('#contenido', { timeout: 120000 });

        // Variables para descarga de PDF (si se especifican los parámetros)
        let pdfPath = null;
        let downloadDir = null;

        // Si se proporcionan usuarioSeleccionado y downloadsPath, configurar descarga de PDF
        if (!modoTest && usuarioSeleccionado && downloadsPath) {
            const userName = usuarioSeleccionado.nombreUsuario || 'default';

            // Estructura: /Descargas/gestor_afip_atm/[USUARIO]/archivos_afip/facturas/
            downloadDir = path.join(
                downloadsPath,
                'gestor_afip_atm',
                userName.replace(/[^a-zA-Z0-9]/g, '_'),
                'archivos_afip',
                'facturas'
            );

            // Crear el directorio si no existe
            await fs.mkdir(downloadDir, { recursive: true });

            console.log(`📁 PDF se descargará en: ${downloadDir}`);

            // Configurar el cliente CDP para interceptar el PDF
            const client = await newPage.target().createCDPSession();

            // Habilitar la descarga de archivos
            await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: downloadDir
            });
        }

        if (modoTest) {
            // Obtener el tamaño máximo de la pantalla
            const { width, height } = await newPage.evaluate(() => {
                return {
                    width: window.screen.width,
                    height: window.screen.height
                };
            });

            // Usar estas dimensiones para el viewport de Puppeteer
            const client = await newPage.target().createCDPSession();
            await client.send('Emulation.setDeviceMetricsOverride', {
                width: width,
                height: height,
                deviceScaleFactor: 1,
                mobile: false
            });
            // Obtener el ancho de la ventana del navegador
            const { viewportWidth, viewportHeight } = await newPage.evaluate(() => {
                return {
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight
                };
            });

            // Obtener el ancho y alto total del contenido de la página
            const { contentWidth, contentHeight } = await newPage.evaluate(() => {
                return {
                    contentWidth: Math.max(
                        document.body.scrollWidth,
                        document.documentElement.scrollWidth,
                        document.body.offsetWidth,
                        document.documentElement.offsetWidth,
                        document.documentElement.clientWidth
                    ),
                    contentHeight: Math.max(
                        document.body.scrollHeight,
                        document.documentElement.scrollHeight,
                        document.body.offsetHeight,
                        document.documentElement.offsetHeight,
                        document.documentElement.clientHeight
                    )
                };
            });

            // Calcular el factor de zoom para que el contenido se ajuste al viewport
            const zoomFactor = Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight);

            // Aplicar el zoom
            if (zoomFactor < 1) { // Solo si la página es más grande que la ventana
                await newPage.evaluate((zoom) => {
                    document.body.style.zoom = zoom;
                }, zoomFactor);
            }

            // Esperar un poco para que se aplique el zoom
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Usa el directorio temporal del sistema
            const screenshotsDir = os.tmpdir();
            const screenshotPath = path.join(screenshotsDir, 'paso1_servicio.png');
            await newPage.screenshot({ path: screenshotPath });
            console.log('Captura guardada en:', screenshotPath);

            // Verifica que el archivo existe antes de intentar abrirlo
            if (await fs.access(screenshotPath).then(() => true).catch(() => false)) {
                const visorProcess = fork(path.join(__dirname, './../visorImagen.js'));
                visorProcess.on('error', (err) => {
                    console.error('Error en el proceso visor:', err);
                });
                visorProcess.on('exit', (code) => {
                    console.log('Proceso visor terminó con código:', code);
                });
                visorProcess.send({ screenshotPath });
            } else {
                console.error('Error: No se pudo crear el archivo de captura en', screenshotPath);
            }

            // Cerrar ambas ventanas del navegador
            const browser = await newPage.browser();
            const pages = await browser.pages();
            for (const p of pages) {
                try { await p.close(); } catch (e) { }
            }
            await browser.close();

            return { success: true, message: "Modo test: captura realizada y ventanas cerradas" };
        }

        // Ejecutar el código dentro de la página
        await newPage.evaluate((modoTest) => {
            try {
                if (window.location.href.includes('genComResumenDatos')) {
                    window.scrollTo(0, document.body.scrollHeight);
                    let btnMenuPrinvipalVolver = document.querySelectorAll('input');
                    if (!modoTest) {
                        // ajaxFunction();
                    } else {
                        //quitar zoom hata ver la paghina completa
                        document.body.style.zoom = "0.8";
                        // tomar captura de pantalla
                    }

                    setTimeout(function () {
                        if (!modoTest) {
                            btnMenuPrinvipalVolver[3].click();
                        }
                    }, 2500);
                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "genComResumenDatos:");
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, modoTest);

        // Esperar la navegación después de hacer clic en el botón (confirmación)
        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

        // Si se configuró descarga de PDF, hacer clic en "Imprimir..." y esperar descarga
        if (downloadDir) {
            console.log("🖨️  Descargando PDF...");

            // Listar archivos PDF actuales
            const archivosAntes = await fs.readdir(downloadDir).then(files =>
                files.filter(f => f.endsWith('.pdf'))
            ).catch(() => []);

            console.log(`📄 PDFs existentes: ${archivosAntes.length}`);

            // Hacer clic en botón "Imprimir..."
            await newPage.waitForSelector('input[value="Imprimir..."]', { timeout: 30000 });
            await newPage.click('input[value="Imprimir..."]');
            console.log('✓ Clic en "Imprimir..." ejecutado');

            // Esperar descarga del PDF (timeout: 30 segundos)
            console.log('⏳ Esperando descarga del PDF...');
            const startTime = Date.now();
            const timeout = 30000;
            let pdfEncontrado = false;

            while (Date.now() - startTime < timeout && !pdfEncontrado) {
                await new Promise(resolve => setTimeout(resolve, 1000));

                const archivosDespues = await fs.readdir(downloadDir).then(files =>
                    files.filter(f => f.endsWith('.pdf'))
                ).catch(() => []);

                const nuevosArchivos = archivosDespues.filter(f => !archivosAntes.includes(f));

                if (nuevosArchivos.length > 0) {
                    const nombrePDF = nuevosArchivos[0];
                    pdfPath = path.join(downloadDir, nombrePDF);
                    console.log(`✅ PDF descargado: ${nombrePDF}`);
                    pdfEncontrado = true;
                    break;
                }
            }

            if (!pdfEncontrado) {
                console.warn('⚠️  No se detectó la descarga del PDF en 30 segundos');
            }
        }

        console.log("paso_4_ConfirmarFactura completado");
        return {
            success: true,
            message: "Confirmación de la operación completada",
            pdfPath: pdfPath || null
        };
    } catch (error) {
        console.error("Error al ejecutar el paso 4:", error);
        throw error;
    }
}

module.exports = { paso_4_ConfirmarFactura };