/**
 * PASO 3: Click en "Detalle" de un plan vigente
 *
 * Navega a la página correcta de la paginación (si es necesario),
 * busca la fila del plan por su número, y hace click en su botón Detalle
 * usando JavaScript (para evitar problemas de "not clickable" con ASPX ViewState).
 * Navega a nuevos_planes.aspx.
 */

const { irAPagina } = require('./paso_2_obtenerPlanesVigentes.js');

async function ejecutar(page, plan) {
    console.log(`  → Paso 3: Abriendo detalle del plan #${plan.numero}...`);

    // 1. Navegar a la página de la tabla donde está este plan
    if (plan.paginaTabla) {
        await irAPagina(page, plan.paginaTabla);
    }

    // 2. Buscar y hacer click en el botón Detalle via JS (evita "not clickable")
    const clickResult = await page.evaluate((numeroPlan) => {
        const filas = document.querySelectorAll('table.searchTable tbody tr');
        for (const fila of filas) {
            const celdas = fila.querySelectorAll('td');
            const numeroCelda = celdas[1] ? celdas[1].textContent.trim() : '';
            if (numeroCelda === numeroPlan) {
                // Buscar botón detalle: input o link
                const boton = fila.querySelector('input[id*="detallePlan"]') ||
                              fila.querySelector('a[id*="detallePlan"]') ||
                              fila.querySelector('input[id*="Detalle"]') ||
                              fila.querySelector('a[id*="Detalle"]');
                if (boton) {
                    boton.click();
                    return { found: true, tag: boton.tagName, id: boton.id };
                }

                // Fallback: buscar cualquier input/button/link en la última celda
                const ultimaCelda = celdas[celdas.length - 1];
                if (ultimaCelda) {
                    const accion = ultimaCelda.querySelector('input[type="submit"], input[type="button"], a, button');
                    if (accion) {
                        accion.click();
                        return { found: true, tag: accion.tagName, id: accion.id, fallback: true };
                    }
                }

                return { found: false, error: `Fila encontrada para plan ${numeroPlan} pero sin botón Detalle` };
            }
        }
        return { found: false, error: `No se encontró fila con plan ${numeroPlan} en la tabla` };
    }, plan.numero);

    if (!clickResult.found) {
        throw new Error(clickResult.error);
    }

    console.log(`  → Click en botón ${clickResult.tag}#${clickResult.id}${clickResult.fallback ? ' (fallback)' : ''}`);

    // 3. Esperar navegación: la página destino es nuevos_planes.aspx
    //    Usar waitForSelector más robusto que waitForNavigation
    try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });
    } catch (navError) {
        // Si timeout, verificar si la página cambió de todas formas
        console.log(`  ⚠️ waitForNavigation timeout, verificando URL...`);
        const url = page.url();
        if (!url.includes('nuevos_planes.aspx') && !url.includes('detalle')) {
            throw new Error(`Navegación falló. URL actual: ${url}`);
        }
        console.log(`  → Página cargó parcialmente: ${url}`);
    }

    // Verificar que estamos en la página de detalle
    const urlFinal = page.url();
    if (urlFinal.includes('nuevos_planes.aspx') || urlFinal.includes('detalle')) {
        console.log('  ✅ Página de detalle del plan cargada.');
        return { success: true };
    }

    // Esperar un poco más por si la navegación es lenta
    await new Promise(resolve => setTimeout(resolve, 3000));
    const urlRetry = page.url();
    if (urlRetry.includes('nuevos_planes.aspx') || urlRetry.includes('detalle')) {
        console.log('  ✅ Página de detalle del plan cargada (con espera adicional).');
        return { success: true };
    }

    throw new Error(`No se navegó a la página de detalle. URL: ${urlRetry}`);
}

module.exports = { ejecutar };
