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
 * Normaliza un nombre de empresa para comparar de forma tolerante entre SO.
 * - NFC: unifica la forma Unicode (Windows/Linux guardan tildes distinto: NFC vs NFD).
 * -   -> espacio: el "espacio duro" que .trim() no limpia.
 * - colapsa espacios repetidos y recorta extremos.
 */
function normalizarNombre(s) {
    return (s || '')
        .normalize('NFC')
        .replace(/ /g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Version "agresiva" para el fallback: ademas saca tildes y pasa a minusculas.
 * Solo se usa si la comparacion exacta normalizada no encontro nada.
 */
function normalizarFuerte(s) {
    return normalizarNombre(s)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // saca diacriticos (tildes, dieresis)
        .toLowerCase();
}

/**
 * Version "conjunto de palabras": normalizaFuerte + ordena las palabras alfabeticamente.
 * Sirve para el ultimo fallback cuando los MISMOS tokens vienen en distinto orden:
 * AFIP lista personas fisicas como "APELLIDO NOMBRE" y la app arma "Nombre Apellido".
 * "juan carlos salas" y "salas juan carlos" quedan iguales ("carlos juan salas").
 */
function normalizarTokens(s) {
    return normalizarFuerte(s)
        .split(' ')
        .filter(Boolean)
        .sort()
        .join(' ');
}

/**
 * Version "solo letras y numeros": normalizaFuerte sin espacios ni signos.
 * Para el ultimo fallback: la razon social cargada a mano o desde un Excel puede venir
 * como "El Papi Tu Tienda Express S.a.s." y AFIP la lista "EL PAPI TU TIENDA EXPRESS
 * S. A. S." (espacios entre las siglas). Ambas quedan "elpapitutiendaexpresssas".
 */
function normalizarAlfanumerico(s) {
    return normalizarFuerte(s).replace(/[^a-z0-9]/g, '');
}

/**
 * Busca el indice de la empresa en la lista, de la comparacion mas estricta a la mas
 * tolerante. Devuelve -1 si no hay match (o si el ultimo fallback es ambiguo).
 * Separada de seleccionarEmpresa para poder probarla sin navegador.
 * @param {string[]} nombresDom  nombres tal cual los muestra AFIP
 * @param {string} nombreEmpresa nombre buscado
 * @returns {{ indice: number, criterio: string|null }}
 */
function buscarIndiceEmpresa(nombresDom, nombreEmpresa) {
    const criterios = [
        ['exacto', normalizarNombre],
        ['sin tildes/mayusculas', normalizarFuerte],
        ['mismas palabras en otro orden (ej. APELLIDO NOMBRE)', normalizarTokens]
    ];
    for (const [criterio, fn] of criterios) {
        const objetivo = fn(nombreEmpresa);
        const indice = nombresDom.findIndex(n => fn(n) === objetivo);
        if (indice !== -1) return { indice, criterio };
    }

    // Ultimo fallback: solo letras y numeros. Al ser el mas laxo, si matchea MAS de una
    // empresa no elegimos ninguna: mejor un error claro que entrar a la empresa equivocada.
    const objetivo = normalizarAlfanumerico(nombreEmpresa);
    if (objetivo) {
        const coincidencias = nombresDom
            .map((n, i) => (normalizarAlfanumerico(n) === objetivo ? i : -1))
            .filter(i => i !== -1);
        if (coincidencias.length === 1) {
            return { indice: coincidencias[0], criterio: 'solo letras y numeros (ej. S.A.S. vs S. A. S.)' };
        }
    }
    return { indice: -1, criterio: null };
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

        console.log('        [empresasDisponibles] -> Leyendo nombres de la lista...');
        // 1) Extraer los nombres tal cual estan en el DOM (sin tocar nada).
        const nombresDom = await page.evaluate((selector) => {
            return Array.from(document.querySelectorAll(selector)).map(b => b.value || '');
        }, selectorBotones);

        // 2) Matchear en Node, donde podemos normalizar de forma tolerante
        //    (de la comparacion mas estricta a la mas laxa, ver buscarIndiceEmpresa).
        const { indice, criterio } = buscarIndiceEmpresa(nombresDom, nombreEmpresa);
        if (indice !== -1 && criterio !== 'exacto') {
            console.log(`        [empresasDisponibles] -> Match por fallback: ${criterio}.`);
        }

        if (indice === -1) {
            // Error con diagnostico: muestra que se buscaba y que habia, asi se ve en la UI sin consola.
            const disponibles = nombresDom.map(n => `"${n.trim()}"`).join(', ') || '(ninguna)';
            throw new Error(
                `Empresa "${nombreEmpresa}" no encontrada en la lista. ` +
                `Empresas disponibles: ${disponibles}`
            );
        }

        console.log(`        [empresasDisponibles] -> Match en indice ${indice}, haciendo clic...`);
        await page.evaluate((selector, i) => {
            const botones = document.querySelectorAll(selector);
            botones[i].scrollIntoView({ block: 'center' });
            botones[i].click();
        }, selectorBotones, indice);

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
    buscarIndiceEmpresa,
    // Lo exporta el barrido de empresas para decidir si la razon social guardada
    // difiere de la de AFIP con el MISMO criterio que usa el matcher de arriba.
    normalizarFuerte,
    // Aliases para compatibilidad temporal (deprecados)
    listarEmpresasDisponibles: listarEmpresas,
    elegirEmpresaDisponible: seleccionarEmpresa
};
