const path = require('path');
const { fork } = require('child_process');
const fs = require('fs').promises;
const os = require('os');

async function paso_1_DatosDeEmision_Servicio(newPage, datos, factura, modoTest = false) {
    try {
        await newPage.evaluate((datos, factura, modoTest) => {
            try {
                if (window.location.href.includes('genComDatosEmisor') && datos.tipoActividad === 'Servicio') {

                    let referencia = document.querySelector("#refComEmisor");
                    let inputFechas = document.querySelector("#fc");
                    let itemElegido = 3;

                    inputFechas.value = datos.fechaComprobante;

                    let conceptoAincluir = document.querySelector("#idconcepto");
                    conceptoAincluir.value = itemElegido;

                    setTimeout(() => {
                        conceptoAincluir.onchange();

                        setTimeout(() => {
                        }, 50); // 50ms de espera

                    }, 100); // 100ms de espera
                    const desde = document.querySelector("#fsd");
                    const hasta = document.querySelector("#fsh");
                    const vto = document.querySelector("#vencimientopago");

                    desde.value = datos.fechaDesde || factura[0];
                    hasta.value = datos.fechaHasta || factura[0];
                    vto.value = datos.fechaVtoPago || datos.fechaComprobante;

                    referencia.value = "";
                    let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");

                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datos.tipoActividad:", datos.tipoActividad);
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, datos, factura, modoTest);

        // Espera a que se completen los timeouts del formulario
        await new Promise(resolve => setTimeout(resolve, 200));

        if (modoTest) {
            // Usa el directorio temporal del sistema
            const screenshotsDir = os.tmpdir();
            const screenshotPath = path.join(screenshotsDir, 'paso1_servicio.png');
            await newPage.screenshot({ path: screenshotPath });
            console.log('Captura guardada en:', screenshotPath);

            // Verifica que el archivo existe antes de intentar abrirlo
            if (await fs.access(screenshotPath).then(() => true).catch(() => false)) {
                const visorProcess = fork(path.join(__dirname, '../../../../../archivos_comunes/visorImagen.js'));
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
        }

        // Esperar la navegación después de hacer clic en el botón
        await Promise.all([
            newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }), // Espera la navegación
            newPage.evaluate(() => {
                // Intentar múltiples selectores para encontrar el botón "Continuar"
                let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)") ||
                    document.querySelector('input[type="button"][value*="Continuar"]') ||
                    document.querySelector('input[type="button"][onclick*="confirmarDatos"]') ||
                    document.querySelectorAll('#contenido > form > input[type="button"]')[0];

                if (!btnContinuar) {
                    throw new Error('No se encontró el botón Continuar');
                }

                btnContinuar.click(); // Haz clic en el botón
            })
        ]);

        console.log("Script _1_Servicio_ ejecutado correctamente.");
        return { success: true, message: "Datos de emisión (servicio) completados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_1_DatosDeEmision_Servicio };