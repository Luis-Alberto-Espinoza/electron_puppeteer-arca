// flujo_buscar.js
// Recuperar borrador: el LANDING de "Mis Aplicaciones Web" ES el form de búsqueda
// (Organismo/Formulario/Período/Estado/Desde/Hasta). Seteamos filtros (reusando paso_6) →
// "ACEPTAR" (dispara la búsqueda, NO "Buscar" que es el tab) → lista de resultados.
//
// Cada fila tiene un dropdown "Acciones" (v-filterselect): click en .v-filterselect-button
// abre el menú Ver / Editar / Borrar (.gwt-MenuItem). Para recuperar y seguir → "Editar".
//
// Estado de hoy: parsea la lista + (si hay 1 resultado) abre "Editar" y vuelca dónde cae
// (relevamiento del punto de "continuar editando"). El login lo hizo el manager.

const paso1 = require('../codigoXpagina/paso_1_abrirMisAplicaciones.js');
const paso6 = require('../codigoXpagina/paso_6_completarFormularioDDJJ.js');
const nav = require('../codigoXpagina/_navegacion.js');
const { inspeccionar } = require('../codigoXpagina/_inspeccionar.js');

/** Vuelca las tablas de resultados (headers + filas; marca botones/íconos por celda). */
async function volcarResultados(page) {
    return await page.evaluate(() => {
        const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
        const celda = (c) => {
            const b = c.querySelector('.v-button-caption');
            const img = c.querySelector('img');
            if (b || img) return `[btn:${(b && txt(b)) || (img && (img.getAttribute('src') || '').split('/').pop()) || '?'}]`;
            return txt(c);
        };
        return Array.from(document.querySelectorAll('.v-table')).map(t => {
            let headers = Array.from(t.querySelectorAll('.v-table-header-cell .v-table-caption-container')).map(txt).filter(Boolean);
            if (!headers.length) headers = Array.from(t.querySelectorAll('.v-table-header-cell')).map(txt).filter(Boolean);
            const filas = Array.from(t.querySelectorAll('.v-table-row, .v-table-row-odd')).slice(0, 50)
                .map(tr => Array.from(tr.querySelectorAll('.v-table-cell-content')).map(celda));
            return { headers, filas };
        }).filter(t => t.headers.length || t.filas.length);
    });
}

/** De las celdas crudas arma objetos {cuit, formulario, periodo, estado, fechaMod} por match
 *  (robusto al orden de columnas). Descarta filas que no parecen una DDJJ. */
function parseResultados(tablas) {
    const out = [];
    for (const t of tablas) {
        for (const cells of t.filas) {
            const find = (re) => cells.find(c => re.test(c)) || '';
            const periodo = cells.find(c => /^\d{6}$/.test(c)) || '';
            const estado = find(/borrador|presentad|en proceso|con error/i);
            if (!periodo && !estado) continue;     // no parece fila de DDJJ
            out.push({
                cuit: cells.find(c => /^\d{11}$/.test(c)) || '',
                formulario: find(/F\.\d/i),
                periodo,
                estado,
                fechaMod: find(/\d{2}-\d{2}-\d{4}/),
                cells
            });
        }
    }
    return out;
}

/** Abre el dropdown "Acciones" de la fila `idx` y clickea la opción (Ver/Editar/Borrar). */
async function abrirAccion(page, idx, accion) {
    const marcado = await page.evaluate((i) => {
        const rows = Array.from(document.querySelectorAll('.v-table-row, .v-table-row-odd'));
        const row = rows[i];
        if (!row) return false;
        const btn = row.querySelector('.v-filterselect-button');
        if (!btn) return false;
        document.querySelectorAll('[data-ddjj-acc]').forEach(e => e.removeAttribute('data-ddjj-acc'));
        btn.setAttribute('data-ddjj-acc', '1');
        return true;
    }, idx);
    if (!marcado) return { ok: false, motivo: 'sin dropdown de Acciones en la fila' };

    const el = await page.$('[data-ddjj-acc]');
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();
    await page.waitForFunction(() => {
        const p = document.querySelector('.v-filterselect-suggestpopup');
        return p && p.querySelectorAll('.gwt-MenuItem').length > 0;
    }, { timeout: 10000 }).catch(() => {});

    const opciones = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.v-filterselect-suggestpopup .gwt-MenuItem')).map(m => (m.textContent || '').trim()).filter(Boolean));
    console.log('[DDJJ flujo_buscar] Acciones disponibles:', opciones.join(' · ') || '(ninguna)');

    const handle = await page.evaluateHandle((acc) => {
        return Array.from(document.querySelectorAll('.v-filterselect-suggestpopup .gwt-MenuItem'))
            .find(m => new RegExp(acc, 'i').test(m.textContent || '')) || null;
    }, accion);
    const item = handle.asElement();
    if (!item) return { ok: false, opciones, motivo: `no apareció la opción "${accion}"` };
    await item.click();
    return { ok: true, opciones, accion };
}

/** Confirma el popup "¿Realmente quiere borrar?" clickeando "Si"; captura el mensaje. */
async function confirmarBorrado(page) {
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.v-button')).some(b => {
        if (b.offsetParent === null) return false;
        const c = b.querySelector('.v-button-caption');
        return c && /^si$/i.test((c.textContent || '').trim());
    }), { timeout: 8000 }).catch(() => {});

    const h = await page.evaluateHandle(() => Array.from(document.querySelectorAll('.v-button')).find(b => {
        if (b.offsetParent === null) return false;
        const c = b.querySelector('.v-button-caption');
        return c && /^si$/i.test((c.textContent || '').trim());
    }) || null);
    const el = h.asElement();
    if (!el) return { ok: false, motivo: 'no apareció la confirmación Si/No' };
    try { await el.scrollIntoView(); } catch (_) {}
    await el.click();

    // Capturar mensaje resultante (transitorio).
    let mensaje = '';
    const fin = Date.now() + 6000;
    while (Date.now() < fin) {
        mensaje = await page.evaluate(() => {
            const n = document.querySelector('.v-Notification, .v-label-errorDesc, .errorDesc');
            return n && n.offsetParent !== null ? (n.textContent || '').replace(/\s+/g, ' ').trim() : '';
        });
        if (mensaje) break;
        await new Promise(r => setTimeout(r, 400));
    }
    return { ok: true, mensaje };
}

/**
 * @param {import('puppeteer').Page} page
 * @param {Object} payload      { cliente, empresaObjetivo, organismo, formulario, periodo, accion }
 * @param {Object} credenciales { usuario, contrasena }
 */
async function ejecutar(page, payload, credenciales) {
    const { organismo, formulario, periodo } = payload || {};
    const accionElegida = (payload && payload.accion) || 'editar';   // Ver | Editar | Borrar
    try {
        const fenixPage = await paso1.ejecutar(page, credenciales);

        // Ya estamos en el form de BÚSQUEDA por default. Seteamos filtros (Estado en blanco
        // → todos los estados del período). La búsqueda se dispara con "ACEPTAR".
        const resForm = await paso6.ejecutar(fenixPage, { organismo, formulario, periodo });
        console.log(`[DDJJ flujo_buscar] Filtros: "${resForm.valorOrganismo}" / "${resForm.valorFormulario}" / "${resForm.valorPeriodo}"`);

        console.log('[DDJJ flujo_buscar] Click "Aceptar" (inicia la búsqueda)...');
        await nav.esperarVaadinIdle(fenixPage);
        const handle = await fenixPage.evaluateHandle(() => {
            const btns = Array.from(document.querySelectorAll('.v-button')).filter(b => {
                if (b.offsetParent === null) return false;
                const c = b.querySelector('.v-button-caption');
                return c && /^aceptar$/i.test((c.textContent || '').trim());
            });
            return btns.find(b => b.className.includes('eFormAceptarButton')) || btns[0] || null;
        });
        const el = handle.asElement();
        if (!el) throw new Error('No se encontró el botón "Aceptar" de la búsqueda');
        try { await el.scrollIntoView(); } catch (_) {}
        await el.click();
        await nav.esperarVaadinIdle(fenixPage);
        await new Promise(r => setTimeout(r, 2000));

        // Resultados → estructurados.
        const tablas = await volcarResultados(fenixPage);
        const resultados = parseResultados(tablas);
        console.log(`[DDJJ flujo_buscar] ${resultados.length} resultado(s):`);
        resultados.forEach((r, i) => console.log(`   [${i}] ${r.estado || '?'} · período ${r.periodo} · ${r.formulario} · mod ${r.fechaMod} · CUIT ${r.cuit}`));

        // Regla: si hay UN resultado, aplicamos la acción elegida (default "Editar" = recuperar).
        // Si hay varios, devolvemos la lista para que el usuario elija (no auto-actuamos).
        let accion = null, landing = null;
        if (resultados.length === 1) {
            console.log(`[DDJJ flujo_buscar] 1 resultado → acción "${accionElegida}"...`);
            accion = await abrirAccion(fenixPage, 0, accionElegida);
            if (accion.ok) {
                await nav.esperarVaadinIdle(fenixPage);
                await new Promise(r => setTimeout(r, 1500));

                if (/borrar/i.test(accionElegida)) {
                    // Borrar abre confirmación Si/No → confirmamos con "Si".
                    const conf = await confirmarBorrado(fenixPage);
                    accion.borrado = conf.ok;
                    accion.mensaje = conf.mensaje;
                    console.log(conf.ok ? `[DDJJ flujo_buscar] Borrado confirmado (Sí). ${conf.mensaje || ''}`
                        : `[DDJJ flujo_buscar] No se confirmó el borrado: ${conf.motivo}`);
                } else {
                    // Ver / Editar → abre el documento; volcamos dónde cae.
                    await new Promise(r => setTimeout(r, 1000));
                    landing = await nav.volcarPagina(fenixPage, `flujo_buscar — tras "${accionElegida}"`);
                    console.log('[DDJJ flujo_buscar]\n' + landing.resumen);
                    await inspeccionar(fenixPage, `tras ${accionElegida}`);
                }
            } else {
                console.warn(`[DDJJ flujo_buscar] No pude aplicar "${accionElegida}":`, accion.motivo);
            }
        }

        const resumen = [
            '--- flujo_buscar ---',
            `Filtros: ${resForm.valorOrganismo} / ${resForm.valorFormulario} / ${resForm.valorPeriodo}`,
            `Resultados: ${resultados.length}`,
            ...resultados.map((r, i) => `  [${i}] ${r.estado} · ${r.periodo} · ${r.formulario} · mod ${r.fechaMod}`),
            accion
                ? (accion.ok
                    ? (/borrar/i.test(accionElegida)
                        ? `Acción "borrar": ${accion.borrado ? '✅ borrado confirmado' : '⚠️ no se confirmó'} ${accion.mensaje || ''}`
                        : `Acción "${accionElegida}": ✅ aplicada (abierto en el navegador)`)
                    : `Acción "${accionElegida}": ❌ ${accion.motivo}`)
                : (resultados.length > 1 ? `${resultados.length} resultados → elegí en la lista (no se auto-aplicó acción).` : '')
        ].filter(Boolean).join('\n');

        return {
            success: true,
            modo: 'buscar',
            cliente: payload && payload.cliente,
            url: fenixPage.url(),
            filtros: resForm,
            resultados,
            accion,
            landing,
            resumen
        };
    } catch (error) {
        console.error('[DDJJ flujo_buscar] Error:', error);
        return { success: false, error: 'FLUJO_ERROR', message: error.message, stack: error.stack };
    }
}

module.exports = { ejecutar };
