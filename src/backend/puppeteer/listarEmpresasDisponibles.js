async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * En la página de selección de representante de AFIP, extrae los nombres de todas las empresas disponibles.
 * No realiza ninguna acción de clic.
 * @param {import('puppeteer').Page} newPage La página de Puppeteer que muestra la lista de empresas.
 * @returns {Promise<string[]>} Un array con los nombres de las empresas encontradas.
 */
async function listarEmpresasDisponibles(newPage) {
    console.log('        [SUBFLUJO] ==> Entrando a listarEmpresasDisponibles');
    try {
        await wait(1000); // Espera prudencial para que todo cargue

        const selectorBotones = '.btn_empresa';
        console.log(`        [SUBFLUJO] -> Esperando por selector ${selectorBotones}`);
        await newPage.waitForSelector(selectorBotones, { timeout: 20000 });

        console.log('        [SUBFLUJO] -> Evaluando página para extraer nombres...');
        const nombresEmpresas = await newPage.evaluate((selector) => {
            const botones = document.querySelectorAll(selector);
            const nombres = [];
            for (let i = 0; i < botones.length; i++) {
                const texto = botones[i].value?.trim();
                if (texto) {
                    nombres.push(texto);
                }
            }
            return nombres;
        }, selectorBotones);

        console.log('        [SUBFLUJO] <== Saliendo de listarEmpresasDisponibles con éxito.');
        return nombresEmpresas;

    } catch (error) {
        console.error("        [SUBFLUJO] ERROR en listarEmpresasDisponibles:", error.message);
        // Si falla, devolvemos un array vacío para no romper el flujo principal
        return []; 
    }
}

module.exports = { listarEmpresasDisponibles };
