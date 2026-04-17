/**
 * PASO 1: Seleccionar CUIT en Mis Facilidades
 *
 * Después de buscar "mis facilidades", la página puede ser:
 * - IndexContribuyente.aspx → hay CUITs asociados, seleccionar uno del dropdown
 * - seguimiento_presentacion.aspx → entró directo (sin CUITs asociados)
 */

async function ejecutar(page, cuitConsulta) {
    const url = page.url();
    console.log(`  → Paso 1: URL actual: ${url}`);

    if (url.includes('IndexContribuyente.aspx')) {
        console.log(`  → Página de selección de CUIT detectada. Seleccionando: ${cuitConsulta}...`);

        // Esperar el dropdown de CUITs
        await page.waitForSelector('#ContentPlaceHolder1_ddlCUIT', { timeout: 10000 });

        // Seleccionar el CUIT en el dropdown
        const cuitEncontrado = await page.evaluate((cuit) => {
            const select = document.getElementById('ContentPlaceHolder1_ddlCUIT');
            if (!select) return false;

            const opciones = Array.from(select.options);
            // Buscar por value (CUIT sin guiones) o por texto (CUIT con guiones)
            const opcion = opciones.find(opt =>
                opt.value === cuit || opt.value.replace(/-/g, '') === cuit.replace(/-/g, '')
            );

            if (opcion) {
                select.value = opcion.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            return false;
        }, cuitConsulta);

        if (!cuitEncontrado) {
            // Listar los CUITs disponibles para el mensaje de error
            const cuitsDisponibles = await page.evaluate(() => {
                const select = document.getElementById('ContentPlaceHolder1_ddlCUIT');
                return Array.from(select.options).map(o => `${o.value} (${o.text})`).join(', ');
            });
            throw new Error(`CUIT ${cuitConsulta} no encontrado en el dropdown. Disponibles: ${cuitsDisponibles}`);
        }

        console.log('  → CUIT seleccionado. Haciendo click en Aceptar...');

        // Click en botón Aceptar
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
            page.click('#ContentPlaceHolder1_btnAceptar')
        ]);

        console.log('  ✅ CUIT seleccionado y página cargada.');

    } else if (url.includes('seguimiento_presentacion.aspx')) {
        console.log('  ✅ Entró directo a seguimiento (sin selección de CUIT requerida).');
    } else {
        console.log(`  ⚠️ URL no esperada: ${url}. Continuando...`);
    }

    return { success: true };
}

module.exports = { ejecutar };
