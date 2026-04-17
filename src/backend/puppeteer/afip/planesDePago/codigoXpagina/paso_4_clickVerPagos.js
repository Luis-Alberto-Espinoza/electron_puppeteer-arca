/**
 * PASO 4: Click en "Ver Pagos"
 *
 * En nuevos_planes.aspx, hace click en el botón "Ver Pagos"
 * para navegar a detalle_pagos.aspx
 */

async function ejecutar(page) {
    console.log('  → Paso 4: Haciendo click en "Ver Pagos"...');

    // Esperar el botón
    await page.waitForSelector('#ContentPlaceHolder1_btnVerPagos', { timeout: 10000 });

    // Click con navegación
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
        page.click('#ContentPlaceHolder1_btnVerPagos')
    ]);

    console.log('  ✅ Página de detalle de pagos cargada.');
    return { success: true };
}

module.exports = { ejecutar };
