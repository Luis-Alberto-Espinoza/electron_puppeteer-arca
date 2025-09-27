async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function seleccionarEmpresa(newPage, nombreEmpresa) {
    console.log('        [SUBFLUJO] ==> Entrando a seleccionarEmpresa');
    try {
        // Esperar a que la nueva página esté lista
        try {
            await Promise.race([
                newPage.waitForSelector('body'), // Esperar a que al menos el body esté disponible
                wait(1000) // Timeout de seguridad
            ]);
        } catch (error) {
            console.log('        [SUBFLUJO] Timeout esperando la carga inicial de la página');
        }

        // Dar un tiempo adicional para que la página termine de cargar
        await wait(1000);

        let empresaAElegir = '.btn_empresa'; // selector de clase

        console.log('        [SUBFLUJO] -> Esperando por selector .btn_empresa');
        await newPage.waitForSelector(empresaAElegir, { timeout: 20000 });

        // Usar evaluate() para hacer click y recolectar textos
        console.log('        [SUBFLUJO] -> Evaluando página para hacer clic...');
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

        // Esperar explícitamente a que la navegación (causada por el clic de adentro) termine
        console.log('        [SUBFLUJO] -> Clic realizado, esperando navegación...');
        // await newPage.waitForNavigation({ waitUntil: 'networkidle2' }); // Eliminado: Causa timeout si el clic no navega.
        console.log('        [SUBFLUJO] -> Navegación completada.');

        console.log('        [SUBFLUJO] <== Saliendo de seleccionarEmpresa con éxito.');
        return [newPage, textoBotones];
    } catch (error) {
        console.error("        [SUBFLUJO] ERROR en seleccionarEmpresa:", error.message);
        throw error;
    }
}

module.exports = { seleccionarEmpresa };