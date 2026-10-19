// Paso 3 — Portal IVA: "Nueva declaración jurada" → INGRESAR → período → CONTINUAR.
// ARCA redirige (auth.afip.gob.ar "Redireccionando...") a IVA Simple:
// liva.afip.gob.ar/liva/jsp/menuPresentacion.do (Libro IVA MM/AAAA – Original - Borrador).
// En el medio pueden aparecer dos pantallas (las deciden el usuario, no el programa):
//   - borrador de OTRO período sin presentar (paso 3a): se descarta solo si el usuario lo autorizó.
//   - Datos Iniciales del período (paso 3b): se completan solo con lo que eligió el usuario.
// Si no hay autorización/datos, se corta con un error que trae lo necesario para preguntar.
//
// Los botones de Portal IVA no tienen id: se usan sus aria-label fijos.

const { esperar, errorConCodigo, clickReal, periodoLegible } = require('./_comun.js');
const { elegirRepresentado } = require('./paso_2_elegirRepresentado.js');
const { leerBorradorOtroPeriodo, descartarBorrador } = require('./paso_3a_borradorOtroPeriodo.js');
const { leerDatosIniciales, completarDatosIniciales } = require('./paso_3b_datosIniciales.js');

const BTN_NUEVA_DDJJ = 'button[aria-label*="iva.home.btn.nueva.declaracion"]';
const BTN_CONTINUAR = 'button[aria-label*="iva.btn.home.validar.periodo"]';
const BTN_INGRESAR_LIVA = 'button[aria-label*="iva.btn.home.liva"]';
const TIMEOUT = 30000;
const TIMEOUT_LIVA = 3 * 60000;

// Página de IVA Simple ya cargada, o null. Normalmente es la misma pestaña; por las dudas
// se mira también si ARCA la abrió en otra.
async function buscarLiva(portal) {
    const paginas = [portal, ...(await portal.browser().pages()).filter(p => p !== portal)];
    for (const p of paginas) {
        if (!/liva\.afip\.gob\.ar\/liva\/jsp\//.test(p.url())) continue;
        const lista = await p.evaluate(() => document.readyState === 'complete').catch(() => false);
        if (lista) return p;
    }
    return null;
}

// Después de CONTINUAR, Portal IVA muestra "Registración y declaración" (período + vencimiento)
// con su "Ingresar"; ese lleva a IVA Simple. Ojo: la pantalla tiene OTRO "Ingresar"
// (Retenciones, percepciones y pagos a cuenta): por eso se elige por aria-label, no por texto.
// La transición a IVA Simple es lenta: se espera la página, no un tiempo fijo.
async function esperarLiva(portal, avisar) {
    const inicio = Date.now();
    let clickeado = false;
    while (Date.now() - inicio < TIMEOUT_LIVA) {
        const liva = await buscarLiva(portal);
        if (liva) return liva;

        if (!clickeado && await portal.$(BTN_INGRESAR_LIVA).catch(() => null)) {
            // Si todavía no está clickeable, se reintenta en la próxima vuelta.
            clickeado = await clickReal(portal, BTN_INGRESAR_LIVA, { timeout: 5000 }).then(() => true, () => false);
        }
        avisar(`ARCA está abriendo el Libro IVA (${Math.round((Date.now() - inicio) / 1000)} s)…`);
        await esperar(1000);
    }
    throw errorConCodigo('LIBRO_IVA_NO_ABRIO', clickeado
        ? `Después de "Ingresar" (Registración y declaración) no cargó el Libro IVA en ${TIMEOUT_LIVA / 60000} min.`
        : `Después de CONTINUAR no apareció "Registración y declaración" ni el Libro IVA en ${TIMEOUT_LIVA / 60000} min.`);
}

// Portal IVA (home) → período → CONTINUAR → la página de IVA Simple que haya abierto ARCA.
async function entrarAlPeriodo(portal, periodo, avisar) {
    // Sin la caracterización de IVA, Portal IVA muestra un aviso en vez de "Nueva declaración jurada".
    // Se espera el botón (no el aviso): recién elegido el representado, el aviso viejo puede seguir un instante.
    const hayBoton = await portal.waitForSelector(BTN_NUEVA_DDJJ, { visible: true, timeout: TIMEOUT })
        .then(() => true, () => false);
    if (!hayBoton) {
        const aviso = await portal.evaluate(() => /no posee activa la caracterizaci/i.test(document.body.innerText));
        throw errorConCodigo(aviso ? 'SIN_CARACTERIZACION_IVA' : 'PORTAL_IVA_NO_ABRIO', aviso
            ? 'Portal IVA no ofrece "Nueva declaración jurada" para este CUIT (no tiene activa la caracterización de IVA).'
            : 'Portal IVA no mostró "Nueva declaración jurada".');
    }
    await clickReal(portal, BTN_NUEVA_DDJJ);

    await portal.waitForSelector('select#periodo', { visible: true, timeout: TIMEOUT });
    const opciones = await portal.$$eval('select#periodo option', os => os.map(o => o.value).filter(Boolean));
    if (!opciones.includes(periodo)) {
        throw errorConCodigo('PERIODO_NO_DISPONIBLE',
            `Portal IVA no ofrece el período ${periodoLegible(periodo)} (ofrece: ${opciones.map(periodoLegible).join(', ') || 'ninguno'}).`);
    }
    await portal.select('select#periodo', periodo);
    const elegido = await portal.$eval('select#periodo', s => s.value);
    if (elegido !== periodo) {
        throw errorConCodigo('PERIODO_NO_DISPONIBLE', `No se pudo elegir el período ${periodoLegible(periodo)}.`);
    }

    await clickReal(portal, BTN_CONTINUAR);
    return esperarLiva(portal, avisar);
}

/**
 * @param {import('puppeteer').Page} portal  Portal IVA, ya representando al cliente.
 * @param {string} periodo  'AAAAMM'
 * @param {(msg: string) => void} [avisar]  progreso para la UI
 * @param {object} [opciones]
 * @param {string}  [opciones.cuit]               cliente (para re-confirmar la representación al volver al portal)
 * @param {boolean} [opciones.descartarBorrador]  casilla del formulario: descartar el borrador de otro período, sea cual sea
 * @param {string}  [opciones.descartarPeriodo]   'AAAAMM' confirmado en Resultados: descartar SOLO ese borrador
 * @param {object}  [opciones.datosIniciales]     lo que eligió el usuario (ver paso_3b)
 * @returns {Promise<{liva, borradorDescartado: string|null, datosInicialesCargados: boolean}>}
 *          liva = IVA Simple en el menú del Libro IVA.
 */
async function abrirPeriodo(portal, periodo, avisar = () => {}, opciones = {}) {
    const { cuit, descartarBorrador: descartarCualquiera, descartarPeriodo, datosIniciales } = opciones;
    let liva = await entrarAlPeriodo(portal, periodo, avisar);
    let borradorDescartado = null;
    try {
        const borrador = await leerBorradorOtroPeriodo(liva);
        if (borrador) {
            if (!descartarCualquiera && descartarPeriodo !== borrador) {
                throw errorConCodigo('BORRADOR_OTRO_PERIODO',
                    `ARCA no abre ${periodoLegible(periodo)}: hay un borrador ${periodoLegible(borrador)} sin presentar. Hay que presentarlo o descartarlo.`,
                    { periodoBorrador: borrador });
            }
            avisar(`Descartando el borrador ${periodoLegible(borrador)}…`);
            const portalDeNuevo = await descartarBorrador(liva, borrador);
            borradorDescartado = borrador;
            if (cuit) await elegirRepresentado(portalDeNuevo, cuit);
            avisar('Borrador descartado. Abriendo el Libro IVA del período…');
            liva = await entrarAlPeriodo(portalDeNuevo, periodo, avisar);

            // Un segundo borrador no se descarta en cadena: que lo vea el usuario.
            const otro = await leerBorradorOtroPeriodo(liva);
            if (otro) {
                throw errorConCodigo('BORRADOR_OTRO_PERIODO',
                    `Se descartó el borrador ${periodoLegible(borrador)}, pero ARCA muestra otro: ${periodoLegible(otro)}.`,
                    { periodoBorrador: otro });
            }
        }

        let datosInicialesCargados = false;
        if (/verDatosInicialesPresentacion/.test(liva.url())) {
            const info = await leerDatosIniciales(liva);
            if (!datosIniciales) {
                throw errorConCodigo('DATOS_INICIALES_PENDIENTES',
                    `ARCA pide los Datos Iniciales del Libro IVA ${periodoLegible(periodo)}: elegí las opciones y tocá Continuar.`,
                    { datosIniciales: info });
            }
            avisar('Cargando los Datos Iniciales…');
            await completarDatosIniciales(liva, periodo, datosIniciales);
            datosInicialesCargados = true;
        }

        await verificarMenu(liva, periodo);
        return { liva, borradorDescartado, datosInicialesCargados };
    } catch (e) {
        // Lo que ya se hizo (descartar) viaja con el error: el usuario tiene que enterarse igual.
        e.datos = { ...(e.datos || {}), borradorDescartado };
        e.liva = liva;
        throw e;
    }
}

async function verificarMenu(liva, periodo) {
    const url = liva.url();
    if (!/menuPresentacion\.do/.test(url)) {
        throw errorConCodigo('LIBRO_IVA_NO_ABRIO', `IVA Simple abrió una pantalla inesperada: ${url}`);
    }

    // Confirmar el período en el título ("Libro IVA | 09/2026").
    const titulo = await liva.$eval('#titulo', h => h.textContent || '').catch(() => '');
    if (!titulo.includes(periodoLegible(periodo))) {
        throw errorConCodigo('PERIODO_NO_COINCIDE',
            `El Libro IVA abierto no es del período ${periodoLegible(periodo)} (título: "${titulo.trim()}").`);
    }
}

module.exports = { abrirPeriodo };
