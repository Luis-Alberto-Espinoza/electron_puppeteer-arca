async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function seleccionarEmpresa(newPage, nombreEmpresa) {
    try {
        // Esperar a que la nueva página esté lista
        try {
            await Promise.race([
                newPage.waitForSelector('body'), // Esperar a que al menos el body esté disponible
                wait(1000) // Timeout de seguridad
            ]);
        } catch (error) {
            console.log('Timeout esperando la carga inicial de la página');
        }

        // Dar un tiempo adicional para que la página termine de cargar
        await wait(1000);

        let empresaAElegir = '.btn_empresa'; // selector de clase

        await newPage.waitForSelector(empresaAElegir, { timeout: 20000 });

        // Usar evaluate() para hacer click y recolectar textos
        const textoBotones = await newPage.evaluate((selector, nombreEmpresa) => {
            const botones = document.querySelectorAll(selector);
            let textoBotones = [];
            let botonElegido = null;
            for (let i = 0; i < botones.length; i++) {
                const texto = botones[i].value?.trim();
                textoBotones.push(texto);
                if (texto === nombreEmpresa) {
                    botonElegido = botones[i];
                    break;
                }
            }
            if (botonElegido) {
                botonElegido.click();
            }
            return textoBotones;
        }, empresaAElegir, nombreEmpresa);

        return [newPage, textoBotones];
    } catch (error) {
        console.error("Error en seleccionarEmpresa:", error);
        throw error;
    }
}

module.exports = { seleccionarEmpresa };