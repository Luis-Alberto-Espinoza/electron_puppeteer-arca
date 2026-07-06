/**
 * Scraper de la pantalla "Elegí una persona para ingresar" del servicio
 * "Sistema Registral" (padron-puc-consulta-internet).
 *
 * ¿Por qué existe si ya está listarEmpresas()?
 *   - listarEmpresas() lee Comprobantes en Línea: SOLO muestra empresas dadas de alta
 *     en facturación (con punto de venta). Las que el CUIT representa pero no facturan
 *     NO aparecen ahí.
 *   - Sistema Registral muestra la lista COMPLETA (YO + "Mis representados"), tengan o
 *     no punto de venta. Es la fuente que garantiza no perdernos ninguna empresa.
 *
 * Cada persona es una tarjeta .persona-card con un <a href="...idPersona=<cuit>"> que
 * adentro tiene un div.razSoc (razón social). Tomamos el CUIT del idPersona del href
 * (11 dígitos, sin guiones) en vez de parsear el texto "CUIT 30-xxxxxxxx-x".
 */

/**
 * @param {import('puppeteer').Page} page  Pestaña ya posicionada en Sistema Registral.
 * @returns {Promise<Array<{cuit: string|null, razonSocial: string}>>}
 *          Lista completa de personas (YO + representados). [] si la pantalla no aparece.
 */
async function listarRepresentadosSistemaRegistral(page) {
    console.log('        [SistemaRegistral] ==> Listando personas/representados...');

    // Si el CUIT no tiene representados, Sistema Registral entra DIRECTO a la consulta
    // y la pantalla de selección nunca aparece. Eso NO es un error: es el caso normal
    // de un contribuyente que solo se representa a sí mismo (p.ej. un monotributista).
    // Por eso el timeout de este primer wait se trata como "sin representados" (info),
    // no como fallo, y se separa del try/catch que sí cubre errores reales de scraping.
    try {
        await page.waitForSelector('.persona-card a[href*="idPersona="]', { timeout: 12000 });
    } catch (_) {
        console.log('        [SistemaRegistral] <== 0 (no apareció la pantalla de selección: sin representados)');
        return [];
    }

    try {
        const personas = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('.persona-card a[href*="idPersona="]'));
            return cards.map(a => {
                const href = a.getAttribute('href') || '';
                const m = href.match(/idPersona=(\d+)/);
                const razSocEl = a.querySelector('.razSoc');
                return {
                    cuit: m ? m[1] : null,
                    razonSocial: razSocEl ? razSocEl.textContent.trim() : ''
                };
            }).filter(p => p.cuit || p.razonSocial);
        });

        console.log(`        [SistemaRegistral] <== ${personas.length} personas encontradas`);
        return personas;

    } catch (error) {
        console.error('        [SistemaRegistral] ERROR en listarRepresentadosSistemaRegistral:', error.message);
        return [];
    }
}

module.exports = { listarRepresentadosSistemaRegistral };
