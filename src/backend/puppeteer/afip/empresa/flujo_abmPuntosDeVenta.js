/**
 * Flujo Puppeteer: descubrir los puntos de venta DETALLADOS de una empresa
 * vía el ABM de AFIP (/pvel/jsp/abmPuntosVenta.do).
 *
 * A diferencia de `flujo_descubrirPuntosDeVenta.js` (que va a "Comprobantes
 * en Línea" y lee un <select>), este flujo va al ABM oficial y extrae la
 * tabla #tblmiGrilla, que incluye número, sistema, domicilio y "Usado".
 *
 * Sólo nos quedamos con los PDV "operables" para la app:
 *   sistema === "Factura en Linea - Responsable Inscripto" && activo === true
 * El resto se descarta (no podemos emitir desde ahí — guardarlos sería ruido).
 *
 * La tabla puede tener varias páginas. Iteramos con #tblmiGrilla_btn_next
 * hasta que el botón quede deshabilitado / oculto.
 *
 * Secuencia esperada de URLs:
 *   1. fes.afip.gob.ar/pvel/jsp/index_bis.jsp       (lista empresas .btn_empresa)
 *   2. fes.afip.gob.ar/pvel/jsp/mostrarMenu.do      (menú con A/B/M PDV)
 *   3. fes.afip.gob.ar/pvel/jsp/abmPuntosVenta.do   (tabla #tblmiGrilla)
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

// Sistema operable. Comparamos normalizado (case-insensitive + colapso de
// espacios) para tolerar diferencias sutiles entre lo que renderiza AFIP y
// nuestro literal.
const SISTEMA_OPERABLE = 'Factura en Linea - Responsable Inscripto';

function normalizarSistema(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Una fila es "operable" si:
 *   - sistema (normalizado) coincide con SISTEMA_OPERABLE, Y
 *   - activo === true (la columna "Usado" tiene el check.png).
 */
function esOperable(pdv) {
    return normalizarSistema(pdv.sistema) === normalizarSistema(SISTEMA_OPERABLE)
        && pdv.activo === true;
}

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
 * Lee SOLO las filas de la página actual del ABM (sin avanzar paginación).
 * Estructura de cada fila (8 celdas .gridDataCell):
 *   [0] número secuencial de fila (NO es el PDV)
 *   [1] nombre fantasía
 *   [2] sistema (ej "RECE..." / "Factura en Linea - Responsable Inscripto")
 *   [3] (vacío)
 *   [4] domicilio ("LOCALES Y ESTABLECIMIENTOS - 0001 - SEVERO...")
 *   [5][6] (vacíos)
 *   [7] <img src="check.png"> si "Usado", vacío si no
 */
async function leerFilasDePaginaActual(page) {
    return await page.evaluate(() => {
        // La tabla #tblmiGrilla tiene tablas anidadas. querySelectorAll('tr')
        // agarra TODOS los <tr> descendientes (wrappers + reales) y los wrappers
        // heredan el textContent del <tr> de datos que envuelven, produciendo
        // filas duplicadas. Los <tr> de datos REALES tienen id `tblmiGrilla_tr_N`.
        const filas = Array.from(document.querySelectorAll('#tblmiGrilla tr[id^="tblmiGrilla_tr_"]'));
        if (filas.length === 0) return [];
        // limpiar: convierte NBSP a espacio normal y colapsa whitespace
        const limpiar = (s) => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

        return filas.map(tr => {
            const tds = Array.from(tr.querySelectorAll('td.gridDataCell'));
            // td[0] es la columna "Número" del header AFIP (1, 2, 3, …).
            // Lo normalizamos a 5 dígitos (1 → "00001") para alinear con el
            // resto de la app.
            const numeroRaw = tds[0] ? limpiar(tds[0].textContent) : null;
            const numero = (numeroRaw && /^\d+$/.test(numeroRaw))
                ? numeroRaw.padStart(5, '0')
                : null;
            const sistema   = tds[2] ? limpiar(tds[2].textContent) : null;
            const domicilio = tds[4] ? limpiar(tds[4].textContent) : null;
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
 * Itera todas las páginas de #tblmiGrilla con #tblmiGrilla_btn_next.
 * Se detiene cuando el botón está deshabilitado / oculto, o cuando la tabla
 * no cambia tras un click (resguardo).
 */
async function leerTodasLasPaginas(page) {
    const MAX_PAGINAS = 30; // safety
    const todas = [];

    for (let i = 0; i < MAX_PAGINAS; i++) {
        const filas = await leerFilasDePaginaActual(page);
        todas.push(...filas);
        console.log(`  → [ABM PDV] Página ${i + 1}: ${filas.length} fila(s).`);

        const puedeAvanzar = await page.evaluate(() => {
            const td = document.querySelector('#tblmiGrilla_btn_td_next');
            const btn = document.querySelector('#tblmiGrilla_btn_next');
            if (!td || !btn) return false;
            const cs = window.getComputedStyle(td);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
            if (btn.classList.contains('ui-state-disabled')) return false;
            return true;
        });

        if (!puedeAvanzar) {
            console.log('  → [ABM PDV] No hay más páginas.');
            break;
        }

        // Capturar referencia de la primera fila para detectar cuando la tabla cambia.
        const refAnterior = await page.evaluate(() => {
            const tr = document.querySelector('#tblmiGrilla tbody tr');
            return tr ? `${tr.id}::${(tr.textContent || '').substring(0, 50)}` : null;
        });

        await page.click('#tblmiGrilla_btn_next');

        try {
            await page.waitForFunction((prev) => {
                const tr = document.querySelector('#tblmiGrilla tbody tr');
                if (!tr) return false;
                const actual = `${tr.id}::${(tr.textContent || '').substring(0, 50)}`;
                return actual !== prev;
            }, { timeout: 6000 }, refAnterior);
            await esperar(400);
        } catch (_) {
            console.log('  → [ABM PDV] La tabla no cambió tras click next; asumo última página.');
            break;
        }
    }

    return todas;
}

/**
 * Lee TODAS las páginas del ABM y devuelve sólo los PDV "operables":
 *   sistema (normalizado) === "Factura en Linea - Responsable Inscripto"
 *   Y activo === true.
 *
 * Loguea cada fila con su decisión para diagnóstico (importante cuando AFIP
 * cambia textos o caracteres invisibles rompen el match).
 */
async function leerTablaPuntosDeVenta(page) {
    const todas = await leerTodasLasPaginas(page);
    const operables = todas.filter(esOperable);
    console.log(`  → [ABM PDV] ${todas.length} fila(s) totales, ${operables.length} operables.`);
    // Log conciso de cada fila descartada para auditar (útil si AFIP cambia textos).
    if (operables.length < todas.length) {
        todas.filter(p => !esOperable(p)).forEach(p => {
            console.log(`     descartado: numero="${p.numero}" sistema="${p.sistema}" activo=${p.activo}`);
        });
    }
    return operables;
}

/**
 * Procesa UNA empresa estando ya parado en la lista de empresas (index_bis.jsp).
 * Selecciona la empresa, abre el ABM, lee la tabla (con paginación + filtro) y
 * devuelve los PDV operables.
 *
 * @param {import('puppeteer').Page} pageLista  página en index_bis.jsp
 * @param {string} razonSocial
 * @returns {Promise<Array<{numero:string, sistema:string, domicilio:string|null, activo:true}>>}
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
    console.log(`  ✅ [ABM PDV] ${pdvs.length} PDV operables en "${razonSocial}".`);
    return pdvs;
}

/**
 * Procesa el caso "empresa única" donde AFIP saltea la pantalla de selección.
 * Asume que la página YA está en mostrarMenu.do o abmPuntosVenta.do.
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
    console.log(`  ✅ [ABM PDV] (empresa única) ${pdvs.length} PDV operables.`);
    return pdvs;
}

/**
 * Vuelve a la lista de empresas. Usa goBack() porque AFIP rechaza la URL directa.
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
    volverAListaEmpresas,
    SISTEMA_OPERABLE
};
