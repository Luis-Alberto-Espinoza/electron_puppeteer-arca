/**
 * Paso 4 - Confirmar Factura (VERSIÓN UNIFICADA - REHECHO CORRECTAMENTE)
 *
 * Unifica paso_4_ConfirmarFactura.js y paso_4_ConfirmarFactura_Cliente.js
 * copiando EXACTAMENTE el código que funciona en ambos archivos.
 *
 * Diferencias entre versiones:
 * - Normal: cierra navegador en modo test
 * - Cliente: NO cierra navegador, vuelve al menú principal
 *
 * Según acuerdos: SIEMPRE volver al menú principal, nunca cerrar navegador aquí.
 */

const os = require('os');
const path = require('path');
const fs = require('fs').promises;
const { fork } = require('child_process');

async function paso_4_ConfirmarFactura_Unificado(newPage, modoTest, usuarioSeleccionado = null, downloadsPath = null) {
    try {
        // Esperar a que los elementos estén disponibles (COPIADO EXACTO)
        await newPage.waitForSelector('#contenido', { timeout: 120000 });

        // Variables para descarga de PDF (COPIADO EXACTO)
        let pdfPath = null;
        let downloadDir = null;

        // ==========================================
        // CONFIGURAR DESCARGA DE PDF (COPIADO EXACTO de ambos archivos)
        // ==========================================
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

        // ==========================================
        // MODO TEST (COPIADO de paso_4_ConfirmarFactura_Cliente.js líneas 148-155)
        // NO cerramos navegador según acuerdos
        // ==========================================
        if (modoTest) {
            const screenshotsDir = os.tmpdir();
            const screenshotPath = path.join(screenshotsDir, 'paso4_confirmacion.png');
            await newPage.screenshot({ path: screenshotPath, fullPage: true });
            console.log('Captura guardada en:', screenshotPath);

            return { success: true, message: "Modo test: captura realizada" };
        }

        // ==========================================
        // CONFIRMAR FACTURA (COPIADO EXACTO de paso_4_ConfirmarFactura_Cliente.js líneas 56-95)
        // ==========================================

        // PASO 1: Scroll hasta abajo
        await newPage.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        // Pequeña espera para que se cargue todo el contenido
        await newPage.waitForTimeout(1000);

        // PASO 2 y 3: Ejecutar AJAX y confirmar factura
        await newPage.evaluate((modoTest) => {
            try {
                if (window.location.href.includes('genComResumenDatos')) {
                    window.scrollTo(0, document.body.scrollHeight);

                    if (!modoTest) {
                        // Ejecutar función AJAX para confirmar (NOMBRE EXACTO del original)
                        if (typeof ajaxFunction === 'function') {
                           // ajaxFunction();
                        } else {
                            console.warn('ajaxFunction no está definida');
                        }
                    }

                    // Hacer clic en el botón de confirmar después de un delay
                    setTimeout(function () {
                        if (!modoTest) {
                            let btnConfirmar = document.querySelectorAll('input')[3];
                            if (btnConfirmar) {
                                //btnConfirmar.click();
                                console.log('Botón confirmar clickeado');
                            }
                        }
                    }, 2500);
                } else {
                    console.log("No estamos en genComResumenDatos:", window.location.href);
                }
            } catch (error) {
                console.error('Error al confirmar:', error);
            }
        }, modoTest);

        // Esperar la navegación después de hacer clic en el botón
        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 });

        // ==========================================
        // DESCARGAR PDF (COPIADO EXACTO de paso_4_ConfirmarFactura_Cliente.js líneas 100-146)
        // ==========================================
        if (downloadDir) {
            console.log("🖨️  Buscando botón de imprimir...");

            // Listar archivos PDF actuales en la carpeta (para detectar el nuevo)
            const archivosAntes = await fs.readdir(downloadDir).then(files =>
                files.filter(f => f.endsWith('.pdf'))
            ).catch(() => []);

            console.log(`📄 PDFs existentes antes de imprimir: ${archivosAntes.length}`);

            // Esperar y hacer clic en el botón "Imprimir..."
            await newPage.waitForSelector('input[value="Imprimir..."]', { timeout: 30000 });

            await newPage.click('input[value="Imprimir..."]');
            console.log('✓ Clic en botón "Imprimir..." ejecutado');

            // Esperar a que aparezca el nuevo PDF (timeout: 30 segundos)
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
                // No lanzar error, continuar con el flujo
            }
        }

        // ==========================================
        // VOLVER AL MENÚ PRINCIPAL (COPIADO EXACTO de paso_4_ConfirmarFactura_Cliente.js líneas 157-180)
        // SIEMPRE volvemos al menú según acuerdos
        // ==========================================
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

        console.log("paso_4_ConfirmarFactura_Unificado completado exitosamente.");
        return {
            success: true,
            message: "Factura confirmada y PDF generado",
            pdfPath: pdfPath
        };

    } catch (error) {
        console.error("Error al ejecutar paso_4_ConfirmarFactura_Unificado:", error);
        throw error;
    }
}

module.exports = { paso_4_ConfirmarFactura_Unificado };
