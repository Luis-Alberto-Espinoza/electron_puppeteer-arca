// Paso 3b — IVA Simple: "Datos Iniciales" (verDatosInicialesPresentacion.do).
// Aparece la primera vez que se abre un período. Son datos de la declaración: los elige el
// usuario en el front (no se adivinan). Siempre "Con Movimientos": "Sin Movimientos" termina
// en "Registrar Sin Movimientos", que presenta, y este servicio nunca presenta.
//
// Pantalla: casillas .chkOperacion (5) + #ningunaOperacion (excluyente) + #tipoProrrateo
// (solo con No Gravadas/Exentas) + #importarDatosAnterior (oculta salvo que ARCA la muestre).
// #btnGuardar ("Continuar") se habilita con el evento change de las casillas →
// guardarDatosInicialesPresentacion.do ({estado:"ok"}) → menuPresentacion.do.

const { errorConCodigo, esperarUrl, clickReal, periodoLegible } = require('./_comun.js');

// Mismos nombres que usa ARCA (ids de las casillas y campos de window.datosForm).
const OPERACIONES = [
    'operacionesNoGravadasExentas',
    'importacionDefinitivaBienes',
    'importacionServicios',
    'regimenTurIVA',
    'bienesUsadosMaterialReciclable'
];
const PRORRATEOS = ['1', '2', '3'];
const TIMEOUT = 60000;

/**
 * Lo que el front necesita para ofrecer la pantalla: período, valores que ya tiene ARCA y si
 * muestra "Importar datos de la presentación anterior".
 */
async function leerDatosIniciales(liva) {
    return liva.evaluate((operaciones) => {
        const f = window.datosForm || {};
        const seccionAnterior = document.getElementById('seccionImportarDatosAnterior');
        const actuales = {};
        operaciones.forEach(k => { actuales[k] = !!f[k]; });
        if (f.tipoProrrateo) actuales.tipoProrrateo = String(f.tipoProrrateo);
        return {
            periodo: f.periodo != null ? String(f.periodo) : null,
            estado: f.estado || null,
            importarAnteriorVisible: !!seccionAnterior && getComputedStyle(seccionAnterior).display !== 'none',
            actuales
        };
    }, OPERACIONES);
}

/** Valida lo que llega del front: solo claves conocidas, al menos una opción, "ninguna" excluyente. */
function normalizar(datos) {
    const d = {};
    OPERACIONES.forEach(k => { d[k] = datos[k] === true; });
    d.ningunaOperacion = datos.ningunaOperacion === true;
    d.importarDatosAnterior = datos.importarDatosAnterior === true;
    d.tipoProrrateo = d.operacionesNoGravadasExentas ? String(datos.tipoProrrateo || '1') : null;

    const algunaOperacion = OPERACIONES.some(k => d[k]);
    if (!algunaOperacion && !d.ningunaOperacion) {
        throw errorConCodigo('DATOS_INICIALES_INVALIDOS', 'Datos Iniciales: marcá al menos una opción (o "No realizo ninguna").');
    }
    if (algunaOperacion && d.ningunaOperacion) {
        throw errorConCodigo('DATOS_INICIALES_INVALIDOS', 'Datos Iniciales: "No realizo ninguna" no va junto con otras operaciones.');
    }
    if (d.tipoProrrateo && !PRORRATEOS.includes(d.tipoProrrateo)) {
        throw errorConCodigo('DATOS_INICIALES_INVALIDOS', 'Datos Iniciales: forma de cómputo del crédito fiscal desconocida.');
    }
    return d;
}

/**
 * Completa la pantalla y toca Continuar. Termina con la pestaña en menuPresentacion.do.
 * @param {import('puppeteer').Page} liva  en verDatosInicialesPresentacion.do
 * @param {string} periodo  'AAAAMM'
 * @param {object} datos  { operacionesNoGravadasExentas, tipoProrrateo, importacionDefinitivaBienes,
 *                          importacionServicios, regimenTurIVA, bienesUsadosMaterialReciclable,
 *                          ningunaOperacion, importarDatosAnterior }  (booleans; tipoProrrateo '1'|'2'|'3')
 */
async function completarDatosIniciales(liva, periodo, datos) {
    const d = normalizar(datos || {});
    const info = await leerDatosIniciales(liva);
    if (info.periodo !== periodo) {
        throw errorConCodigo('PERIODO_NO_COINCIDE',
            `Datos Iniciales abiertos para otro período (${info.periodo || '?'}), se esperaba ${periodoLegible(periodo)}.`);
    }
    if (info.estado !== 'BO') {
        throw errorConCodigo('DATOS_INICIALES_BLOQUEADOS', `Los Datos Iniciales de ${periodoLegible(periodo)} no están en borrador: ARCA no deja cambiarlos.`);
    }

    // Click del DOM sobre cada casilla: cambia el estado y dispara el change que escucha ARCA
    // (habilita Continuar, muestra la forma de cómputo, desmarca "ninguna").
    const quedo = await liva.evaluate((d, operaciones) => {
        const $ = window.jQuery;
        const casilla = (id, valor) => {
            const el = document.getElementById(id);
            if (el && el.checked !== valor) el.click();
        };
        // Siempre "Con Movimientos" (el otro camino presenta).
        const con = document.getElementById('movimientoCon');
        if (con && !con.checked) con.click();

        if (d.ningunaOperacion) {
            casilla('ningunaOperacion', true);
        } else {
            operaciones.forEach(k => casilla(k, d[k]));
            casilla('ningunaOperacion', false);
        }
        if (d.tipoProrrateo && $) {
            $('#tipoProrrateo').val(d.tipoProrrateo);
            if ($.fn.selectpicker) $('#tipoProrrateo').selectpicker('refresh');
        }
        if (d.importarDatosAnterior) casilla('importarDatosAnterior', true);

        // Lo que quedó en la pantalla, para no confiar en los clicks.
        const leido = { ningunaOperacion: !!(document.getElementById('ningunaOperacion') || {}).checked };
        operaciones.forEach(k => { leido[k] = !!(document.getElementById(k) || {}).checked; });
        leido.tipoProrrateo = (document.getElementById('tipoProrrateo') || {}).value || null;
        leido.conMovimientos = !!(con && con.checked);
        leido.guardarHabilitado = !(document.getElementById('btnGuardar') || { disabled: true }).disabled;
        return leido;
    }, d, OPERACIONES);

    const distinto = [...OPERACIONES, 'ningunaOperacion'].filter(k => quedo[k] !== d[k]);
    if (distinto.length || !quedo.conMovimientos || (d.tipoProrrateo && quedo.tipoProrrateo !== d.tipoProrrateo)) {
        throw errorConCodigo('DATOS_INICIALES_NO_CARGADOS',
            `ARCA no tomó los Datos Iniciales como se pidieron${distinto.length ? ` (${distinto.join(', ')})` : ''}.`);
    }
    if (!quedo.guardarHabilitado) {
        throw errorConCodigo('DATOS_INICIALES_NO_CARGADOS', 'ARCA no habilitó "Continuar" en Datos Iniciales.');
    }

    const respuesta = liva.waitForResponse(r => r.url().includes('guardarDatosInicialesPresentacion.do'), { timeout: TIMEOUT });
    await clickReal(liva, '#btnGuardar');
    const r = await respuesta.catch(() => null);
    const json = r ? await r.json().catch(() => null) : null;
    if (!json || json.estado !== 'ok') {
        throw errorConCodigo('DATOS_INICIALES_RECHAZADOS',
            `ARCA no guardó los Datos Iniciales${json && json.mensajeError ? `: ${json.mensajeError}` : '.'}`);
    }
    if (!await esperarUrl(liva, /menuPresentacion\.do/, TIMEOUT)) {
        throw errorConCodigo('LIBRO_IVA_NO_ABRIO', 'Se guardaron los Datos Iniciales pero no abrió el Libro IVA.');
    }
}

module.exports = { leerDatosIniciales, completarDatosIniciales, OPERACIONES };
