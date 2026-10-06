/**
 * PASO 8: Extraer una sección del detalle del plan
 *
 * En nuevos_planes.aspx (detalle del plan) hay, además de "Ver Pagos", tres
 * botones que hacen postback y muestran una tabla:
 *   - Plan de Pago                 → #tableDetallePlanPago (cuotas, 1° y 2° vto)
 *   - Obligaciones Impositivas     → table[id^=tableDetalleDeuda] (1 fila por obligación)
 *   - Obligaciones Previsionales   → idem
 * No todos los planes tienen los tres botones → noDisponible, no es un error.
 *
 * Igual que "Ver Pagos" (paso_5), leemos la tabla y armamos PDF + Excel propios
 * (paso_9 el PDF, afip/planesDePago/excelPlan.js el Excel por plan). NO usamos el "Imprimir" de AFIP: es printThis (iframe + print()
 * nativo), el diálogo de Chrome congela Puppeteer y además no da Excel.
 * Las tablas tienen paginación del lado del navegador ("paginar"), pero todas
 * las filas están en el DOM: leemos por DOM, no por lo visible.
 *
 * Devuelve un "modelo" genérico que paso_9 sabe dibujar:
 *   { cabecera, columnas: [{ titulo, numero }], bloques: [{ filas: [[...]], total }], mergeCols }
 * Un bloque = filas que comparten las celdas de mergeCols (rowspan de AFIP).
 */

const SECCIONES = [
    {
        id: 'planPago', tipo: 'planPago',
        boton: '#ContentPlaceHolder1_btnPlanPago', tabla: '#tableDetallePlanPago',
        prefijo: 'PlanDePago', etiqueta: 'Plan de Pago', hoja: 'Plan de Pago'
    },
    {
        id: 'obligImp', tipo: 'obligaciones',
        boton: '#ContentPlaceHolder1_btnObligImp', tabla: 'table[id^="tableDetalleDeuda"]',
        prefijo: 'ObligImpositivas', etiqueta: 'Obligaciones Impositivas', hoja: 'Oblig. Impositivas'
    },
    {
        id: 'obligPrev', tipo: 'obligaciones',
        boton: '#ContentPlaceHolder1_btnObligPrev', tabla: 'table[id^="tableDetalleDeuda"]',
        prefijo: 'ObligPrevisionales', etiqueta: 'Obligaciones Previsionales', hoja: 'Oblig. Previsionales'
    }
];

const TIMEOUT_BOTON_SECCION = 3000;   // el detalle ya cargó (paso_3): si no está, el plan no lo tiene
const TIMEOUT_TABLA = 15000;

async function ejecutar(page, seccion, plan) {
    try {
        console.log(`  → Paso 8: "${seccion.etiqueta}" del plan #${plan.numero}...`);

        // 1. ¿El plan tiene esta sección?
        const hayBoton = await page.waitForSelector(seccion.boton, { timeout: TIMEOUT_BOTON_SECCION })
            .then(() => true).catch(() => false);
        if (!hayBoton) {
            console.log(`  ℹ️ El plan #${plan.numero} no tiene "${seccion.etiqueta}". Sigo.`);
            return { success: false, noDisponible: true, message: `El plan no tiene "${seccion.etiqueta}"` };
        }

        // 2. Click en la sección (postback ASPX → navegación)
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
            page.$eval(seccion.boton, el => el.click())
        ]);

        // 3. Esperar la tabla
        const hayTabla = await page.waitForSelector(seccion.tabla, { timeout: TIMEOUT_TABLA })
            .then(() => true).catch(() => false);
        if (!hayTabla) {
            console.log(`  ⚠️ "${seccion.etiqueta}": no apareció la tabla.`);
            return { success: false, sinTabla: true, message: 'No apareció la tabla' };
        }

        // 4. Leer cabecera + tabla
        const modelo = await page.evaluate((tipo, selTabla) => {
            const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
            const porId = (id) => txt(document.getElementById(id));

            const cabecera = {
                descripcion: porId('ContentPlaceHolder1_CabeceraPlanesEnviados_cab_tituloPlan'),
                nroPlan: porId('ContentPlaceHolder1_CabeceraPlanesEnviados_cab_nroPlan'),
                fechaConsolidacion: porId('ContentPlaceHolder1_CabeceraPlanesEnviados_cab_fechaConsolidacion'),
                tipoPlan: porId('ContentPlaceHolder1_CabeceraPlanesEnviados_cab_tipoPlan'),
                nombre: porId('ContentPlaceHolder1_nomAp').replace(/,\s*$/, '')
            };

            const tabla = document.querySelector(selTabla);
            const filasRpt = Array.from(tabla.querySelectorAll('tbody tr[id*="trRpt_"]'));

            if (tipo === 'planPago') {
                // Fila con tdCuota no vacío = arranca cuota; las siguientes son
                // sus otros vencimientos (AFIP las une con rowspan).
                const celda = (tr, nombre) => txt(tr.querySelector(`td[id*="_${nombre}_"]`));
                const bloques = [];
                for (const tr of filasRpt) {
                    const cuota = celda(tr, 'tdCuota');
                    const vto = [
                        celda(tr, 'tdInteresFinanciero'),
                        celda(tr, 'tdInteresResarcitorio'),
                        celda(tr, 'tdTotal'),
                        celda(tr, 'tdFechaVencimiento')
                    ];
                    if (cuota || bloques.length === 0) {
                        bloques.push({ filas: [[cuota, celda(tr, 'tdCapital'), ...vto]], total: false });
                    } else {
                        bloques[bloques.length - 1].filas.push(['', '', ...vto]);
                    }
                }

                const totales = { filas: [], total: true };
                const capTotal = porId('ContentPlaceHolder1_tdCapitalTotal');
                if (capTotal) {
                    totales.filas.push(['Totales', capTotal,
                        porId('ContentPlaceHolder1_tdInteresFinancieroTotal1'),
                        porId('ContentPlaceHolder1_tdInteresResarcitorioTotal1'),
                        porId('ContentPlaceHolder1_tdTotalTotal1'),
                        '1° Vencimiento']);
                    if (document.getElementById('ContentPlaceHolder1_tr_2dovto')) {
                        totales.filas.push(['', '',
                            porId('ContentPlaceHolder1_tdInteresFinancieroTotal2'),
                            porId('ContentPlaceHolder1_tdInteresResarcitorioTotal2'),
                            porId('ContentPlaceHolder1_tdTotalTotal2'),
                            '2° Vencimiento']);
                    }
                    bloques.push(totales);
                }

                return {
                    cabecera,
                    columnas: [
                        { titulo: 'Cuota N°' }, { titulo: 'Capital ($)', numero: true },
                        { titulo: 'Interés Financiero ($)', numero: true }, { titulo: 'Interés Resarcitorio ($)', numero: true },
                        { titulo: 'Total ($)', numero: true }, { titulo: 'Fecha Vencimiento' }
                    ],
                    bloques,
                    mergeCols: [0, 1]
                };
            }

            // Obligaciones: tabla plana. La 1ª columna ("Detalle") es un link → se omite.
            const titulos = Array.from(tabla.querySelectorAll('thead th')).map(txt).slice(1);
            const bloques = filasRpt.map(tr => ({
                filas: [Array.from(tr.querySelectorAll('td')).slice(1).map(txt)],
                total: false
            }));
            return {
                cabecera,
                columnas: titulos.map(t => ({ titulo: t, numero: /\(\$\)/.test(t) })),
                bloques,
                mergeCols: []
            };
        }, seccion.tipo, seccion.tabla);

        if (seccion.tipo === 'obligaciones') agregarTotalesObligaciones(modelo);

        const cantFilas = modelo.bloques.filter(b => !b.total).length;
        console.log(`  ✅ ${seccion.etiqueta}: ${cantFilas} fila(s) leídas.`);
        return { success: true, modelo };

    } catch (error) {
        console.error(`  ❌ Error en paso_8 (${seccion.etiqueta}):`, error.message);
        return { success: false, message: error.message };
    }
}

// AFIP no muestra totales en Obligaciones: sumamos las columnas en $.
function agregarTotalesObligaciones(modelo) {
    const { parseNumero } = require('../../../../afip/planesDePago/datosResumenBuilder.js');
    const filas = modelo.bloques.filter(b => !b.total).map(b => b.filas[0]);
    if (filas.length === 0) return;

    const fila = modelo.columnas.map((col, c) => {
        if (!col.numero) return '';
        const suma = filas.reduce((acc, f) => acc + parseNumero(f[c]), 0);
        return suma.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
    fila[0] = 'Totales';
    modelo.bloques.push({ filas: [fila], total: true });
}

module.exports = { ejecutar, SECCIONES };
