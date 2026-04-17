// Flujo de automatización para Planes de Pago AFIP
// Login → Buscar "mis facilidades" → Seleccionar CUIT → Planes vigentes → Detalle → Ver Pagos → Extraer + PDF

const paso_1_seleccionarCuit = require('../codigoXpagina/paso_1_seleccionarCuit.js');
const paso_2_obtenerPlanesVigentes = require('../codigoXpagina/paso_2_obtenerPlanesVigentes.js');
const paso_3_clickDetallePlan = require('../codigoXpagina/paso_3_clickDetallePlan.js');
const paso_4_clickVerPagos = require('../codigoXpagina/paso_4_clickVerPagos.js');
const paso_5_extraerTablaPagos = require('../codigoXpagina/paso_5_extraerTablaPagos.js');
const paso_6_descargarPDF = require('../codigoXpagina/paso_6_descargarPDF.js');

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

                // Paso 6: Generar PDF con los datos extraídos
                const resultadoPDF = await paso_6_descargarPDF.ejecutar(
                    resultadoExtraccion,  // datos de la tabla (pagos + encabezados)
                    plan,                 // info del plan (numero, cuotas, tipo, etc.)
                    usuario,              // representante
                    cuitConsulta.cuit,    // CUIT consultado
                    downloadsPath         // ruta descargas
                );

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
                        downloadDir: resultadoPDF.downloadDir
                    } : null,
                    success: true
                });

                // Volver a la lista de planes para el siguiente
                if (i < planes.length - 1) {
                    await volverAListaPlanes(paginaServicio);
                }

            } catch (errorPlan) {
                console.error(`  ❌ Error procesando plan #${plan.numero}:`, errorPlan.message);
                resultadosPlanes.push({
                    plan: { numero: plan.numero, cuotas: plan.cuotas },
                    pagos: [],
                    pdf: null,
                    success: false,
                    error: errorPlan.message
                });

                // Recuperación: volver a la lista de planes para el siguiente
                try {
                    await volverAListaPlanes(paginaServicio);
                } catch (e) {
                    console.error('  ⚠️ No se pudo volver a la lista tras error:', e.message);
                }
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
 * Vuelve a la lista de planes (seguimiento_presentacion.aspx) desde la página
 * de detalle de pagos. Intenta goBack dos veces (detalle_pagos → nuevos_planes → seguimiento).
 * Si falla, navega directo a la URL.
 */
async function volverAListaPlanes(page) {
    console.log('  → Volviendo a la lista de planes...');

    try {
        // Desde detalle_pagos.aspx → goBack → nuevos_planes.aspx
        await page.goBack({ waitUntil: 'networkidle2', timeout: 10000 });

        // Desde nuevos_planes.aspx → goBack → seguimiento_presentacion.aspx
        await page.goBack({ waitUntil: 'networkidle2', timeout: 10000 });
    } catch (e) {
        console.log(`  ⚠️ goBack falló: ${e.message}`);
    }

    // Verificar que llegamos
    const url = page.url();
    if (!url.includes('seguimiento_presentacion.aspx')) {
        console.log('  → goBack no llevó a la lista. Navegando directo...');
        await page.goto(URL_SEGUIMIENTO, { waitUntil: 'networkidle2', timeout: 15000 });
    }

    // Esperar que la tabla esté visible
    await page.waitForSelector('table.searchTable', { timeout: 10000 });
    console.log('  ✅ En la lista de planes.');
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

module.exports = { ejecutarFlujo };
