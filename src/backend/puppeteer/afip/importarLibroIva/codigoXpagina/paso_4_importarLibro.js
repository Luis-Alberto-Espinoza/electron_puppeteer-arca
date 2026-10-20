// Paso 4 — IVA Simple: Libro Ventas / Libro Compras → IMPORTAR ▾ → "Importar desde ARCA..." →
// (filtro del mes + "Conservar el comprobante previamente incluído") → IMPORTAR.
//
// La importación es una TAREA asíncrona de ARCA (Historial de Importaciones: Pendiente →
// Procesando → Procesada). No se espera un tiempo fijo: se lee la misma API que usa la página
// para el historial (ajax.do?f=listaTareas&c=<tipoOperacion>) hasta que la tarea NUEVA termine.
// Sus contadores son los del popup "Resultados" (encontrados / agregados / ya existentes).

const { esperar, soloDigitos, errorConCodigo, clickReal, periodoLegible } = require('./_comun.js');

const LIBROS = {
    ventas:  { nombre: 'Ventas',  url: 'https://liva.afip.gob.ar/liva/jsp/verVentas.do?t=31' },
    compras: { nombre: 'Compras', url: 'https://liva.afip.gob.ar/liva/jsp/verCompras.do?t=21' }
};

const TIMEOUT_PAGINA = 60000;
const TIMEOUT_IMPORTAR = 120000;     // respuesta de importarAFIP.do (crea la tarea)
const TIMEOUT_TAREA = 15 * 60000;    // la tarea de ARCA (clientes grandes tardan)
const INTERVALO_TAREA = 5000;

/**
 * Abre el libro y confirma que es el del cliente, del período y en borrador
 * (variables globales de la página de IVA Simple).
 * @returns {Promise<{tipoOperacion: number, serverSide: boolean}>}
 */
async function abrirLibro(liva, tipo, { cuit, periodo }) {
    const libro = LIBROS[tipo];
    await liva.goto(libro.url, { waitUntil: 'networkidle2', timeout: TIMEOUT_PAGINA });
    await liva.waitForFunction(
        () => typeof window.gTipoOperacion !== 'undefined' && !!window.jQuery && !!document.querySelector('#btnDropdownImportar'),
        { timeout: TIMEOUT_PAGINA }
    ).catch(() => {
        throw errorConCodigo('LIBRO_NO_ABRIO', `No cargó el Libro ${libro.nombre} (${liva.url()}).`);
    });

    const estado = await liva.evaluate(() => ({
        cuit: String(window.gUserEmpresaRepresentadaCUIT || ''),
        estado: window.gEstadoPresentacion,
        desde: window.gConfigFechas ? window.gConfigFechas.fechaMesInicio : '',
        tipoOperacion: window.gTipoOperacion,
        serverSide: !!window.gServerSide
    }));

    if (soloDigitos(estado.cuit) !== soloDigitos(cuit)) {
        throw errorConCodigo('CLIENTE_NO_COINCIDE',
            `El Libro ${libro.nombre} abierto es del CUIT ${estado.cuit}, no del ${cuit}.`);
    }
    if (estado.desde !== `01/${periodoLegible(periodo)}`) {
        throw errorConCodigo('PERIODO_NO_COINCIDE',
            `El Libro ${libro.nombre} abierto no es del período ${periodoLegible(periodo)} (empieza el ${estado.desde}).`);
    }
    // 'BO' = borrador. Si ya está presentado no se toca.
    if (estado.estado !== 'BO') {
        throw errorConCodigo('LIBRO_NO_BORRADOR',
            `El Libro IVA ${periodoLegible(periodo)} no está en borrador (estado ${estado.estado}): no se importa.`);
    }
    return { tipoOperacion: estado.tipoOperacion, serverSide: estado.serverSide };
}

// Tareas del historial, tal como las devuelve ARCA (la más nueva primero).
async function listarTareas(liva, tipoOperacion) {
    const r = await liva.evaluate(async (c) => {
        try {
            const resp = await fetch(`ajax.do?f=listaTareas&c=${c}`, { credentials: 'same-origin' });
            return { ok: resp.ok, json: await resp.json() };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }, tipoOperacion);
    if (!r.ok || !r.json) {
        throw errorConCodigo('HISTORIAL_ERROR', `No se pudo leer el Historial de Importaciones (${r.error || 'respuesta inválida'}).`);
    }
    return Array.isArray(r.json.datos) ? r.json.datos : [];
}

// Texto de una tarea con error, en renglones. ARCA lo manda así:
//   "#Archivo comprobantes: línea 1;Error en la longitud del registro…"  ("#" = de dónde, ";" separa)
//   → ["Archivo comprobantes: línea 1 — Error en la longitud del registro…"]
function detalleErrorTarea(texto) {
    const renglones = [];
    let donde = null;
    String(texto || '').split(';').map(x => x.trim()).filter(Boolean).forEach(parte => {
        if (parte.startsWith('#')) {
            if (donde) renglones.push(donde);   // un "#" sin mensaje atrás
            donde = parte.slice(1).trim();
            return;
        }
        renglones.push(donde ? `${donde} — ${parte}` : parte);
        donde = null;
    });
    if (donde) renglones.push(donde);
    return renglones;
}

// Tipos de tarea del historial: 1 = Importar desde ARCA, 2 = Importar Archivos.
const TAREA_ARCA = 1;
const TAREA_ARCHIVOS = 2;

/**
 * Espera la tarea NUEVA (código que no estaba en `antes`) de `tipoTarea` hasta que termine.
 * @returns {Promise<{codigo, encontrados, agregados, yaExistentes, noImportados}>}  contadores de ARCA
 */
async function esperarTarea(liva, tipo, { tipoOperacion, tipoTarea, antes }, avisar = () => {}) {
    const libro = LIBROS[tipo];
    const inicio = Date.now();
    let tarea = null;
    while (Date.now() - inicio < TIMEOUT_TAREA) {
        await esperar(INTERVALO_TAREA);
        tarea = (await listarTareas(liva, tipoOperacion)).find(t => !antes.has(t.codigo) && Number(t.tipoTarea) === tipoTarea) || null;
        if (tarea && ['TE', 'ER', 'CA'].includes(tarea.estado)) break;
        const seg = Math.round((Date.now() - inicio) / 1000);
        avisar(`Libro ${libro.nombre}: ARCA está procesando la importación (${seg} s)…`);
    }

    if (!tarea || !['TE', 'ER', 'CA'].includes(tarea.estado)) {
        throw errorConCodigo('IMPORTACION_SIN_TERMINAR',
            `ARCA no terminó de importar el Libro ${libro.nombre} en ${TIMEOUT_TAREA / 60000} min: revisá el Historial de Importaciones a mano.`);
    }
    if (tarea.estado === 'ER') {
        const e = errorConCodigo('IMPORTACION_ERROR',
            `ARCA rechazó la importación del Libro ${libro.nombre} completa: no cargó nada.`);
        e.detalle = detalleErrorTarea(tarea.errores);
        if (!e.detalle.length) e.message = e.message.replace(/\.$/, ' (ARCA no dijo por qué).');
        throw e;
    }
    if (tarea.estado === 'CA') {
        throw errorConCodigo('IMPORTACION_CANCELADA', `La importación del Libro ${libro.nombre} quedó cancelada.`);
    }

    return {
        codigo: tarea.codigo,
        encontrados: Number(tarea.cantidadRegistros) || 0,
        agregados: Number(tarea.cantidadAgregados) || 0,
        yaExistentes: Number(tarea.cantidadIgnorados) || 0,
        noImportados: Number(tarea.cantidadErroneos) || 0
    };
}

/**
 * @param {import('puppeteer').Page} liva   Página de IVA Simple (de paso 3).
 * @param {'ventas'|'compras'} tipo
 * @param {{cuit: string, periodo: string}} datos   periodo 'AAAAMM'
 * @param {(msg: string) => void} [avisar]   progreso para la UI
 * @returns {Promise<{encontrados, agregados, yaExistentes, noImportados}>}
 */
async function importarLibro(liva, tipo, { cuit, periodo }, avisar = () => {}) {
    const libro = LIBROS[tipo];
    const { tipoOperacion } = await abrirLibro(liva, tipo, { cuit, periodo });

    // Las tareas que ya estaban: la nuestra es la que aparezca nueva.
    const antes = new Set((await listarTareas(liva, tipoOperacion)).map(t => t.codigo));

    await clickReal(liva, '#btnDropdownImportar');
    await clickReal(liva, '#lnkImportarAFIP');
    await liva.waitForSelector('#modalImportarAFIP.in #btnImportarAFIPImportar', { visible: true, timeout: TIMEOUT_PAGINA });

    // Filtro del mes completo ("Fecha del Comprobante: 01/09/2026 a 30/09/2026").
    const filtro = await liva.$eval('#filtroAplicadoConsulta', d => d.textContent || '');
    if (!filtro.includes(`01/${periodoLegible(periodo)}`)) {
        throw errorConCodigo('FILTRO_INESPERADO',
            `El filtro de "Importar desde ARCA" no es el del período ${periodoLegible(periodo)}: "${filtro.trim()}".`);
    }

    // "Conservar el comprobante previamente incluído" (value 1): nunca pisar lo cargado a mano.
    await liva.evaluate(() => {
        const sel = document.querySelector('#modoImportacionAFIP');
        if (sel.value !== '1' && window.jQuery && window.jQuery.fn.selectpicker) {
            window.jQuery(sel).selectpicker('val', '1');
        }
    });
    if (await liva.$eval('#modoImportacionAFIP', s => s.value) !== '1') {
        throw errorConCodigo('MODO_IMPORTACION', 'No se pudo elegir "Conservar el comprobante previamente incluído".');
    }

    // Escuchar ANTES del click.
    const respuesta = liva.waitForResponse(
        r => r.url().includes('importarAFIP.do') && r.request().method() === 'POST',
        { timeout: TIMEOUT_IMPORTAR }
    );
    await clickReal(liva, '#btnImportarAFIPImportar');
    const json = await (await respuesta).json().catch(() => null);
    if (!json || json.estado !== 'ok') {
        throw errorConCodigo('IMPORTACION_RECHAZADA',
            `ARCA no aceptó la importación del Libro ${libro.nombre}: ${json ? JSON.stringify(json).slice(0, 300) : 'respuesta inválida'}.`);
    }

    // Esperar la tarea nueva hasta que termine.
    return esperarTarea(liva, tipo, { tipoOperacion, tipoTarea: TAREA_ARCA, antes }, avisar);
}

module.exports = { importarLibro, abrirLibro, listarTareas, esperarTarea, LIBROS, TAREA_ARCHIVOS, TIMEOUT_PAGINA };
