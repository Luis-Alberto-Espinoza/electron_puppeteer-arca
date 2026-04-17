async function menuPrincipal(newPage, datos) {
    try {
        await newPage.goto(newPage.url(), { waitUntil: 'networkidle2' }); // Espera a que la página cargue

        // Esperar a que el botón esté presente y visible antes de hacer clic
        if (datos.botonId) {
            const selector = `#${datos.botonId}`;
            await newPage.waitForSelector(selector, { visible: true, timeout: 30000 });
        }

        // Ejecuta el script original dentro de la página
        await newPage.evaluate((datos) => {
            if (window.location.href.includes('menu_ppal')) {
                let boton = null;
                if (datos.botonId) {
                    boton = document.getElementById(datos.botonId);
                }
                if (boton) {
                    boton.click();
                } else {
                    throw new Error(`No se encontró el botón con id: ${datos.botonId}`);
                }
            }
        }, datos);

        // Espera a que la acción se complete (opcional, pero recomendable)
        await newPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }); // Aumenta el tiempo de espera a 120000 ms


        console.log("Script _MENU PRINCIPAL_ ejecutado correctamente.");
        return { success: true, message: "Comprobante generado correctamente" };
    } catch (error) {
        console.error("Error al ejecutar el script:", error);
        throw error;
    }
}

module.exports = { menuPrincipal };
