/**
 * Paso: completar formulario de Consulta de Comprobantes y disparar "Buscar".
 *
 * Diferencias con el paso_X_ConsultaComprobantes original:
 *   1. Captura la nueva pestaña que abre AFIP al apretar "Buscar".
 *   2. Usa `datos.puntoDeVenta` (string, "00001"…) para elegir el pdv
 *      en `<select id="puntodeventa">`. Si no viene o no se encuentra,
 *      cae al fallback histórico (selectedIndex = 1).
 *
 * @param {import('puppeteer').Page} page - página del formulario de consulta.
 * @param {Object} datos - { consultaDesde, consultaHasta, puntoDeVenta?, tipoComprobante? }
 *                          fechas en formato 'dd/mm/yyyy'.
 *                          tipoComprobante: texto exacto del comprobante a filtrar
 *                          (ej. "Factura B"). Vacío/null = no se toca el select y
 *                          AFIP trae todos los comprobantes.
 * @returns {Promise<import('puppeteer').Page>} la nueva pestaña con la tabla de resultados.
 */
async function buscarComprobantesYCapturarTabla(page, datos) {
    console.log('  → Esperando formulario de consulta...');
    await page.waitForSelector('#fed', { timeout: 120000 });

    console.log(`  → Completando fechas y filtros (pdv solicitado=${datos.puntoDeVenta || '(fallback)'}, tipo=${datos.tipoComprobante || '(todos)'})...`);
    const resultadoForm = await page.evaluate(async (d) => {
        const setVal = (sel, val) => {
            const el = document.querySelector(sel);
            if (el) {
                el.value = val;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        };
        setVal('#fed', d.consultaDesde);
        setVal('#feh', d.consultaHasta);

        // Tipo de comprobante: SOLO si el usuario eligió uno. Matcheamos por
        // texto de la <option> (no por código interno) contra el texto pedido,
        // ambos normalizados (sin acentos/comillas raras, espacios colapsados).
        // Si no se eligió nada, no tocamos el select → AFIP trae todos.
        const tipo = { solicitado: d.tipoComprobante || null, encontrado: false };
        if (d.tipoComprobante) {
            const norm = (s) => String(s)
                .toLowerCase()
                .normalize('NFD').replace(/[̀-ͯ]/g, '')  // saca acentos
                .replace(/[“”«»]/g, '"')        // comillas dobles tipográficas
                .replace(/[‘’]/g, "'")                    // comillas simples tipográficas
                .replace(/\s+/g, ' ')
                .trim();
            const objetivo = norm(d.tipoComprobante);
            const sel = document.querySelector("[name='idTipoComprobante']");
            if (sel) {
                for (const opt of sel.options) {
                    if (norm(opt.textContent) === objetivo) {
                        sel.value = opt.value;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        tipo.encontrado = true;
                        break;
                    }
                }
            }
        }

        // Punto de venta: si el usuario eligió uno, buscamos la option cuyo
        // value normalizado coincida con d.puntoDeVenta ("00001"). Si NO eligió
        // (o no la encontramos), dejamos "Todos" → AFIP trae los comprobantes
        // de todos los puntos de venta. "Todos" es la opción de texto "Todos"
        // o, en su defecto, la primera (index 0).
        const pdv = document.querySelector('#puntodeventa');
        if (pdv && pdv.options.length > 0) {
            let elegido = null;
            if (d.puntoDeVenta) {
                const target = String(d.puntoDeVenta).trim();
                for (const opt of pdv.options) {
                    const v = String(opt.value || '').trim();
                    if (!v) continue;
                    const normalized = /^\d+$/.test(v) ? v.padStart(5, '0') : v;
                    if (normalized === target) {
                        elegido = opt.value;
                        break;
                    }
                }
            }
            if (elegido !== null) {
                pdv.value = elegido;
            } else {
                // "Todos": preferimos matchear por texto; si no, primera option.
                const todos = Array.from(pdv.options).find(o => /todos/i.test(o.textContent || ''));
                pdv.selectedIndex = todos ? todos.index : 0;
            }
            pdv.dispatchEvent(new Event('change', { bubbles: true }));
        }

        return { tipo };
    }, datos);

    // Si el usuario pidió un tipo concreto y no lo encontramos en el select de
    // AFIP, cortamos con error claro en vez de traer TODOS (que sería un
    // resultado equivocado silencioso).
    if (datos.tipoComprobante && !resultadoForm.tipo.encontrado) {
        throw new Error(`No se encontró el tipo de comprobante "${datos.tipoComprobante}" en el select de AFIP. ¿Cambió el texto en la página?`);
    }
    if (datos.tipoComprobante) {
        console.log(`  ✅ Tipo de comprobante seleccionado: "${datos.tipoComprobante}"`);
    }

    // Pequeña espera para que el DOM termine de reaccionar a los change
    await new Promise(r => setTimeout(r, 800));

    const browser = page.browser();

    // Suscribir captura de nueva pestaña ANTES de clickear
    const promesaNuevaPagina = new Promise((resolve, reject) => {
        const handle = async (target) => {
            try {
                const nueva = await target.page();
                if (nueva) {
                    browser.off('targetcreated', handle);
                    await nueva.bringToFront().catch(() => {});
                    resolve(nueva);
                }
            } catch (e) {
                reject(e);
            }
        };
        browser.on('targetcreated', handle);

        // Timeout de seguridad
        setTimeout(() => {
            browser.off('targetcreated', handle);
            reject(new Error('Timeout esperando nueva pestaña tras click en "Buscar"'));
        }, 60000);
    });

    // En paralelo, tambien escuchamos navegación en la misma pestaña por si
    // AFIP cambió comportamiento y los resultados vienen acá.
    const promesaNavegacionMisma = page
        .waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
        .then(() => page)
        .catch(() => null);

    console.log('  → Haciendo click en "Buscar"...');
    await page.evaluate(() => {
        const btn = document.querySelector("input[type='button'][value='Buscar']");
        if (btn) {
            btn.setAttribute('onclick', 'validarCampos();');
            btn.click();
        } else {
            throw new Error('No se encontró el botón "Buscar"');
        }
    });

    // Ganador: lo que ocurra primero (nueva pestaña o misma con tabla).
    const pageTabla = await Promise.race([
        promesaNuevaPagina,
        promesaNavegacionMisma.then(p => p || new Promise(() => {})) // ignorar null
    ]);

    if (!pageTabla) {
        throw new Error('No se obtuvo página con resultados tras "Buscar"');
    }

    console.log(`  ✅ Página de resultados capturada (${pageTabla.url()})`);

    // Esperar a que la pestaña de resultados ESTÉ LISTA (no a que aparezca un
    // botón "Ver" que, sin comprobantes, nunca llegaría → ahorramos los 30s).
    // La página de AFIP es server-rendered: cuando terminó de cargar, las filas
    // (o su ausencia) ya están en el DOM. Detectamos "lista" = readyState
    // complete + contenido real (no about:blank de la pestaña recién abierta).
    try {
        await pageTabla.waitForFunction(() => {
            if (document.readyState !== 'complete') return false;
            const hayVer = !!document.querySelector("input[type='button'][value='Ver']");
            const hayContenido = document.body && document.body.innerText.trim().length > 0;
            return hayVer || hayContenido;
        }, { timeout: 30000, polling: 'mutation' });
    } catch (_) {
        console.log('  ⚠️  La pestaña de resultados no estabilizó en 30s.');
    }

    // Contar filas una sola vez, ya con la página estable.
    const cantidad = await pageTabla
        .$$eval("input[type='button'][value='Ver']", els => els.length)
        .catch(() => 0);

    if (cantidad === 0) {
        console.log('  ℹ️  Sin comprobantes en el rango (0 filas).');
    } else {
        console.log(`  ✅ ${cantidad} comprobante(s) en la tabla.`);
    }

    return pageTabla;
}

module.exports = { buscarComprobantesYCapturarTabla };
