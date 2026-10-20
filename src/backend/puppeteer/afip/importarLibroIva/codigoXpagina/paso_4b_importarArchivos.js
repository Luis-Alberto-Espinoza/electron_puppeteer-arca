// Paso 4b — IVA Simple, modo "Mis archivos": Eliminar todo + Importar Archivos (los txt del cliente).
//
// Eliminar todo: #btnEliminarTodo → BootstrapDialog "Eliminar Todos los Comprobantes" (.btn-danger)
//   → ajax.do?f=eliminarComprobantesCategoria&c=<tipoOperacion> ({estado:"ok"}).
// Importar Archivos: IMPORTAR ▾ → #lnkImportarArchivo → #modalImportarArchivos (#formArchivos):
//   #archivo (comprobantes) + #archivoIVA (alícuotas), #cuitArchivo = CUIT del representado,
//   #modoImportacion / #modoMoneda → POST importarArchivos.do ({estado:"ok"} o
//   {estado:"error", mensajeError, camposErrores}). Crea una tarea tipoTarea 2 en el mismo
//   Historial de Importaciones que "Importar desde ARCA".
// Errores por renglón (tarea "Procesada (con errores)"): ajax.do?f=listaErroresTareaArchivo&id=<codigo>
//   → datos [{numFilaCmp, numFilaIVA, descripcionError}] (varios errores separados por ";").
// Los archivos ya vienen validados (service/validarArchivosIva.js); acá no se miran.

const { soloDigitos, errorConCodigo, clickReal } = require('./_comun.js');
const { abrirLibro, listarTareas, esperarTarea, LIBROS, TAREA_ARCHIVOS, TIMEOUT_PAGINA } = require('./paso_4_importarLibro.js');

const TIMEOUT_RESPUESTA = 120000;   // importarArchivos.do sube los dos archivos
const MAX_ERRORES_FILAS = 50;

const textoError = (json) => [json.mensajeError, ...Object.values(json.camposErrores || {})]
    .filter(Boolean).join(' · ') || JSON.stringify(json).slice(0, 300);

/** Elimina TODOS los comprobantes del libro abierto (`liva` ya en verVentas/verCompras). */
async function eliminarTodo(liva, tipo) {
    const libro = LIBROS[tipo];
    await clickReal(liva, '#btnEliminarTodo');
    const confirmar = '.bootstrap-dialog .modal-footer .btn-danger';
    await liva.waitForSelector(confirmar, { visible: true, timeout: 20000 }).catch(() => {
        throw errorConCodigo('ELIMINAR_TODO_FALLO', `ARCA no mostró la confirmación de "Eliminar todo" en el Libro ${libro.nombre}.`);
    });
    const titulo = await liva.$eval('.bootstrap-dialog .bootstrap-dialog-title', e => e.textContent).catch(() => '');
    if (!/eliminar todos/i.test(titulo)) {
        throw errorConCodigo('ELIMINAR_TODO_FALLO', `Se esperaba la confirmación "Eliminar Todos los Comprobantes" y apareció "${titulo}".`);
    }

    const respuesta = liva.waitForResponse(r => r.url().includes('eliminarComprobantesCategoria'), { timeout: TIMEOUT_PAGINA });
    // Después de eliminar, ARCA pregunta f=modoP y, si no contesta "c", RECARGA la página sola
    // (location.href = verVentas.do…). Hay que esperar esa recarga: navegar encima la corta.
    // Con gServerSide no pregunta (solo recarga la grilla): por eso el catch.
    const modo = liva.waitForResponse(r => r.url().includes('f=modoP'), { timeout: 15000 }).catch(() => null);
    await clickReal(liva, confirmar);
    const r = await respuesta.catch(() => null);
    const json = r ? await r.json().catch(() => null) : null;
    if (!json || json.estado !== 'ok') {
        throw errorConCodigo('ELIMINAR_TODO_FALLO',
            `ARCA no eliminó los comprobantes del Libro ${libro.nombre}${json ? `: ${textoError(json)}` : '.'}`);
    }
    const rModo = await modo;
    const jsonModo = rModo ? await rModo.json().catch(() => null) : null;
    if (jsonModo && jsonModo.estado === 'ok' && jsonModo.datos !== 'c') {
        await liva.waitForNavigation({ waitUntil: 'networkidle2', timeout: TIMEOUT_PAGINA }).catch(() => {});
    }
}

/**
 * Lo que ARCA dice de cada renglón que no importó. Si no se puede leer, devuelve null:
 * los contadores ya están y el detalle sigue en el Historial de Importaciones.
 * @returns {Promise<Array<{fila, filaAlicuota, error}>|null>}  fila = renglón del txt de comprobantes
 */
async function leerErroresTarea(liva, codigo) {
    const r = await liva.evaluate(async (id) => {
        try {
            const resp = await fetch(`ajax.do?f=listaErroresTareaArchivo&id=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
            return { ok: resp.ok, json: await resp.json() };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    }, String(codigo));
    if (!r.ok || !r.json || !Array.isArray(r.json.datos)) return null;
    return r.json.datos.slice(0, MAX_ERRORES_FILAS).map(e => ({
        fila: e.numFilaCmp,
        filaAlicuota: e.numFilaIVA == null ? null : e.numFilaIVA,
        error: String(e.descripcionError || '').split(';').map(x => x.trim()).filter(Boolean).join(' · ')
    }));
}

/**
 * Sube los dos txt del libro y espera la tarea de ARCA.
 * @param {{cuit: string, periodo: string, cbte: string, alicuotas: string}} datos  rutas de los txt
 * @returns {Promise<{encontrados, agregados, yaExistentes, noImportados, erroresFilas?}>}
 */
async function importarArchivos(liva, tipo, { cuit, periodo, cbte, alicuotas }, avisar = () => {}) {
    const libro = LIBROS[tipo];
    const { tipoOperacion } = await abrirLibro(liva, tipo, { cuit, periodo });
    const antes = new Set((await listarTareas(liva, tipoOperacion)).map(t => t.codigo));

    await clickReal(liva, '#btnDropdownImportar');
    await clickReal(liva, '#lnkImportarArchivo');
    await liva.waitForSelector('#modalImportarArchivos.in #btnImportarArchivosImportar', { visible: true, timeout: TIMEOUT_PAGINA });

    // El formulario tiene que ser el de este libro y este cliente.
    const form = await liva.evaluate(() => ({
        tipoArchivo: (document.getElementById('tipoArchivo') || {}).value,
        cuitArchivo: (document.getElementById('cuitArchivo') || {}).value
    }));
    if (String(form.tipoArchivo) !== String(tipoOperacion)) {
        throw errorConCodigo('FORMULARIO_INESPERADO', `"Importar Archivos" abrió para otro libro (${form.tipoArchivo}), se esperaba ${libro.nombre}.`);
    }
    if (soloDigitos(form.cuitArchivo) !== soloDigitos(cuit)) {
        throw errorConCodigo('CLIENTE_NO_COINCIDE', `"Importar Archivos" es del CUIT ${form.cuitArchivo}, no del ${cuit}.`);
    }

    // uploadFile carga el archivo como si se eligiera en el explorador (no lo abre).
    await (await liva.$('#archivo')).uploadFile(cbte);
    await (await liva.$('#archivoIVA')).uploadFile(alicuotas);
    // Conservar (1): el libro quedó vacío, no hay nada que pisar. Moneda original (1): los txt
    // traen moneda y tipo de cambio por comprobante.
    const cargado = await liva.evaluate(() => {
        const $ = window.jQuery;
        ['modoImportacion', 'modoMoneda'].forEach(id => {
            const sel = document.getElementById(id);
            if (sel && sel.value !== '1' && $ && $.fn.selectpicker) $(sel).selectpicker('val', '1');
        });
        const nombre = (id) => { const f = document.getElementById(id).files; return f && f[0] ? f[0].name : null; };
        return {
            archivo: nombre('archivo'), archivoIVA: nombre('archivoIVA'),
            modos: document.getElementById('modoImportacion').value + document.getElementById('modoMoneda').value
        };
    });
    if (!cargado.archivo || !cargado.archivoIVA) {
        throw errorConCodigo('ARCHIVOS_NO_CARGADOS', `No se pudieron cargar los txt en "Importar Archivos" del Libro ${libro.nombre}.`);
    }
    if (cargado.modos !== '11') {
        throw errorConCodigo('MODO_IMPORTACION', 'No se pudo elegir "Conservar" y "moneda original" en "Importar Archivos".');
    }

    // Escuchar ANTES del click.
    const respuesta = liva.waitForResponse(
        r => r.url().includes('importarArchivos.do') && r.request().method() === 'POST',
        { timeout: TIMEOUT_RESPUESTA }
    );
    await clickReal(liva, '#btnImportarArchivosImportar');
    const r = await respuesta.catch(() => null);
    const json = r ? await r.json().catch(() => null) : null;
    if (!json || json.estado !== 'ok') {
        throw errorConCodigo('IMPORTACION_RECHAZADA',
            `ARCA no aceptó los archivos del Libro ${libro.nombre}: ${json ? textoError(json) : 'sin respuesta'}.`);
    }

    avisar(`Libro ${libro.nombre}: ARCA está procesando los archivos…`);
    const { codigo, ...tarea } = await esperarTarea(liva, tipo, { tipoOperacion, tipoTarea: TAREA_ARCHIVOS, antes }, avisar);
    if (tarea.noImportados > 0) {
        avisar(`Libro ${libro.nombre}: leyendo los errores de ARCA…`);
        tarea.erroresFilas = await leerErroresTarea(liva, codigo);
    }
    return tarea;
}

module.exports = { eliminarTodo, importarArchivos };
