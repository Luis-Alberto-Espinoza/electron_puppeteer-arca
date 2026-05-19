/**
 * Flujo Puppeteer: descubrir los puntos de venta DETALLADOS de una empresa
 * vía el ABM de AFIP (/pvel/jsp/abmPuntosVenta.do).
 *
 * A diferencia de `flujo_descubrirPuntosDeVenta.js` (que va a "Comprobantes
 * en Línea" y lee un <select>), este flujo va al ABM oficial y extrae la
 * tabla #tblmiGrilla, que incluye número, sistema (RECE / Factura en Línea /
 * etc.), domicilio y si está activo.
 *
 * Secuencia esperada de URLs:
 *   1. fes.afip.gob.ar/pvel/jsp/index_bis.jsp       (lista empresas .btn_empresa)
 *   2. fes.afip.gob.ar/pvel/jsp/mostrarMenu.do      (menú con A/B/M PDV)
 *   3. fes.afip.gob.ar/pvel/jsp/abmPuntosVenta.do   (tabla #tblmiGrilla)
 *
 * @param {import('puppeteer').Page} page - página ya logueada
 * @param {string} razonSocial             - empresa cuyos pdv queremos descubrir
 * @returns {Promise<Array<{numero:string, sistema:string|null, domicilio:string|null, activo:boolean|null}>>}
 */

const { buscarEnAfip }              = require('../archivosComunes/buscadorAfip.js');
const { seleccionarEmpresa }        = require('../archivosComunes/empresasDisponibles.js');

const URLS = {
    listaEmpresas: 'fes.afip.gob.ar/pvel/jsp/index_bis.jsp',
    menu:          'fes.afip.gob.ar/pvel/jsp/mostrarMenu.do',
    abm:           'fes.afip.gob.ar/pvel/jsp/abmPuntosVenta.do'
};

const TEXTO_BUSCADOR = 'Administración de puntos de venta y domicilios';
const URL_ABM_DESTINO = 'https://fes.afip.gob.ar/pvel/jsp/index_bis.jsp';

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

function verificarUrl(page, fragmento, etapa) {
    const url = page.url();
    if (!url.includes(fragmento)) {
        throw new Error(`[ABM PDV] Checkpoint "${etapa}" falló. Esperaba URL con "${fragmento}", actual: ${url}`);
    }
    console.log(`  ✅ [ABM PDV] Checkpoint "${etapa}" OK: ${url}`);
}

/**
 * Abre "Administración de PDV" pasando por el buscador AFIP (la única forma
 * que AFIP acepta: navegar directo por URL devuelve "sesión expirada").
 *
 * Según el cliente, AFIP redirige a una de tres URLs:
 *   - index_bis.jsp     → cliente con varias empresas (botones .btn_empresa)
 *   - mostrarMenu.do    → cliente con UNA sola empresa (AFIP la auto-seleccionó)
 *   - abmPuntosVenta.do → AFIP saltó hasta acá directo (raro pero posible)
 *
 * Si el cliente no tiene ese módulo en su buscador (clientes monotributistas /
 * personas físicas), `buscarEnAfip` falla → el manager lo captura y cae al
 * fallback de Comprobantes en Línea.
 *
 * @returns {Promise<{page: import('puppeteer').Page, modo: 'lista'|'menu'|'abm'}>}
 */
async function abrirAbmPuntosVenta(page) {
    console.log(`  → [ABM PDV] Buscando "${TEXTO_BUSCADOR}"...`);
    const newPage = await buscarEnAfip(page, TEXTO_BUSCADOR, {
        esperarNuevaPestana: true,
        textoEsperadoEnResultado: 'Administración de puntos de venta'
    });
    await esperar(800);

    const url = newPage.url();
    console.log(`  → [ABM PDV] URL después del click: ${url}`);

    let modo;
    if (url.includes(URLS.listaEmpresas))      modo = 'lista';
    else if (url.includes(URLS.menu))          modo = 'menu';
    else if (url.includes(URLS.abm))           modo = 'abm';
    else throw new Error(`URL inesperada después de abrir Administración de PDV: ${url}`);

    console.log(`  ✅ [ABM PDV] Modo detectado: "${modo}"`);
    return { page: newPage, modo };
}

/**
 * Click en el <a id="btn_abm_pto_vta"> que lleva al ABM.
 *
 * Importante: clickear desde `page.evaluate(() => el.click())` no funciona en
 * el portal AFIP (los handlers solo reaccionan a clicks "trusted" del mouse).
 * Usamos `handle.click()` que dispara el mouse real de Puppeteer.
 *
 * Después validamos que la URL haya cambiado a abmPuntosVenta.do — si no
 * cambió, el click se perdió y tiramos error claro en vez de seguir hasta
 * timeout del selector de la tabla.
 */
async function clickAbmPuntosDeVentaEmision(page) {
    const SELECTOR = '#btn_abm_pto_vta';

    // Buscar en el frame principal primero, después en sub-frames.
    let frame = null;
    for (const f of page.frames()) {
        try {
            const h = await f.$(SELECTOR);
            if (h) { frame = f; break; }
        } catch (_) { /* frame detached */ }
    }

    if (!frame) {
        const diag = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a[id], button[id]'))
                .map(el => `${el.tagName}#${el.id}: "${(el.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 80)}"`)
                .slice(0, 30);
        }).catch(() => []);
        console.log('  ❌ [ABM PDV] Elementos con id en la página:');
        diag.forEach(s => console.log(`     · ${s}`));
        throw new Error(`No se encontró ${SELECTOR} en ningún frame de la página`);
    }

    const handle = await frame.$(SELECTOR);
    const urlAntes = page.url();

    try { await handle.scrollIntoView(); } catch (_) {}
    await handle.click();
    console.log(`  → [ABM PDV] Click real disparado en ${SELECTOR}.`);

    // Esperar que efectivamente naveguemos a abmPuntosVenta.do
    try {
        await page.waitForFunction(
            (prev) => window.location.href !== prev && window.location.href.includes('abmPuntosVenta.do'),
            { timeout: 15000 },
            urlAntes
        );
        console.log(`  ✅ [ABM PDV] Navegó a: ${page.url()}`);
    } catch (_) {
        throw new Error(`Click en ${SELECTOR} no produjo navegación a abmPuntosVenta.do. URL actual: ${page.url()}`);
    }
    await esperar(800);
}

/**
 * Cierra el popup de advertencias si aparece (no siempre aparece).
 */
async function cerrarPopupAdvertencias(page) {
    try {
        await page.waitForSelector('#dlgAdvertencias_btn_Cerrar', { visible: true, timeout: 4000 });
        await page.click('#dlgAdvertencias_btn_Cerrar');
        await esperar(600);
        console.log('  → [ABM PDV] Popup de advertencias cerrado.');
    } catch (_) {
        console.log('  → [ABM PDV] No apareció popup de advertencias (ok).');
    }
}

/**
 * Lee la tabla #tblmiGrilla del ABM y devuelve un array de PDV.
 *
 * Estructura de cada fila (8 celdas .gridDataCell):
 *   [0] número secuencial de fila (NO es el PDV; ignorar)
 *   [1] nombre fantasía
 *   [2] sistema (ej "RECE para aplicativo y web services" / "Factura en Linea ...")
 *   [3] (vacío)
 *   [4] domicilio (contiene el número real del PDV, ej "... - 0001 - SEVERO...")
 *   [5][6] (vacíos)
 *   [7] <img src="check.png"> si activo, vacío si no
 *
 * Una empresa puede tener varias filas con el MISMO número de PDV pero distinto
 * sistema (ej. el PDV 0001 habilitado para RECE y para Factura en Línea son
 * dos filas distintas). Devolvemos una entrada por fila.
 */
async function leerTablaPuntosDeVenta(page) {
    return await page.evaluate(() => {
        const tbody = document.querySelector('#tblmiGrilla tbody');
        if (!tbody) return [];
        const filas = Array.from(tbody.querySelectorAll('tr'));
        const limpiar = (s) => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

        return filas.map(tr => {
            const tds = Array.from(tr.querySelectorAll('td.gridDataCell'));
            const sistema   = tds[2] ? limpiar(tds[2].textContent) : null;
            const domicilio = tds[4] ? limpiar(tds[4].textContent) : null;
            // Numero real del PDV: embebido en el domicilio como " - NNNN - ".
            // Si no parsea, caemos al campo secuencial td[0] (peor caso, lo marcamos).
            let numero = null;
            if (domicilio) {
                const m = domicilio.match(/-\s*(\d{3,5})\s*-/);
                if (m) numero = m[1];
            }
            if (!numero && tds[0]) {
                numero = limpiar(tds[0].textContent);
            }
            const activo = tds[7] ? !!tds[7].querySelector('img') : null;
            return {
                numero: numero || null,
                sistema: sistema || null,
                domicilio: domicilio || null,
                activo
            };
        }).filter(p => p.numero);
    });
}

/**
 * Procesa UNA empresa estando ya parado en la lista de empresas (index_bis.jsp).
 * Selecciona la empresa, abre el ABM, lee la tabla y devuelve los PDV.
 * @param {import('puppeteer').Page} pageLista  página en index_bis.jsp
 * @param {string} razonSocial
 * @returns {Promise<Array<{numero:string, sistema:string|null, domicilio:string|null, activo:boolean|null}>>}
 */
async function procesarEmpresaEnAbm(pageLista, razonSocial) {
    console.log(`🔵 [ABM PDV] Procesando empresa "${razonSocial}"...`);

    const pageEmpresa = await seleccionarEmpresa(pageLista, razonSocial);
    await esperar(800);
    verificarUrl(pageEmpresa, URLS.menu, 'menú post-empresa');

    console.log('  → [ABM PDV] Click "A/B/M de puntos de venta / emisión"...');
    await clickAbmPuntosDeVentaEmision(pageEmpresa);

    console.log('  → [ABM PDV] Cerrar popup de advertencias (si aparece)...');
    await cerrarPopupAdvertencias(pageEmpresa);

    console.log('  → [ABM PDV] Esperar tabla y validar URL...');
    await pageEmpresa.waitForSelector('#tblmiGrilla', { timeout: 15000 });
    verificarUrl(pageEmpresa, URLS.abm, 'ABM puntos de venta');

    const pdvs = await leerTablaPuntosDeVenta(pageEmpresa);
    console.log(`  ✅ [ABM PDV] ${pdvs.length} PDV leídos de "${razonSocial}".`);
    return pdvs;
}

/**
 * Procesa el caso "empresa única" donde AFIP saltea la pantalla de selección.
 * Asume que la página YA está en mostrarMenu.do o abmPuntosVenta.do.
 * Si está en menú, hace el click al ABM antes de leer la tabla.
 *
 * @param {import('puppeteer').Page} page
 * @param {'menu'|'abm'} modoActual
 */
async function procesarEnAbmSinSelector(page, modoActual) {
    if (modoActual === 'menu') {
        console.log('  → [ABM PDV] (empresa única) Click "A/B/M de puntos de venta / emisión"...');
        await clickAbmPuntosDeVentaEmision(page);
    }
    console.log('  → [ABM PDV] (empresa única) Cerrar popup de advertencias (si aparece)...');
    await cerrarPopupAdvertencias(page);
    console.log('  → [ABM PDV] (empresa única) Esperar tabla y validar URL...');
    await page.waitForSelector('#tblmiGrilla', { timeout: 15000 });
    verificarUrl(page, URLS.abm, 'ABM puntos de venta (empresa única)');
    const pdvs = await leerTablaPuntosDeVenta(page);
    console.log(`  ✅ [ABM PDV] (empresa única) ${pdvs.length} PDV leídos.`);
    return pdvs;
}

/**
 * Vuelve a la pantalla de Administración de PDV (lista de empresas) para procesar
 * la siguiente. Usa goBack() para respetar la sesión AFIP (las URLs directas las
 * rechaza como "sesión expirada"). Si el goBack no devuelve a index_bis, intenta
 * uno más por las dudas.
 */
async function volverAListaEmpresas(page) {
    console.log('  → [ABM PDV] Volviendo a lista de empresas (goBack)...');
    await page.goBack({ waitUntil: 'networkidle2', timeout: 30000 });
    await esperar(800);
    if (!page.url().includes(URLS.listaEmpresas)) {
        console.log('  → [ABM PDV] goBack no me dejó en la lista, intento otro goBack...');
        await page.goBack({ waitUntil: 'networkidle2', timeout: 30000 });
        await esperar(800);
    }
    verificarUrl(page, URLS.listaEmpresas, 'volver a lista empresas');
}

/**
 * Entry point para procesar UNA sola empresa desde una página logueada.
 * Combina abrirAbmPuntosVenta + procesarEmpresaEnAbm (o sinSelector según modo).
 */
async function ejecutarFlujoAbmPuntosDeVenta(page, razonSocial) {
    console.log(`🔵 [Flujo ABM PDV] Iniciando para empresa: ${razonSocial}`);
    const { page: pageLista, modo } = await abrirAbmPuntosVenta(page);
    if (modo === 'lista') {
        return await procesarEmpresaEnAbm(pageLista, razonSocial);
    }
    return await procesarEnAbmSinSelector(pageLista, modo);
}

module.exports = {
    ejecutarFlujoAbmPuntosDeVenta,
    abrirAbmPuntosVenta,
    procesarEmpresaEnAbm,
    procesarEnAbmSinSelector,
    volverAListaEmpresas
};
