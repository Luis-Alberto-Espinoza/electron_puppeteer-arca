// Flujo de automatización para Planes de Pago AFIP
// Login → Buscar "mis facilidades" → Seleccionar CUIT → Planes vigentes → Detalle → Ver Pagos → Extraer + PDF
// → por cada plan, además: Plan de Pago / Oblig. Impositivas / Oblig. Previsionales → leer tabla (paso_8)
//   → PDF oficial de AFIP (paso_8b); si falla, PDF propio (paso_9)
// → un Excel por plan con una hoja por sección (excelPlan)

const paso_1_seleccionarCuit = require('../codigoXpagina/paso_1_seleccionarCuit.js');
const paso_2_obtenerPlanesVigentes = require('../codigoXpagina/paso_2_obtenerPlanesVigentes.js');
const paso_3_clickDetallePlan = require('../codigoXpagina/paso_3_clickDetallePlan.js');
const paso_4_clickVerPagos = require('../codigoXpagina/paso_4_clickVerPagos.js');
const paso_5_extraerTablaPagos = require('../codigoXpagina/paso_5_extraerTablaPagos.js');
const paso_6_descargarPDF = require('../codigoXpagina/paso_6_descargarPDF.js');
const paso_8_extraerSeccion = require('../codigoXpagina/paso_8_extraerSeccion.js');
const paso_8b_pdfAfipSeccion = require('../codigoXpagina/paso_8b_pdfAfipSeccion.js');
const paso_9_generarPdfSeccion = require('../codigoXpagina/paso_9_generarPdfSeccion.js');
const datosResumenBuilder = require('../../../../afip/planesDePago/datosResumenBuilder.js');
const resumenClienteExcel = require('../../../../afip/planesDePago/resumenClienteExcel.js');
const validarConsolidado = require('../../../../afip/planesDePago/validarConsolidado.js');
const excelPlan = require('../../../../afip/planesDePago/excelPlan.js');

const { getDownloadPathContribuyente } = require('../../../../cliente/carpetaContribuyente.js');

const URL_SEGUIMIENTO = 'https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MisFacilidadesNet/app/contribuyente/seguimiento_presentacion.aspx';

/**
 * Ejecuta el flujo completo de consulta de Planes de Pago
 * @param {import('puppeteer').Page} page - Página del navegador (ya logueado)
 * @param {Object} usuario - Datos del usuario representante
 * @param {Object} cuitConsulta - { cuit, alias } del CUIT a consultar
 * @param {string} downloadsPath - Ruta para descargas
 * @returns {Object} Resultado con datos de todos los planes vigentes
 */
async function ejecutarFlujo(page, usuario, cuitConsulta, downloadsPath) {
    try {
        console.log(`\n[PlanesDePago Flujo] === Iniciando flujo para ${cuitConsulta.alias} (${cuitConsulta.cuit}) ===`);

        // =====================================================
        // Paso 0: Buscar "mis facilidades" en el buscador AFIP
        // =====================================================
        console.log('[PlanesDePago Flujo] Paso 0: Buscando "mis facilidades"...');
        const paginaServicio = await buscarMisFacilidades(page);

        // =====================================================
        // Paso 1: Seleccionar CUIT si corresponde
        // =====================================================
        const resultadoPaso1 = await paso_1_seleccionarCuit.ejecutar(paginaServicio, cuitConsulta.cuit);
        if (!resultadoPaso1.success) {
            return { success: false, message: `Error seleccionando CUIT: ${resultadoPaso1.message}` };
        }

        // =====================================================
        // Paso 2: Obtener planes vigentes (con paginación)
        // =====================================================
        const resultadoPaso2 = await paso_2_obtenerPlanesVigentes.ejecutar(paginaServicio);
        if (!resultadoPaso2.success) {
            return { success: false, message: 'Error obteniendo planes vigentes' };
        }

        if (resultadoPaso2.sinPlanesVigentes) {
            return {
                success: true,
                sinPlanesVigentes: true,
                message: `No se encontraron planes vigentes para ${cuitConsulta.alias} (${cuitConsulta.cuit})`,
                cuitConsulta,
                planes: []
            };
        }

        const planes = resultadoPaso2.planes;
        const resultadosPlanes = [];

        // =====================================================
        // Paso 3-6: Para cada plan vigente
        // =====================================================
        for (let i = 0; i < planes.length; i++) {
            const plan = planes[i];
            console.log(`\n[PlanesDePago Flujo] --- Plan ${i + 1}/${planes.length}: #${plan.numero} ---`);

            try {
                // Asegurar que estamos en seguimiento_presentacion.aspx con la tabla visible
                await asegurarEnListaPlanes(paginaServicio);

                // Paso 3: Click en Detalle del plan
                await paso_3_clickDetallePlan.ejecutar(paginaServicio, plan);

                // Paso 4: Click en Ver Pagos
                await paso_4_clickVerPagos.ejecutar(paginaServicio);

                // Paso 5: Extraer datos de la tabla de pagos
                const resultadoExtraccion = await paso_5_extraerTablaPagos.ejecutar(paginaServicio);

                // Paso 6: PDF de Pagos. Primero el oficial de AFIP (Imprimir de
                // detalle_pagos.aspx, paso_8b); si falla, el propio (paso_6).
                // En la tabla de AFIP hay una fila trRpt_ por cuota.
                let resultadoPDF = { success: false };
                if (resultadoExtraccion.success) {
                    const oficial = await paso_8b_pdfAfipSeccion.ejecutar(
                        paginaServicio, { etiqueta: 'Pagos', prefijo: 'Pagos' }, plan,
                        cuitConsulta.cuit, downloadsPath, resultadoExtraccion.cuotasAgrupadas.length
                    );
                    if (oficial.success) {
                        resultadoPDF = {
                            success: true,
                            pdfPath: oficial.pdf.path,
                            pdfNombre: oficial.pdf.nombre,
                            downloadDir: oficial.pdf.downloadDir,
                            origen: 'afip'
                        };
                    }
                }
                if (!resultadoPDF.success) {
                    resultadoPDF = await paso_6_descargarPDF.ejecutar(
                        resultadoExtraccion,  // datos de la tabla (cuotasAgrupadas + totales)
                        plan,                 // info del plan (numero, cuotas, tipo, etc.)
                        usuario,              // representante
                        cuitConsulta.cuit,    // CUIT consultado
                        downloadsPath         // ruta descargas
                    );
                    resultadoPDF.origen = 'propio';
                }

                // Hojas del Excel por plan (se escribe al final, con todas las secciones)
                const hojasExcel = [];
                if (resultadoExtraccion.success) {
                    hojasExcel.push({
                        nombre: 'Pagos',
                        titulo: `Detalle de Pagos - Plan N° ${plan.numero}`,
                        modelo: excelPlan.modeloPagos(resultadoExtraccion)
                    });
                }

                // datosResumen: métricas derivadas (usadas por resumen cliente + consolidado)
                let datosResumen = null;
                try {
                    datosResumen = datosResumenBuilder.construir(
                        resultadoExtraccion,
                        plan,
                        usuario,
                        cuitConsulta.cuit
                    );
                } catch (e) {
                    console.error('  ⚠️ No se pudo construir datosResumen:', e.message);
                }

                // Paso 8-9: Plan de Pago / Obligaciones → leer tabla → PDF + Excel.
                // Cada sección arranca desde el detalle del plan (nuevos_planes.aspx).
                const secciones = [];
                const modelos = {};
                for (const seccion of paso_8_extraerSeccion.SECCIONES) {
                    try {
                        await asegurarEnDetallePlan(paginaServicio, plan, seccion.boton);
                        const extraccion = await paso_8_extraerSeccion.ejecutar(paginaServicio, seccion, plan);
                        if (!extraccion.success) {
                            secciones.push({
                                seccion: seccion.id,
                                success: false,
                                noDisponible: !!extraccion.noDisponible,
                                error: extraccion.noDisponible ? null : extraccion.message
                            });
                            continue;
                        }
                        modelos[seccion.id] = extraccion.modelo;
                        hojasExcel.push({
                            nombre: seccion.hoja,
                            titulo: `${seccion.etiqueta} - Plan N° ${plan.numero}`,
                            modelo: extraccion.modelo
                        });
                        // PDF: el oficial de AFIP (botón Imprimir); si falla, el propio
                        const filasEsperadas = extraccion.modelo.bloques
                            .filter(b => !b.total)
                            .reduce((n, b) => n + b.filas.length, 0);
                        const oficial = await paso_8b_pdfAfipSeccion.ejecutar(
                            paginaServicio, seccion, plan, cuitConsulta.cuit, downloadsPath, filasEsperadas
                        );
                        let pdf = oficial.success ? oficial.pdf : null;
                        if (!pdf) {
                            const propio = await paso_9_generarPdfSeccion.ejecutar(
                                extraccion.modelo, seccion, plan, cuitConsulta.cuit, downloadsPath
                            );
                            pdf = propio.pdf ? { ...propio.pdf, origen: 'propio' } : null;
                        }
                        // Los datos se leyeron bien: la sección cuenta como OK
                        // aunque falle el PDF (queda su hoja en el Excel).
                        secciones.push({
                            seccion: seccion.id,
                            success: true,
                            noDisponible: false,
                            pdf,
                            error: pdf ? null : 'No se pudo generar el PDF'
                        });
                    } catch (errSeccion) {
                        console.error(`  ⚠️ ${seccion.etiqueta} del plan #${plan.numero}:`, errSeccion.message);
                        secciones.push({ seccion: seccion.id, success: false, noDisponible: false, error: errSeccion.message });
                    }
                }

                // Control cruzado contra el consolidado de la lista de planes
                const obligacionesCompletas = secciones
                    .filter(s => s.seccion !== 'planPago')
                    .every(s => s.success || s.noDisponible);
                const validacion = validarConsolidado.validar(plan.consolidado, modelos, obligacionesCompletas);
                logValidacion(plan, validacion);

                // Excel por plan: una hoja por sección leída (misma carpeta que los PDF)
                const resultadoXlsx = await excelPlan.generar({
                    hojas: hojasExcel,
                    plan,
                    cuit: cuitConsulta.cuit,
                    downloadDir: await getDownloadPathContribuyente(downloadsPath, cuitConsulta.cuit, '', 'archivos_afip')
                });

                resultadosPlanes.push({
                    plan: {
                        numero: plan.numero,
                        cuotas: plan.cuotas,
                        tipo: plan.tipo,
                        consolidado: plan.consolidado,
                        situacion: plan.situacion,
                        presentacion: plan.presentacion
                    },
                    pagos: resultadoExtraccion.success ? resultadoExtraccion.pagos : [],
                    pdf: resultadoPDF.success ? {
                        path: resultadoPDF.pdfPath,
                        nombre: resultadoPDF.pdfNombre,
                        downloadDir: resultadoPDF.downloadDir,
                        origen: resultadoPDF.origen
                    } : null,
                    xlsx: resultadoXlsx.success ? {
                        path: resultadoXlsx.xlsxPath,
                        nombre: resultadoXlsx.xlsxNombre
                    } : null,
                    secciones,
                    validacion,
                    datosResumen,
                    success: true
                });

            } catch (errorPlan) {
                console.error(`  ❌ Error procesando plan #${plan.numero}:`, errorPlan.message);
                resultadosPlanes.push({
                    plan: { numero: plan.numero, cuotas: plan.cuotas },
                    pagos: [],
                    pdf: null,
                    success: false,
                    error: errorPlan.message
                });
                // Sin recuperación acá: el próximo plan arranca con asegurarEnListaPlanes()
            }
        }

        // =====================================================
        // Resumen por cliente (Excel con todos los planes del cliente)
        // =====================================================
        let resumenCliente = null;
        const datosResumenPlanes = resultadosPlanes
            .filter(r => r.success && r.datosResumen)
            .map(r => r.datosResumen);

        if (datosResumenPlanes.length > 0) {
            try {
                const resultadoResumen = await resumenClienteExcel.generar(
                    datosResumenPlanes,
                    usuario,
                    cuitConsulta.cuit,
                    downloadsPath
                );
                if (resultadoResumen && resultadoResumen.success) {
                    resumenCliente = {
                        path: resultadoResumen.xlsxPath,
                        nombre: resultadoResumen.xlsxNombre
                    };
                }
            } catch (e) {
                console.error('[PlanesDePago Flujo] Error generando resumen cliente:', e.message);
            }
        }

        // =====================================================
        // Resultado final
        // =====================================================
        const exitosos = resultadosPlanes.filter(r => r.success).length;
        const fallidos = resultadosPlanes.filter(r => !r.success).length;

        console.log(`\n[PlanesDePago Flujo] === Flujo completado ===`);
        console.log(`   Planes procesados: ${exitosos} exitosos, ${fallidos} fallidos de ${planes.length} total`);

        return {
            success: true,
            message: `Procesados ${exitosos}/${planes.length} planes vigentes para ${cuitConsulta.alias}`,
            cuitConsulta,
            planes: resultadosPlanes,
            resumenCliente,
            resumenPlanes: resultadosPlanes.map(resumirPlanParaUI),
            resumen: {
                total: planes.length,
                exitosos,
                fallidos
            }
        };

    } catch (error) {
        console.error('[PlanesDePago Flujo] Error general:', error.message);
        return {
            success: false,
            error: 'FLUJO_ERROR',
            message: error.message
        };
    }
}

/**
 * Busca "mis facilidades" en el buscador de AFIP y hace clic en el resultado correcto.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<import('puppeteer').Page>} La nueva página abierta
 */
async function buscarMisFacilidades(page) {
    const browser = page.browser();

    // Esperar buscador
    console.log('  → Esperando buscador AFIP...');
    await page.waitForSelector('#buscadorInput', { timeout: 20000 });

    // Listener para nueva pestaña
    const nuevaPestanaPromise = new Promise((resolve) => {
        const handleTarget = async (target) => {
            if (target.type() !== 'page') return;
            const newPage = await target.page();
            if (newPage) {
                browser.off('targetcreated', handleTarget);
                resolve(newPage);
            }
        };
        browser.on('targetcreated', handleTarget);
    });

    // Escribir en el buscador
    console.log('  → Escribiendo "mis facilidades" en el buscador...');
    await page.evaluate(() => {
        const input = document.getElementById('buscadorInput');
        if (!input) throw new Error('No se encontró #buscadorInput');

        input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        input.focus();

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeInputValueSetter.call(input, 'mis facilidades');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Esperar lista de resultados
    console.log('  → Esperando lista de resultados...');
    await page.waitForSelector('#resBusqueda a', { timeout: 10000 });

    // Buscar y hacer click en "Mis Facilidades"
    console.log('  → Buscando enlace "Mis Facilidades"...');
    const encontrado = await page.evaluate(() => {
        const enlace = Array.from(document.querySelectorAll('#resBusqueda a'))
            .find(el => el.innerText.includes('Mis Facilidades'));
        if (enlace) {
            enlace.click();
            return true;
        }
        return false;
    });

    if (!encontrado) {
        throw new Error('No se encontró "Mis Facilidades" en los resultados del buscador');
    }

    console.log('  → Click en "Mis Facilidades". Esperando nueva pestaña...');

    // Esperar nueva pestaña
    let newPage;
    try {
        newPage = await Promise.race([
            nuevaPestanaPromise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout esperando nueva pestaña')), 10000)
            )
        ]);
        console.log('  ✅ Nueva pestaña capturada');
    } catch (timeoutError) {
        console.log('  ⚠️ Sin nueva pestaña. Verificando navegación en misma página...');
        try {
            await page.waitForFunction(
                () => document.readyState === 'complete',
                { timeout: 5000 }
            );
            newPage = page;
        } catch (e) {
            throw new Error('No se pudo acceder a "Mis Facilidades"');
        }
    }

    // Esperar carga
    if (newPage && newPage !== page) {
        try {
            await newPage.waitForSelector('body', { timeout: 10000 });
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (e) {
            console.log('  ⚠️ Timeout carga página:', e.message);
        }
    }

    console.log('  ✅ Servicio "Mis Facilidades" abierto');
    return newPage;
}

/**
 * Verifica que estamos en seguimiento_presentacion.aspx con la tabla visible.
 * Si no, navega ahí.
 */
async function asegurarEnListaPlanes(page) {
    const url = page.url();
    if (url.includes('seguimiento_presentacion.aspx')) {
        // Verificar que la tabla está visible
        const tablaVisible = await page.$('table.searchTable');
        if (tablaVisible) return;
    }

    console.log('  → No estamos en la lista de planes. Navegando...');
    await page.goto(URL_SEGUIMIENTO, { waitUntil: 'networkidle2', timeout: 15000 });
    await page.waitForSelector('table.searchTable', { timeout: 10000 });
}

/**
 * Deja la página en el detalle del plan (nuevos_planes.aspx) con el botón de
 * la sección visible. Si ya estamos ahí (ej: tras el postback de otra sección
 * los botones siguen) no navega; si no, lista → Detalle del plan.
 */
async function asegurarEnDetallePlan(page, plan, selectorBoton) {
    if (page.url().includes('nuevos_planes.aspx') && await page.$(selectorBoton)) return;

    // Desde una sección: su botón "Volver" lleva al detalle del mismo plan.
    const volver = await page.$('a[href="nuevos_planes.aspx"]');
    if (volver) {
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
            volver.evaluate(el => el.click())
        ]);
        const nroEnPagina = await page.$eval('#ContentPlaceHolder1_CabeceraPlanesEnviados_cab_nroPlan', el => el.textContent.trim())
            .catch(() => null);
        if (page.url().includes('nuevos_planes.aspx') && nroEnPagina === plan.numero) return;
    }

    await asegurarEnListaPlanes(page);
    await paso_3_clickDetallePlan.ejecutar(page, plan);
}

/**
 * Una línea por plan para la pantalla: qué se bajó de cada sección y si el
 * control contra el consolidado cerró.
 * Estados de sección: 'ok' | 'no' (el plan no la tiene) | 'error'.
 * control: 'ok' | 'difiere' | 'sinDatos'.
 */
function resumirPlanParaUI(r) {
    const origenPdf = (id) => {
        const sc = (r.secciones || []).find(x => x.seccion === id);
        return sc && sc.pdf ? sc.pdf.origen : null;
    };
    const estadoSeccion = (id) => {
        const sc = (r.secciones || []).find(x => x.seccion === id);
        if (!sc) return 'error';
        if (sc.noDisponible) return 'no';
        return sc.success ? 'ok' : 'error';
    };
    let control = 'sinDatos';
    if (r.validacion) {
        const estados = [r.validacion.planPago.estado, r.validacion.obligaciones.estado];
        if (estados.includes('difiere')) control = 'difiere';
        else if (estados.includes('ok')) control = 'ok';
    }
    return {
        numero: r.plan.numero,
        success: r.success,
        error: r.success ? null : r.error,
        pagos: r.pdf ? 'ok' : 'error',
        planPago: estadoSeccion('planPago'),
        obligImp: estadoSeccion('obligImp'),
        obligPrev: estadoSeccion('obligPrev'),
        excel: r.xlsx ? 'ok' : 'error',
        pdfOrigen: { pagos: r.pdf ? r.pdf.origen : null, planPago: origenPdf('planPago'), obligImp: origenPdf('obligImp'), obligPrev: origenPdf('obligPrev') },
        control
    };
}

function logValidacion(plan, validacion) {
    const fmt = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const linea = (nombre, r) => {
        if (r.estado === 'ok') return `  ✅ Control ${nombre}: cierra con el consolidado.`;
        if (r.estado === 'difiere') {
            return `  ⚠️ Control ${nombre}: NO cierra. Leído $${fmt(r.obtenido)} vs consolidado $${fmt(validacion.consolidado)} (dif. $${fmt(r.diferencia)}). ¿Cambió la página de AFIP?`;
        }
        return `  ℹ️ Control ${nombre}: sin datos para comparar.`;
    };
    console.log(linea(`Plan de Pago #${plan.numero}`, validacion.planPago));
    console.log(linea(`Obligaciones #${plan.numero}`, validacion.obligaciones));
}

module.exports = { ejecutarFlujo };
