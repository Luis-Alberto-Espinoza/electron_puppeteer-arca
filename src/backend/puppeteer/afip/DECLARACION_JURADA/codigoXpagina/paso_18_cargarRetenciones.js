// paso_18_cargarRetenciones.js
// LOOP de Plan B (página Liquidación): por cada retención con .txt asignado en
// datosManuales.retenciones → abrir su "+" → IMPORTAR → uploadFile(ruta) → esperar que AFIP
// termine de leer el archivo (señal, no reloj) → Aceptar → esperar la tabla → volver.png. Itera sobre todas (Retenciones Sufridas, Percepciones, ...).
//
// Match EXACTO por la descripción de la fila (ojo: "Percepciones" es substring de
// "Percepciones Aduaneras"). NO se clickea "Seleccionar archivo" (diálogo nativo que cuelga):
// se usa input.uploadFile(ruta) directo. Tolerante: si una falla, sigue con la siguiente.

const nav = require('./_navegacion.js');

const ATTR = 'data-ddjj-ret-target';

/** Marca y clickea el "+" de la fila cuya descripción == etiqueta (exacto). */
async function abrirMas(page, etiqueta) {
    const ok = await page.evaluate((lbl, attr) => {
        const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
        document.querySelectorAll('[' + attr + ']').forEach(e => e.removeAttribute(attr));
        const btns = Array.from(document.querySelectorAll('.v-button.dynaFormActionField'))
            .filter(b => b.offsetParent !== null && b.querySelector('img[src*="detallar"]'));
        for (const b of btns) {
            const row = b.closest('.v-table-row, .v-table-row-odd, tr');
            if (!row) continue;
            const desc = norm((row.querySelector('.v-customcomponent .v-label, .v-label') || {}).textContent);
            if (desc === norm(lbl)) { b.setAttribute(attr, '1'); return true; }
        }
        return false;
    }, etiqueta, ATTR);
    if (!ok) return false;

    const el = await page.$('[' + ATTR + ']');
    const inputsAntes = await page.evaluate(() => document.querySelectorAll('input').length);
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();
    await page.evaluate((attr) => { const e = document.querySelector('[' + attr + ']'); if (e) e.removeAttribute(attr); }, ATTR);
    try {
        await page.waitForFunction((p) => document.querySelectorAll('input').length !== p, { timeout: 15000 }, inputsAntes);
    } catch (_) {}
    return true;
}

/** Click en un .v-button por caption (case-insensitive). soloVentana → dentro del .v-window. */
async function clickCaption(page, regexSrc, soloVentana = false) {
    const handle = await page.evaluateHandle((rx, soloWin) => {
        const re = new RegExp(rx, 'i');
        const scope = soloWin ? (document.querySelector('.v-window') || document) : document;
        return Array.from(scope.querySelectorAll('.v-button')).find(b => {
            if (b.offsetParent === null) return false;
            const c = b.querySelector('.v-button-caption');
            return c && re.test(c.textContent || '');
        }) || null;
    }, regexSrc, soloVentana);
    const el = handle.asElement();
    if (!el) return false;
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();
    return true;
}

/**
 * Cantidad de registros de la tabla de detalle. Usa el "Total registros:" de AFIP: la tabla
 * muestra 15 por página, así que contar filas visibles nunca vería más de 15.
 * Si no está el rótulo, cae al conteo de filas visibles.
 */
async function contarFilas(page) {
    return await page.evaluate(() => {
        for (const fila of document.querySelectorAll('.v-formlayout-row')) {
            const rotulo = fila.querySelector('.v-formlayout-captioncell');
            if (rotulo && /total registros/i.test(rotulo.textContent || '')) {
                const n = parseInt((fila.querySelector('.v-formlayout-contentcell') || {}).textContent, 10);
                if (!isNaN(n)) return n;
            }
        }
        let max = 0;
        for (const t of document.querySelectorAll('.v-table')) {
            const n = t.querySelectorAll('.v-table-row, .v-table-row-odd').length;
            if (n > max) max = n;
        }
        return max;
    });
}

/**
 * Lee el panel "Estado de la carga" del popup de importación (relevado de la página guardada):
 *  - cargando: AFIP sigue leyendo ("Procesando 4096 bytes de 62920" o la barra de progreso,
 *    que se OCULTAN al terminar). "Lineas 78 (contando...)" NO sirve: quedó así aun terminada.
 *  - errores: textos .v-label-error ("Importación cancelada, registros con error: 1…",
 *    "Linea 1 - El largo de linea (91)…").
 *  - aviso: notificación Vaadin transitoria, si aparece.
 */
async function leerEstadoCarga(page) {
    return await page.evaluate(() => {
        const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
        const visible = (el) => el.offsetParent !== null && getComputedStyle(el).display !== 'none';
        const ventana = document.querySelector('.v-window');
        const noti = document.querySelector('.v-Notification');
        const aviso = noti && visible(noti) ? txt(noti) : '';
        if (!ventana) return { abierta: false, cargando: false, errores: [], aviso };
        const etiquetas = Array.from(ventana.querySelectorAll('.v-label')).filter(visible);
        const cargando = etiquetas.some(l => /procesando \d+ bytes/i.test(txt(l)))
            || Array.from(ventana.querySelectorAll('.v-progressindicator')).some(visible);
        const errores = Array.from(ventana.querySelectorAll('.v-label-error')).filter(visible).map(txt).filter(Boolean);
        return { abierta: true, cargando, errores, aviso };
    });
}

/** ¿El cartel es de ÉXITO (no un error)? */
const esAvisoOk = (t) => /correctamente|realizada|exitos|se import/i.test(t || '');

const ESPERA_CARGA_MS = 180000;   // 1210 renglones tardan; tope de seguridad, no reloj fijo
const MINIMO_SIN_SENAL_MS = 5000; // si AFIP no mostró actividad, no dar por terminado antes

/**
 * Espera la SEÑAL de fin de la carga (no segundos fijos): que AFIP deje de "contar/procesar",
 * o que muestre errores, o que el popup se cierre solo.
 */
async function esperarFinDeCarga(page) {
    const inicio = Date.now();
    let vioActividad = false;
    let estado = null;
    while (Date.now() - inicio < ESPERA_CARGA_MS) {
        estado = await leerEstadoCarga(page);
        if (estado.errores.length || !estado.abierta) return { ...estado, agotado: false };
        if (estado.cargando) vioActividad = true;
        else if (vioActividad || Date.now() - inicio > MINIMO_SIN_SENAL_MS) return { ...estado, agotado: false };
        await new Promise(r => setTimeout(r, 1000));
    }
    return { ...(estado || {}), agotado: true };
}

/** Cierra el popup de importación con su Aceptar y espera que desaparezca. */
async function cerrarPopup(page) {
    await clickCaption(page, 'aceptar', true);
    try {
        await page.waitForFunction(() => !document.querySelector('.v-window'), { timeout: 25000 });
        return true;
    } catch (_) { return false; }
}

/**
 * Sube UN .txt dentro del detalle ya abierto: IMPORTAR → uploadFile → esperar el fin de la
 * carga → Aceptar. Se llama UNA VEZ POR ARCHIVO sin salir del detalle.
 * Devuelve cuántos registros AGREGÓ (delta) y el texto de AFIP si hubo error.
 */
async function intentarImportar(page, ruta) {
    await nav.esperarVaadinIdle(page);                         // que el archivo anterior/​cartel se asiente
    const filasAntes = await contarFilas(page);
    if (!await clickCaption(page, 'importar')) return { ok: false, motivo: 'no apareció IMPORTAR', delta: 0 };
    try {
        await page.waitForSelector('.v-window input[type="file"], input.gwt-FileUpload', { timeout: 15000 });
    } catch (_) { /* lo informa el chequeo de abajo */ }

    const input = await page.$('.v-window input[type="file"], input.gwt-FileUpload');
    if (!input) return { ok: false, motivo: 'no apareció el input file', delta: 0 };
    await input.uploadFile(ruta);                              // NO clickear "Seleccionar archivo"

    const fin = await esperarFinDeCarga(page);
    const errores = fin.errores || [];
    const aviso = fin.aviso || '';
    const sinConfirmar = fin.abierta !== false && !await cerrarPopup(page);

    // La tabla se refresca después del Aceptar: esperar que el total suba (si no hubo error).
    let filasDespues = await contarFilas(page);
    if (!errores.length && filasDespues <= filasAntes) {
        try {
            await page.waitForFunction((antes) => {
                for (const fila of document.querySelectorAll('.v-formlayout-row')) {
                    const r = fila.querySelector('.v-formlayout-captioncell');
                    if (r && /total registros/i.test(r.textContent || '')) {
                        return parseInt((fila.querySelector('.v-formlayout-contentcell') || {}).textContent, 10) > antes;
                    }
                }
                return false;
            }, { timeout: 30000 }, filasAntes);
        } catch (_) { /* queda delta 0 → se informa */ }
        filasDespues = await contarFilas(page);
    }
    const delta = filasDespues - filasAntes;

    let textoError = '';
    if (errores.length) textoError = errores.join(' — ');
    else if (fin.agotado) textoError = `AFIP siguió cargando más de ${ESPERA_CARGA_MS / 60000} min`;
    else if (aviso && !esAvisoOk(aviso)) textoError = aviso;
    else if (delta <= 0 && !esAvisoOk(aviso)) textoError = `no agregó registros (+${delta})`;
    return { ok: true, sinConfirmar, filasAntes, filasDespues, delta, aviso: textoError || aviso, esError: !!textoError };
}

/**
 * Importa con UN reintento si AFIP cancela: probado a mano (2026-10-25), el mismo .txt de
 * 1210 renglones primero dio "Linea 1 - El largo de linea (91)…" y al repetir cargó entero.
 */
async function importarArchivo(page, ruta) {
    const r = await intentarImportar(page, ruta);
    if (!r.ok || !r.esError || r.delta > 0) return r;
    console.warn(`[DDJJ paso_18]     AFIP: ${r.aviso} → reintento una vez`);
    const r2 = await intentarImportar(page, ruta);
    return r2.ok ? { ...r2, reintentado: true } : r;
}

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} datos  { retenciones: { [etiqueta]: rutaTxt | rutaTxt[] } }
 */
async function ejecutar(page, datos) {
    const conf = (datos && datos.retenciones) || {};
    // Normalizamos: cada fila puede tener UN archivo (string) o VARIOS (array).
    const pendientes = Object.entries(conf)
        .map(([etiqueta, v]) => [etiqueta, (Array.isArray(v) ? v : [v]).filter(r => r && String(r).trim())])
        .filter(([, rutas]) => rutas.length);

    if (!pendientes.length) {
        console.log('[DDJJ paso_18] Sin retenciones configuradas.');
        return { success: true, cargadas: [], resumen: 'Retenciones: nada para cargar' };
    }
    console.log(`[DDJJ paso_18] Cargando ${pendientes.length} retención(es)...`);

    const cargadas = [];
    for (const [etiqueta, rutas] of pendientes) {
        console.log(`[DDJJ paso_18] === "${etiqueta}" (${rutas.length} archivo/s) ===`);
        try {
            if (!await abrirMas(page, etiqueta)) {
                console.warn(`[DDJJ paso_18] No encontré el "+" de "${etiqueta}".`);
                cargadas.push({ etiqueta, ok: false, motivo: 'no se encontró el "+"' });
                continue;
            }

            // Importar cada archivo SIN salir del detalle (se acumulan en la tabla).
            let subidos = 0, fallo = null;
            const problemas = [];       // archivos que fallaron (0 filas o cartel de error de AFIP)
            for (const ruta of rutas) {
                const nombre = ruta.split(/[\\/]/).pop();
                console.log(`[DDJJ paso_18]   ← ${nombre}`);
                const r = await importarArchivo(page, ruta);
                if (!r.ok) { fallo = r.motivo; console.warn(`[DDJJ paso_18]   ⚠️ ${r.motivo}`); break; }
                subidos++;
                console.log(`[DDJJ paso_18]     registros +${r.delta} (${r.filasAntes}→${r.filasDespues})${r.reintentado ? ' (al 2º intento)' : ''}${r.aviso ? ' | AFIP: ' + r.aviso : ''}`);
                if (r.esError) problemas.push(`${nombre}: ${r.aviso || `no agregó filas (+${r.delta})`}`);
            }

            const filas = await contarFilas(page);
            const okReal = subidos > 0 && !problemas.length;
            console.log(`[DDJJ paso_18] "${etiqueta}": ${subidos}/${rutas.length} archivo/s, tabla con ${filas} fila(s).`
                + (problemas.length ? ` ❌ PROBLEMAS: ${problemas.join(' | ')}` : ' ✅'));
            cargadas.push({ etiqueta, ok: okReal, subidos, total: rutas.length, filas, motivo: fallo, problemas });

            // Salir del detalle (una vez, ya con todos los archivos cargados).
            await nav.volverDetalle(page);
        } catch (e) {
            console.error(`[DDJJ paso_18] Error cargando "${etiqueta}": ${e.message}`);
            cargadas.push({ etiqueta, ok: false, motivo: e.message });
            await nav.volverDetalle(page).catch(() => {});
        }
    }

    const resumen = ['--- paso_18 cargar retenciones ---',
        ...cargadas.map(c => {
            if (c.motivo) return `  ${c.etiqueta}: ❌ ${c.motivo}`;
            const estado = c.ok ? '✅' : '❌';
            return `  ${c.etiqueta}: ${estado} ${c.subidos}/${c.total} archivo/s · ${c.filas} fila(s)`
                + (c.problemas && c.problemas.length ? '\n      ❌ ' + c.problemas.join('\n      ❌ ') : '');
        })
    ].join('\n');
    console.log('[DDJJ paso_18]\n' + resumen);
    return { success: true, cargadas, resumen };
}

module.exports = { ejecutar };
