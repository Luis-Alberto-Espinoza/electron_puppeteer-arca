/**
 * PASO 2: Obtener planes vigentes de la tabla
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
 * Recorremos TODAS las páginas buscando planes con estado "Vigente".
 * Deduplicamos por número de plan (al cambiar de página puede re-leer).
 * Guardamos en qué página de la paginación está cada plan para poder
 * navegar a ella antes de hacer click en Detalle.
 */

async function ejecutar(page) {
    console.log('  → Paso 2: Obteniendo planes vigentes...');

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

    const vigentesMap = new Map(); // clave: numero de plan, para deduplicar
    let paginaActual = 1;

    while (paginaActual <= totalPaginas) {
        console.log(`  → Escaneando página ${paginaActual}/${totalPaginas}...`);

        // Asegurar que estamos en la página correcta
        await irAPagina(page, paginaActual);

        const vigentesEnPagina = await page.evaluate(() => {
            const filas = document.querySelectorAll('table.searchTable tbody tr');
            const vigentes = [];

            filas.forEach((fila) => {
                // Buscar estado - múltiples estrategias
                let estado = '';
                const spanEstado = fila.querySelector('[id*="labelEstado"]');
                if (spanEstado) {
                    estado = spanEstado.textContent.trim();
                }

                if (!estado) {
                    const celdas = fila.querySelectorAll('td');
                    for (const celda of celdas) {
                        const texto = celda.textContent.trim();
                        if (['Vigente', 'Caducado', 'Consolidado', 'Anulado', 'Cancelado'].includes(texto)) {
                            estado = texto;
                            break;
                        }
                    }
                }

                if (estado !== 'Vigente') return;

                const celdas = fila.querySelectorAll('td');
                const numero = celdas[1] ? celdas[1].textContent.trim() : '';
                if (!numero) return;

                vigentes.push({
                    presentacion: celdas[0] ? celdas[0].textContent.trim() : '',
                    numero,
                    cuotas: celdas[2] ? celdas[2].textContent.trim() : '',
                    tipo: celdas[3] ? celdas[3].textContent.trim() : '',
                    consolidado: celdas[4] ? celdas[4].textContent.trim() : '',
                    estado,
                    situacion: celdas[6] ? celdas[6].textContent.trim() : '',
                });
            });

            return vigentes;
        });

        // Agregar al mapa deduplicando por número de plan
        for (const plan of vigentesEnPagina) {
            if (!vigentesMap.has(plan.numero)) {
                plan.paginaTabla = paginaActual; // guardar en qué página está
                vigentesMap.set(plan.numero, plan);
            }
        }

        if (vigentesEnPagina.length > 0) {
            console.log(`     Encontrados ${vigentesEnPagina.length} vigente(s) en página ${paginaActual}.`);
        }

        paginaActual++;
    }

    const todosLosVigentes = Array.from(vigentesMap.values());

    console.log(`  ✅ Total: ${todosLosVigentes.length} plan(es) vigente(s) único(s) en ${totalPaginas} página(s).`);
    todosLosVigentes.forEach(p => {
        console.log(`     - Plan #${p.numero} | ${p.cuotas} cuotas | $${p.consolidado} | ${p.situacion} (pág. ${p.paginaTabla})`);
    });

    if (todosLosVigentes.length === 0) {
        return {
            success: true,
            sinPlanesVigentes: true,
            message: 'No se encontraron planes vigentes',
            planes: []
        };
    }

    return {
        success: true,
        planes: todosLosVigentes
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
