const fecha = require('./utils.js');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

async function paso_1_DatosDeEmision_Productos(newPage, datos, factura, modoTest) {

    try {
        await newPage.evaluate((datos, modoTest) => {
            try {
                if (window.location.href.includes('genComDatosEmisor') && datos.tipoActividad === 'Producto') {

                    let inputFechas = document.querySelector("#fc");

                    inputFechas.value = datos.fechaComprobante;
                    // inputFechas.value = ultimaFecha;

                    let conceptoAincluir = document.querySelector("#idconcepto");
                    conceptoAincluir.children[1].selected = true;

                } else {
                    console.log("Condiciones no cumplidas: window.location.href:", window.location.href, "datosDeEmision:", datos.datosDeEmision);
                }
            } catch (error) {
                console.error("Error dentro de evaluate:", error);
            }
        }, datos, modoTest);

        if (modoTest) {
            
            // Crear el directorio screenshots si no existe
            const baseruta = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(baseruta)) {
                fs.mkdirSync(baseruta, { recursive: true });
            }

            // Eliminar la primera captura que está suelta
            // await newPage.screenshot({ path: `paso1_producto.png` });

            // Guardar la captura en el directorio screenshots
            const screenshotPath = path.join(baseruta, 'paso1_producto.png');
            await newPage.screenshot({ path: screenshotPath });

            // Verificar que el archivo existe antes de intentar abrirlo
            if (fs.existsSync(screenshotPath)) {
                const visorProcess = fork(path.join(__dirname, 'visorImagen.js'));
                
                visorProcess.on('error', (err) => {
                    console.error('Error en el proceso visor:', err);
                });
                
                visorProcess.on('exit', (code) => {
                    console.log('Proceso visor terminó con código:', code);
                });

                visorProcess.send({ screenshotPath });
            } else {
                console.error('Error: No se pudo crear el archivo de captura');
            }
        }

        // Esperar la navegación después de hacer clic en el botón
        await Promise.all([
            newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }), // Espera la navegación
            newPage.evaluate(() => {
                let btnContinuar = document.querySelector("#contenido > form > input[type=button]:nth-child(4)");
                btnContinuar.click(); // Haz clic en el botón
            })
        ]);

        console.log("Script _1_Producto_ ejecutado correctamente.");
        return { success: true, message: "Datos de emisión (producto) completados" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_1_DatosDeEmision_Productos };