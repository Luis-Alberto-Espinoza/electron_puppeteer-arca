// Paso 2 — Consulta → "Datos registrales" → INGRESAR.
//
// Todo el contenido de Sistema Registral vive en un iframe (#iconte, name="contenido").
// Dentro: menú lateral con "Consulta" (data-section="sec02") que muestra las tarjetas.
// La de "Datos registrales" tiene onclick="DoPost();" (ojo: hay otras dos parecidas,
// DoPostRut y DoPostImpoExpo). DoPost envía un form con target="contenido", o sea que
// el MISMO iframe navega a la app Vaadin listasabana-web.
//
// Ojo Puppeteer: el iframe cambia de documento varias veces (vacío → contenido →
// Vaadin). Los ElementHandle viejos quedan inválidos ("does not belong to the
// document", "same JavaScript world"). Por eso NO guardamos handles: en cada vuelta
// se busca el frame por URL y se actúa con selectores dentro de frame.evaluate.

const TIMEOUT_FRAME = 30000;
const ES_CONTENIDO = url => url.includes('ContenidoInternetAction');
const ES_VAADIN = url => url.includes('listasabana-web/home');

/**
 * Repite `accion(frame)` sobre el frame que cumpla `esFrame(url)` hasta que devuelva
 * algo truthy. Los errores de frame en transición se toman como "todavía no".
 */
async function esperarEnFrame(page, esFrame, accion, timeout, queEspera) {
    const limite = Date.now() + timeout;
    while (Date.now() < limite) {
        const frame = page.frames().find(f => !f.detached && esFrame(f.url()));
        if (frame) {
            try {
                const r = await accion(frame);
                if (r) return { frame, valor: r };
            } catch (_) { /* frame cambiando de documento: reintentar */ }
        }
        await new Promise(r => setTimeout(r, 400));
    }
    throw new Error(`Sistema Registral: no apareció ${queEspera}.`);
}

// Click por DOM en el elemento (devuelve true si estaba y clickeó). No exige que se
// vea: con el iframe angosto Bootstrap colapsa el menú lateral (.navbar-collapse) y
// el link "Consulta" queda oculto, pero su click igual dispara el JS de la página.
function clickDom(frame, selector) {
    return frame.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.click();
        return true;
    }, selector);
}

/**
 * @param {import('puppeteer').Page} page  Pestaña de Sistema Registral, ya con la persona elegida.
 * @returns {Promise<import('puppeteer').Frame>} Frame de la app Vaadin (listasabana-web).
 */
async function abrirDatosRegistrales(page) {
    console.log('        [DatosRegistrales] Paso 2: Consulta → Datos registrales...');

    // 2.1 Menú "Consulta"
    await esperarEnFrame(page, ES_CONTENIDO, f => clickDom(f, 'a[data-section="sec02"]'),
        TIMEOUT_FRAME, 'el menú "Consulta"');

    // 2.2 Tarjeta "Datos registrales" → INGRESAR
    await esperarEnFrame(page, ES_CONTENIDO, f => clickDom(f, 'a[onclick="DoPost();"]'),
        TIMEOUT_FRAME, 'el botón INGRESAR de "Datos registrales"');

    // 2.3 El iframe pasa a la app Vaadin
    const { frame } = await esperarEnFrame(page, ES_VAADIN, () => true,
        TIMEOUT_FRAME, 'la consulta de Datos registrales (listasabana-web)');
    console.log('        [DatosRegistrales] <== consulta abierta');
    return frame;
}

module.exports = { abrirDatosRegistrales, esperarEnFrame, ES_VAADIN };
