async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function elegirPuntoDeVenta(newPage) {
    try {
        // Esperar a que la nueva página esté lista
        try {
            await Promise.race([
                newPage.waitForSelector('body'), // Esperar a que al menos el body esté disponible
                wait(5000) // Timeout de seguridad
            ]);
        } catch (error) {
            console.log('Timeout esperando la carga inicial de la página');
        }

        // Dar un tiempo adicional para que la página termine de cargar
        await wait(2000);

        console.log('Nueva página lista para interactuar');

        // Trabajar con la nueva pestaña
        await newPage.screenshot({ path: 'nueva_pestana.png' });

        // Debug y selección de empresa en la nueva pestaña
        console.log("seleccionando empresa");
        let empresaAElegir = 'input[value="EL PAPI TU TIENDA EXPRESS S. A. S."]';

        await newPage.evaluate(() => {
            console.log("Contenido de la nueva pestaña:");
            console.log(document.title);
            console.log(document.body.innerHTML);
        });

        await newPage.waitForSelector(empresaAElegir, { timeout: 20000 });
        console.log("el nombre de la empresa es_ ", empresaAElegir);
        await newPage.click(empresaAElegir);

        // Esperar un tiempo adicional después del clic
        await wait(2000);

        return newPage; // Devuelve la página después de seleccionar la empresa
    } catch (error) {
        console.error("Error en elegirPuntoDeVenta:", error);
        throw error;
    }
}

module.exports = { elegirPuntoDeVenta };