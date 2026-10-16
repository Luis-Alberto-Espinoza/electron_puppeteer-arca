// Paso 4 — Leer la respuesta de la API de Seti (no la pantalla).
//
// Al consultar, Seti pide:
//   GET /setiweb/api/deudas/faltadepresentacion?cuit=<CUIT>
//   → { success: true, data: [ {personaCuit, establecimiento, impuesto:{codigo,descripcion},
//                                periodoFiscal, fechaVencimientoAsString, importe, exigible, …} ],
//       error: "" }
//   Sin pendientes: { success: true, data: [], error: "" }
// Leemos ESA respuesta (filtrada por el cuit de la URL) en vez de la tabla: la tabla es un
// ag-grid que virtualiza columnas (faltan Período/Vencimiento en el DOM) y pagina de a 10.
//
// Se escucha ANTES de elegir el contribuyente (escucharRespuesta) por si Seti consulta
// solo al cambiarlo; en las pruebas en vivo nunca pasó, así que si al terminar de elegir
// no llegó nada se aprieta VER CONSULTA enseguida, con click real (el click por DOM no
// dispara la consulta).

const TIMEOUT_RESPUESTA = 60000;
const TIMEOUT_BOTON = 15000;

const esRespuestaDe = (cuit) => (r) => {
    if (!r.url().includes('/api/deudas/faltadepresentacion')) return false;
    try { return new URL(r.url()).searchParams.get('cuit') === String(cuit); } catch (_) { return false; }
};

/**
 * Empieza a escuchar la respuesta de `cuit`. Llamarlo ANTES de elegir el contribuyente.
 * @returns {{promesa: Promise<import('puppeteer').HTTPResponse>, llego: () => boolean}}
 */
function escucharRespuesta(page, cuit) {
    let llego = false;
    const promesa = page.waitForResponse(esRespuestaDe(cuit), { timeout: TIMEOUT_RESPUESTA })
        .then(r => { llego = true; return r; });
    promesa.catch(() => {}); // si algo falla antes de esperarla, que no quede un rechazo suelto
    return { promesa, llego: () => llego };
}

// Click REAL (mouse de Puppeteer) en VER CONSULTA, esperando a que esté visible y habilitado.
function buscarVerConsulta() {
    return Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.replace(/\s+/g, ' ').trim().toLowerCase() === 'ver consulta'
            && b.offsetParent !== null && !b.disabled) || null;
}

async function clickVerConsulta(page) {
    await page.waitForFunction(buscarVerConsulta, { timeout: TIMEOUT_BOTON })
        .catch(() => { throw new Error('Seti: no apareció el botón "VER CONSULTA".'); });

    const el = (await page.evaluateHandle(buscarVerConsulta)).asElement();
    if (!el) throw new Error('Seti: el botón "VER CONSULTA" desapareció antes del click.');
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();
}

/**
 * @param {import('puppeteer').Page} page  Pestaña de Seti con el CUIT ya elegido.
 * @param {string} cuit
 * @param {ReturnType<typeof escucharRespuesta>} escucha  creada ANTES de elegir el CUIT
 * @returns {Promise<Array<Object>>} filas normalizadas; [] = sin DDJJ pendientes.
 * @throws si AFIP no responde o responde con error (nunca se toma como "sin pendientes").
 */
async function consultar(page, cuit, escucha) {
    // 4.1 Si la respuesta no llegó al elegir, VER CONSULTA.
    if (!escucha.llego()) await clickVerConsulta(page);

    let respuesta;
    try {
        respuesta = await escucha.promesa;
    } catch (_) {
        throw new Error(`AFIP no respondió la consulta de DDJJ pendientes en ${TIMEOUT_RESPUESTA / 1000}s.`);
    }
    if (!respuesta.ok()) {
        throw new Error(`AFIP respondió ${respuesta.status()} a la consulta de DDJJ pendientes.`);
    }

    let json;
    try {
        json = await respuesta.json();
    } catch (_) {
        throw new Error('AFIP devolvió una respuesta que no es JSON en DDJJ pendientes.');
    }
    if (!json || json.success !== true || (json.error && String(json.error).trim()) || !Array.isArray(json.data)) {
        throw new Error(`AFIP devolvió error en DDJJ pendientes: ${(json && json.error) || 'respuesta inesperada'}`);
    }

    const filas = json.data.map(d => ({
        cuit: String(d.personaCuit ?? ''),
        establecimiento: d.establecimiento ?? '',
        impuesto: d.impuesto ? `${d.impuesto.codigo} - ${d.impuesto.descripcion}` : '',
        periodo: String(d.periodoFiscal ?? ''),
        // El texto, no el número en ms: convertirlo puede correr la fecha un día por zona horaria.
        vencimiento: d.fechaVencimientoAsString || '',
        importe: d.importe ?? null,
        exigible: d.exigible ?? null,
        concepto: d.concepto ?? '',
        subconcepto: d.subconcepto ?? '',
        anticipoCuota: d.anticipoCuota ?? '',
        boletaDeuda: d.boletaDeuda ?? '',
        origen: d.origen ?? '',
        nroLiquidacion: d.nroLiquidacion ?? ''
    }));
    return filas;
}

module.exports = { escucharRespuesta, consultar };
