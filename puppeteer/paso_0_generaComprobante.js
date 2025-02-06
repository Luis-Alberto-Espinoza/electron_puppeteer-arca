async function paso_0_generaComprobante(newPage) {
    try {
        await newPage.goto(newPage.url(), { waitUntil: 'networkidle2' }); // Espera a que la página cargue

        // Ejecuta el script original dentro de la página
        await newPage.evaluate(() => {
            if (window.location.href.includes('menu_ppal')) {
                let generarComprobantes = document.getElementById("btn_gen_cmp");
                if (generarComprobantes) { // Verifica si el elemento existe
                    generarComprobantes.click();
                } else {
                    console.error("No se encontró el botón 'btn_gen_cmp'");
                }
            }
        });

        // Espera a que la acción se complete (opcional, pero recomendable)
        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

        console.log("Script ejecutado correctamente.");
        return { success: true, message: "Comprobante generado correctamente" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { paso_0_generaComprobante };
