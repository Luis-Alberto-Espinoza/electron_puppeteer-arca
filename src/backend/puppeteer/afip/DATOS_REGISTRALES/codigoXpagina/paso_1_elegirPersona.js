// Paso 1 — Sistema Registral: entrar como la persona pedida.
//
// Al abrir Sistema Registral pasan dos cosas según el CUIT logueado:
//   - Representa a alguien  → pantalla "Elegí una persona para ingresar" (tarjetas
//     .persona-card con <a href="...idPersona=<cuit>">, YO + representados).
//   - No representa a nadie → entra DIRECTO a la persona logueada (no hay tarjetas).
// Elegimos por el idPersona del href, no por el texto: es exacto y no depende de
// cómo AFIP escriba la razón social.

const TIMEOUT_PANTALLA = 30000;

/**
 * @param {import('puppeteer').Page} page  Pestaña de Sistema Registral recién abierta.
 * @param {string} cuit                    CUIT de la persona a consultar (11 dígitos).
 * @throws si el CUIT no figura entre las personas o la página no carga.
 */
async function elegirPersona(page, cuit) {
    console.log(`        [DatosRegistrales] Paso 1: elegir persona ${cuit}...`);

    // Esperar a que aparezca alguna de las dos pantallas posibles.
    const pantalla = await Promise.race([
        page.waitForSelector('.persona-card a[href*="idPersona="]', { timeout: TIMEOUT_PANTALLA }).then(() => 'seleccion'),
        page.waitForSelector('#iconte', { timeout: TIMEOUT_PANTALLA }).then(() => 'directo')
    ]).catch(() => null);

    if (!pantalla) {
        throw new Error('Sistema Registral no cargó (no apareció la selección de persona ni el contenido).');
    }

    if (pantalla === 'seleccion') {
        const tarjeta = await page.$(`.persona-card a[href*="idPersona=${cuit}"]`);
        if (!tarjeta) {
            throw new Error(`El CUIT ${cuit} no figura entre las personas que puede representar este login en Sistema Registral.`);
        }
        await tarjeta.evaluate(a => a.click());
        await page.waitForSelector('#iconte', { timeout: TIMEOUT_PANTALLA });
    }

    // En los dos casos, la URL dice con quién quedamos trabajando.
    const m = page.url().match(/idPersona=(\d+)/);
    if (m && m[1] !== String(cuit)) {
        throw new Error(`Sistema Registral entró con el CUIT ${m[1]} y no con ${cuit} (este login no lo representa).`);
    }
    console.log(`        [DatosRegistrales] <== trabajando con ${cuit}`);
}

module.exports = { elegirPersona };
