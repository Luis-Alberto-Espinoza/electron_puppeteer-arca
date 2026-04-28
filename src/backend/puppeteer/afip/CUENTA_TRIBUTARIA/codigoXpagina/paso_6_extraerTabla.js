// PASO 6: Extraer la tabla de deudas del SCT.
//   - Modo 'completo'     : setea "Todos" y extrae todas las filas + totales.
//   - Modo 'soloPaginar'  : solo setea "Todos" (no lee datos); útil en 2da pasada / Flujo B.
//
// Toda la tabla y el select de paginación viven dentro del iframe del SCT.

const { getSctFrame } = require('./_helpers.js');

// Bootstrap-Vue renderiza TODAS las tabs (Vencimientos, Deudas, DDJJ) en el DOM
// al mismo tiempo. Cada una tiene su propio <select> de paginación, su propia
// <table> y sus propias <tr>. Si no scope-amos a .tab-pane.active terminamos
// operando sobre la tab equivocada (típicamente la primera del DOM).
const SCOPE_TAB_ACTIVA = '.tab-pane.active';
const SELECTOR_SELECT_FILAS = `${SCOPE_TAB_ACTIVA} select.form-control.form-control-sm`;
const SELECTOR_TABLA = `${SCOPE_TAB_ACTIVA} table.table.b-table`;
const SELECTOR_FILAS = `${SCOPE_TAB_ACTIVA} tbody tr[role="row"]`;

function parseImporteArgentino(txt) {
    if (txt == null) return null;
    const raw = String(txt).trim();
    if (!raw) return null;
    // Limpia símbolos y espacios.
    const limpio = raw.replace(/[^\d,.\-]/g, '');
    if (!limpio) return null;
    // Formato arg: 1.234,56 → 1234.56
    const sinMiles = limpio.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(sinMiles);
    return Number.isFinite(n) ? n : null;
}

async function ponerTodos(frame) {
    await frame.waitForSelector(SELECTOR_SELECT_FILAS, { timeout: 15000 });

    // Contar filas antes para detectar re-render.
    const filasAntes = await frame.evaluate((selFilas) => {
        return document.querySelectorAll(selFilas).length;
    }, SELECTOR_FILAS);

    // Usar frame.select() nativo de Puppeteer: simula la interacción real del usuario
    // (focus + change + input). Setear select.value a mano no propaga bien con Vue.
    let valoresSeteados = [];
    try {
        valoresSeteados = await frame.select(SELECTOR_SELECT_FILAS, '-1');
    } catch (e) {
        throw new Error(`No se pudo setear paginación a "Todos" (-1): ${e.message}`);
    }

    if (!valoresSeteados.includes('-1')) {
        throw new Error('La opción "Todos" (-1) no se aplicó al select de paginación');
    }

    // Esperar a que la tabla se estabilice tras el re-render.
    // No exigimos una cantidad mínima: el badge puede no coincidir con la cantidad
    // real de filas (AFIP a veces agrupa). Solo esperamos a que pare de cambiar.
    await frame.waitForFunction((selFilas, prev) => {
        const actual = document.querySelectorAll(selFilas).length;
        return actual !== prev || actual > 0;
    }, { timeout: 10000 }, SELECTOR_FILAS, filasAntes);

    // Pequeña espera adicional para estabilización visual.
    await new Promise(r => setTimeout(r, 800));
}

async function extraerFilas(frame) {
    return await frame.evaluate(() => {
        const tds = (tr, idx) => tr.querySelector(`td[aria-colindex="${idx}"]`);
        const text = (el) => (el ? (el.textContent || '').trim() : '');

        const filas = Array.from(document.querySelectorAll('.tab-pane.active tbody tr[role="row"]'));
        return filas.map((tr) => {
            const chk = tr.querySelector('input[type="checkbox"]');
            return {
                id: chk ? chk.id : null,
                vencida: tr.classList.contains('vencida'),
                establecimiento: text(tds(tr, 2)),
                impuesto: text(tds(tr, 4)),
                concepto: text(tds(tr, 5)),
                subconcepto: text(tds(tr, 6)),
                periodo: text(tds(tr, 7)),
                antCuota: text(tds(tr, 8)),
                vencimiento: text(tds(tr, 9)),
                saldoRaw: text(tds(tr, 10)),
                intResarcitorioRaw: (() => {
                    const td = tds(tr, 11);
                    if (!td) return '';
                    const inner = td.querySelector('div[id^="tooltip-rs-"]') || td;
                    return text(inner);
                })(),
                intPunitorioRaw: (() => {
                    const td = tds(tr, 12);
                    if (!td) return '';
                    const inner = td.querySelector('div[id^="tooltip-pun-"]') || td;
                    return text(inner);
                })()
            };
        });
    });
}

async function extraerTotales(frame) {
    return await frame.evaluate(() => {
        const text = (el) => (el ? (el.textContent || '').trim() : '');
        const filasFoot = Array.from(document.querySelectorAll('.tab-pane.active tfoot tr'));
        if (filasFoot.length === 0) return { subtotalRaw: '', totalRaw: '' };

        const primera = filasFoot[0];
        const ultima = filasFoot[filasFoot.length - 1];
        const subtotalRaw = text(primera.querySelector('td.text-right'));
        const totalRaw = text(ultima.querySelector('td.text-right'));
        return { subtotalRaw, totalRaw };
    });
}

async function ejecutar(page, options = {}) {
    try {
        const { modo = 'completo' } = options;
        console.log(`  → [SCT] Extrayendo tabla (modo=${modo})...`);

        const frame = await getSctFrame(page);

        await frame.waitForSelector(SELECTOR_TABLA, { timeout: 15000 });
        await ponerTodos(frame);

        if (modo === 'soloPaginar') {
            console.log('  ✅ [SCT] Paginación seteada a "Todos" (modo soloPaginar)');
            return { success: true, modo };
        }

        const filasRaw = await extraerFilas(frame);
        const totalesRaw = await extraerTotales(frame);

        const deudas = filasRaw.map((f) => ({
            id: f.id,
            vencida: f.vencida,
            establecimiento: f.establecimiento,
            impuesto: f.impuesto,
            concepto: f.concepto,
            subconcepto: f.subconcepto,
            periodo: f.periodo,
            antCuota: f.antCuota,
            vencimiento: f.vencimiento,
            saldo: parseImporteArgentino(f.saldoRaw),
            saldoRaw: f.saldoRaw,
            intResarcitorio: parseImporteArgentino(f.intResarcitorioRaw),
            intResarcitorioRaw: f.intResarcitorioRaw,
            intPunitorio: parseImporteArgentino(f.intPunitorioRaw),
            intPunitorioRaw: f.intPunitorioRaw
        }));

        const totales = {
            subtotal: parseImporteArgentino(totalesRaw.subtotalRaw),
            subtotalRaw: totalesRaw.subtotalRaw,
            total: parseImporteArgentino(totalesRaw.totalRaw),
            totalRaw: totalesRaw.totalRaw
        };

        console.log(`  ✅ [SCT] Filas extraídas: ${deudas.length}. Total: ${totales.totalRaw || 'N/A'}`);
        return { success: true, modo, deudas, totales, cantidad: deudas.length };

    } catch (error) {
        console.error('  ❌ [SCT] Error en paso_6_extraerTabla:', error);
        return { success: false, message: error.message };
    }
}

module.exports = { ejecutar, parseImporteArgentino };
