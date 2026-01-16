/**
 * Funciones para manejar la pagina de seleccion de empresas/representantes en AFIP
 *
 * Ambas funciones trabajan sobre la misma pagina: la pantalla donde aparecen
 * los botones .btn_empresa para seleccionar representante.
 */

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Extrae los nombres de todas las empresas disponibles en la pagina de seleccion.
 * NO realiza ninguna accion de clic.
 * @param {import('puppeteer').Page} page La pagina de Puppeteer que muestra la lista de empresas.
 * @returns {Promise<string[]>} Un array con los nombres de las empresas encontradas.
 */
async function listarEmpresas(page) {
    console.log('        [empresasDisponibles] ==> Listando empresas...');
    try {
        await wait(1000);

        const selectorBotones = '.btn_empresa';
        console.log(`        [empresasDisponibles] -> Esperando selector ${selectorBotones}`);
        await page.waitForSelector(selectorBotones, { timeout: 20000 });

        console.log('        [empresasDisponibles] -> Extrayendo nombres...');
        const nombresEmpresas = await page.evaluate((selector) => {
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

        console.log(`        [empresasDisponibles] <== ${nombresEmpresas.length} empresas encontradas`);
        return nombresEmpresas;

    } catch (error) {
        console.error("        [empresasDisponibles] ERROR en listarEmpresas:", error.message);
        return [];
    }
}

/**
 * Selecciona una empresa haciendo clic en el boton correspondiente.
 * @param {import('puppeteer').Page} page La pagina de Puppeteer que muestra la lista de empresas.
 * @param {string} nombreEmpresa El nombre exacto de la empresa a seleccionar.
 * @returns {Promise<import('puppeteer').Page>} La pagina despues de la navegacion.
 */
async function seleccionarEmpresa(page, nombreEmpresa) {
    console.log('        [empresasDisponibles] ==> Seleccionando empresa:', nombreEmpresa);
    try {
        await wait(1000);

        const selectorBotones = '.btn_empresa';
        console.log('        [empresasDisponibles] -> Esperando selector .btn_empresa');
        await page.waitForSelector(selectorBotones, { timeout: 20000 });

        console.log('        [empresasDisponibles] -> Buscando y haciendo clic...');
        const resultado = await page.evaluate((selector, nombreBuscado) => {
            const botones = document.querySelectorAll(selector);
            let encontrado = false;
            for (let i = 0; i < botones.length; i++) {
                const texto = botones[i].value?.trim();
                if (texto === nombreBuscado) {
                    botones[i].click();
                    encontrado = true;
                    break;
                }
            }
            return { encontrado };
        }, selectorBotones, nombreEmpresa);

        if (!resultado.encontrado) {
            throw new Error(`Empresa "${nombreEmpresa}" no encontrada en la lista`);
        }

        console.log('        [empresasDisponibles] -> Clic realizado, esperando navegacion...');
        // Esperar navegacion pero no fallar si no ocurre (algunas paginas no navegan)
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {
            console.log('        [empresasDisponibles] -> Navegacion completada o no requerida');
        });

        console.log('        [empresasDisponibles] <== Empresa seleccionada exitosamente');
        return page;

    } catch (error) {
        console.error("        [empresasDisponibles] ERROR en seleccionarEmpresa:", error.message);
        throw error;
    }
}

module.exports = {
    listarEmpresas,
    seleccionarEmpresa,
    // Aliases para compatibilidad temporal (deprecados)
    listarEmpresasDisponibles: listarEmpresas,
    elegirEmpresaDisponible: seleccionarEmpresa
};
