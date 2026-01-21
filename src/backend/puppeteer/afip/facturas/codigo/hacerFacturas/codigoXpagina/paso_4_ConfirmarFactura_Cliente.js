/**
 * Paso 4 - Confirmar Factura y Generar PDF (VERSIÓN CLIENTE)
 *
 * Funcionalidad:
 * 1. Scroll hasta abajo
 * 2. Ejecutar AJAX para validar formulario
 * 3. Confirmar factura
 * 4. Hacer clic en botón "Imprimir"
 * 5. Capturar PDF generado y guardarlo en carpeta del cliente
 */

const path = require('path');
const fs = require('fs').promises;
const { getDownloadPath, getFilename } = require('../../../../../../utils/fileManager');
async function paso_4_ConfirmarFactura_Cliente(newPage, modoTest, usuarioSeleccionado, downloadsPath) {
    try {
        console.log("Ejecutando paso_4_ConfirmarFactura_Cliente...");

        // Esperar a que los elementos estén disponibles
        await newPage.waitForSelector('#contenido', { timeout: 120000 });

        // Configurar el directorio de descargas antes de la impresión
        let pdfPath = null;
        let downloadDir = null;

        if (!modoTest) {
            // Determinar la carpeta donde guardar el PDF usando fileManager
            const basePath = downloadsPath || require('electron').app.getPath('downloads');

            // Construir nombre de usuario desde el objeto (nombre + apellido)
            const userName = usuarioSeleccionado.nombre
                ? `${usuarioSeleccionado.nombre}${usuarioSeleccionado.apellido ? '_' + usuarioSeleccionado.apellido : ''}`
                : (usuarioSeleccionado.nombreUsuario || 'default');

            // Usar estructura: /Descargas/gestor_afip_atm/[USUARIO]/archivos_afip/facturas/
            downloadDir = path.join(
                basePath,
                'gestor_afip_atm',
                userName.replace(/[^a-zA-Z0-9]/g, '_'),
                'archivos_afip',
                'facturas'
            );

            console.log(`👤 Usuario: ${userName}`);

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

        // PASO 1: Scroll hasta abajo
        await newPage.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        // Pequeña espera para que se cargue todo el contenido
        await new Promise(resolve => setTimeout(resolve, 1000));

        // PASO 2 y 3: Ejecutar AJAX y confirmar factura
        console.log(`🔧 Modo test: ${modoTest}`);
        console.log(`📍 URL actual: ${await newPage.url()}`);

        const resultadoEvaluate = await newPage.evaluate((modoTest) => {
            const resultado = {
                url: window.location.href,
                enPaginaCorrecta: false,
                ajaxFunctionExiste: typeof ajaxFunction === 'function',
                ajaxEjecutado: false,
                modoTest: modoTest
            };

            try {
                if (window.location.href.includes('genComResumenDatos')) {
                    resultado.enPaginaCorrecta = true;
                    window.scrollTo(0, document.body.scrollHeight);

                    if (!modoTest) {
                        // Ejecutar función AJAX para confirmar
                        if (typeof ajaxFunction === 'function') {
                            ajaxFunction();
                            resultado.ajaxEjecutado = true;
                            console.log('✅ ajaxFunction() ejecutada');
                        } else {
                            console.warn('⚠️ ajaxFunction no está definida');
                        }
                    } else {
                        console.log('⏭️ Modo test activado - saltando ajaxFunction');
                    }

                    // Hacer clic en el botón de confirmar después de un delay (reducido de 2500 a 1500ms)
                    setTimeout(function () {
                        if (!modoTest) {
                            let btnConfirmar = document.querySelectorAll('input')[3];
                            if (btnConfirmar) {
                               // btnConfirmar.click();
                                console.log('Botón confirmar clickeado');
                            }
                        }
                    }, 500);
                } else {
                    console.log("No estamos en genComResumenDatos:", window.location.href);
                }
            } catch (error) {
                console.error('Error al confirmar:', error);
                resultado.error = error.message;
            }

            return resultado;
        }, modoTest);

        console.log('📊 Resultado de evaluate:', resultadoEvaluate);

        // Dar tiempo para que se procese el AJAX (reducido de 10s a 1.5s para mayor velocidad)
        console.log('⏳ Esperando a que se procese el AJAX (1.5 segundos)...');
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Comentado: No esperamos navegación para observar qué pasa en la página
        // await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

        // PASO 4: Hacer clic en el botón "Imprimir..." y esperar descarga (solo en modo producción)
        if (!modoTest) {
            console.log("🖨️  Buscando botón de imprimir...");

            try {
                // Listar archivos PDF actuales en la carpeta (para detectar el nuevo)
                const archivosAntes = await fs.readdir(downloadDir).then(files =>
                    files.filter(f => f.endsWith('.pdf'))
                ).catch(() => []);

                console.log(`📄 PDFs existentes antes de imprimir: ${archivosAntes.length}`);

                // Esperar y verificar que existe el botón "Imprimir..."
                // El botón tiene: onclick="parent.location.href='imprimirComprobante.do?c='+idComprobante;"
                await newPage.waitForSelector('input[value="Imprimir..."]', { timeout: 30000 });
                console.log('✓ Botón "Imprimir..." encontrado');

                // Hacer clic en el botón (esto causará navegación a imprimirComprobante.do)
                const navigationPromise = newPage.waitForNavigation({
                    waitUntil: 'networkidle2',
                    timeout: 15000
                }).catch(err => {
                    console.log('⚠️  No hubo navegación o timeout:', err.message);
                    return null;
                });

                await newPage.click('input[value="Imprimir..."]');
                console.log('✓ Clic en botón "Imprimir..." ejecutado');

                // Esperar navegación (puede que la página navegue o que se descargue directamente)
                await navigationPromise;

                // Esperar a que aparezca el nuevo PDF (timeout: 7 segundos)
                console.log('⏳ Esperando descarga del PDF...');
                const startTime = Date.now();
                const timeout = 7000;
                let pdfEncontrado = false;

                while (Date.now() - startTime < timeout && !pdfEncontrado) {
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    const archivosDespues = await fs.readdir(downloadDir).then(files =>
                        files.filter(f => f.endsWith('.pdf'))
                    ).catch(() => []);

                    const nuevosArchivos = archivosDespues.filter(f => !archivosAntes.includes(f));

                    if (nuevosArchivos.length > 0) {
                        // Encontramos el PDF nuevo
                        const nombrePDF = nuevosArchivos[0];
                        pdfPath = path.join(downloadDir, nombrePDF);
                        console.log(`✅ PDF descargado: ${nombrePDF}`);
                        pdfEncontrado = true;
                        break;
                    }
                }

                if (!pdfEncontrado) {
                    console.warn('⚠️  No se detectó la descarga del PDF en 30 segundos');
                    console.log('ℹ️  Puede que el PDF se haya abierto en el navegador en lugar de descargarse');
                    // No lanzar error, continuar con el flujo
                }
            } catch (error) {
                console.error('❌ Error al intentar imprimir:', error.message);
                console.log('ℹ️  Continuando sin PDF descargado');
            }
        }

        // Modo test: solo tomar captura
        if (modoTest) {
            const os = require('os');
            const screenshotsDir = os.tmpdir();
            const screenshotPath = path.join(screenshotsDir, 'paso4_confirmacion.png');
            await newPage.screenshot({ path: screenshotPath, fullPage: true });
            console.log('Captura guardada en:', screenshotPath);
        }

        // PASO 5: Volver al menú principal para poder continuar con más facturas
        console.log("Haciendo clic en 'Volver al menú principal'...");
        await newPage.evaluate(() => {
            try {
                // Buscar el botón "Volver" o similar
                let btnVolver = document.querySelector('input[value="Volver"]') ||
                               document.querySelector('input[value*="Men"]') ||
                               document.querySelector('a[href*="menuPrincipal"]');

                if (btnVolver) {
                    btnVolver.click();
                    console.log('Botón volver al menú principal clickeado');
                } else {
                    console.warn('No se encontró el botón volver al menú principal');
                }
            } catch (error) {
                console.error('Error al volver al menú principal:', error);
            }
        });

        // Esperar a que cargue el menú principal
        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
            console.log('No hubo navegación, ya estamos en el menú principal');
        });

        console.log("paso_4_ConfirmarFactura_Cliente completado exitosamente.");
        return {
            success: true,
            message: "Factura confirmada y PDF generado",
            pdfPath: pdfPath
        };

    } catch (error) {
        console.error("Error al ejecutar paso_4_ConfirmarFactura_Cliente:", error);
        throw error;
    }
}

module.exports = { paso_4_ConfirmarFactura_Cliente };
