/**
 * PASO 2: Obtener los planes de la tabla (vigentes y/o no vigentes)
 *
 * En seguimiento_presentacion.aspx hay una tabla paginada con todos los planes.
 * La paginación usa:
 *   <ul class="pagination">
 *     <li style="display: none;"><a>←</a></li>
 *     <li class="pageNumber active"><a>1</a></li>
 *     <li class="pageNumber"><a>2</a></li>
 *     <li style="display: inline;"><a>→</a></li>
 *   </ul>
 *
 * Recorremos TODAS las páginas y filtramos por la situación del plan
 * (span labelEstado = columna "Situación": "Vigente", "Plan Caduco",
 * "Plan Cancelado"...). La columna "Estado" dice "Aceptada" en todos: no sirve.
 * Sin lista cerrada de estados: lo que no es "Vigente" es "no vigente", así
 * una bandera nueva de AFIP igual se baja (ver afip/planesDePago/estadoPlan.js).
 * Deduplicamos por número de plan (al cambiar de página puede re-leer).
 * Guardamos en qué página de la paginación está cada plan para poder
 * navegar a ella antes de hacer click en Detalle.
 */

const { esVigente, dentroDelRango, describirRango } = require('../../../../afip/planesDePago/estadoPlan.js');

/**
 * @param {Object} [estados] - qué planes traer
 * @param {boolean} [estados.vigentes=true]
 * @param {boolean} [estados.noVigentes=false] - caducos, cancelados y cualquier otro
 * @param {Object} [estados.rangoNoVigentes] - { desde, hasta } 'AAAA-MM' sobre la
 *        columna Presentación. Filtra SOLO a los no vigentes: los vigentes son la
 *        deuda actual y se bajan siempre, aunque el plan sea viejo.
 */
async function ejecutar(page, { vigentes: incluirVigentes = true, noVigentes: incluirNoVigentes = false, rangoNoVigentes = null } = {}) {
    const textoRango = incluirNoVigentes ? describirRango(rangoNoVigentes) : null;
    console.log(`  → Paso 2: Obteniendo planes (vigentes: ${incluirVigentes ? 'sí' : 'no'}, no vigentes: ${incluirNoVigentes ? 'sí' : 'no'}${textoRango ? `, presentados ${textoRango}` : ''})...`);

    // Esperar la tabla de planes
    await page.waitForSelector('table.searchTable', { timeout: 15000 });

    // Primero volver a la página 1 de la paginación
    await irAPagina(page, 1);

    // Determinar cuántas páginas hay
    const totalPaginas = await page.evaluate(() => {
        const pageLinks = document.querySelectorAll('ul.pagination li.pageNumber');
        return pageLinks.length || 1;
    });

    console.log(`  → Tabla con ${totalPaginas} página(s).`);

    const planesMap = new Map(); // clave: numero de plan, para deduplicar
    let paginaActual = 1;

    while (paginaActual <= totalPaginas) {
        console.log(`  → Escaneando página ${paginaActual}/${totalPaginas}...`);

        // Asegurar que estamos en la página correcta
        await irAPagina(page, paginaActual);

        const planesEnPagina = await page.evaluate((incluirVigentes, incluirNoVigentes) => {
            const filas = document.querySelectorAll('table.searchTable tbody tr');
            const planes = [];

            filas.forEach((fila) => {
                const celdas = fila.querySelectorAll('td');
                const numero = celdas[1] ? celdas[1].textContent.trim() : '';
                if (!numero) return;

                // Situación: el span labelEstado; si no está, la columna
                // "Situación" por posición (nunca una lista de nombres).
                const spanEstado = fila.querySelector('[id*="labelEstado"]');
                let estado = spanEstado ? spanEstado.textContent.trim() : '';
                if (!estado && celdas[6]) estado = celdas[6].textContent.trim();

                const vigente = estado.toLowerCase() === 'vigente';
                if (vigente ? !incluirVigentes : !incluirNoVigentes) return;

                planes.push({
                    presentacion: celdas[0] ? celdas[0].textContent.trim() : '',
                    numero,
                    cuotas: celdas[2] ? celdas[2].textContent.trim() : '',
                    tipo: celdas[3] ? celdas[3].textContent.trim() : '',
                    consolidado: celdas[4] ? celdas[4].textContent.trim() : '',
                    estado,
                    situacion: celdas[6] ? celdas[6].textContent.trim() : '',
                });
            });

            return planes;
        }, incluirVigentes, incluirNoVigentes);

        // Agregar al mapa deduplicando por número de plan
        for (const plan of planesEnPagina) {
            if (!planesMap.has(plan.numero)) {
                plan.paginaTabla = paginaActual; // guardar en qué página está
                planesMap.set(plan.numero, plan);
            }
        }

        if (planesEnPagina.length > 0) {
            console.log(`     Encontrados ${planesEnPagina.length} plan(es) en página ${paginaActual}.`);
        }

        paginaActual++;
    }

    // Rango de presentación sobre los no vigentes. Fecha ilegible → se incluye
    // (ante la duda no se pierde un plan) y queda en el log.
    let fueraDeRango = 0;
    for (const [numero, plan] of planesMap) {
        if (esVigente(plan)) continue;
        const dentro = dentroDelRango(plan.presentacion, rangoNoVigentes);
        if (dentro === null) {
            console.log(`     ⚠️ Plan #${numero}: presentación ilegible ("${plan.presentacion}"), se incluye.`);
        } else if (!dentro) {
            planesMap.delete(numero);
            fueraDeRango++;
        }
    }
    if (textoRango) {
        console.log(`  → Rango ${textoRango}: ${fueraDeRango} plan(es) no vigente(s) quedaron afuera.`);
    }

    // Vigentes primero: es lo urgente si el lote se corta a mitad
    const todos = Array.from(planesMap.values())
        .sort((a, b) => esVigente(b) - esVigente(a));

    console.log(`  ✅ Total: ${todos.length} plan(es) único(s) en ${totalPaginas} página(s).`);
    todos.forEach(p => {
        console.log(`     - Plan #${p.numero} | ${p.estado || 'sin estado'} | ${p.cuotas} cuotas | $${p.consolidado} (pág. ${p.paginaTabla})`);
    });

    if (todos.length === 0) {
        return {
            success: true,
            sinPlanes: true,
            message: 'No se encontraron planes',
            planes: []
        };
    }

    return {
        success: true,
        planes: todos
    };
}

/**
 * Navega a una página específica de la paginación de la tabla.
 */
async function irAPagina(page, numeroPagina) {
    const paginaActiva = await page.evaluate(() => {
        const activo = document.querySelector('ul.pagination li.pageNumber.active a');
        return activo ? parseInt(activo.textContent.trim()) : 1;
    });

    if (paginaActiva === numeroPagina) return;

    const navegado = await page.evaluate((numPag) => {
        const pageLinks = document.querySelectorAll('ul.pagination li.pageNumber a');
        for (const link of pageLinks) {
            if (link.textContent.trim() === String(numPag)) {
                link.click();
                return true;
            }
        }
        return false;
    }, numeroPagina);

    if (navegado) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        await page.waitForSelector('table.searchTable', { timeout: 10000 });
    }
}

module.exports = { ejecutar, irAPagina };
