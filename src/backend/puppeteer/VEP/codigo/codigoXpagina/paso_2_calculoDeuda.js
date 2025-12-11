/**
 * PASO 2: Click en "Cálculo de Deuda"
 * Carga nueva vista en la misma pestaña
 */
async function ejecutar(page) {
    try {
        console.log("  → Buscando botón 'Cálculo de Deuda'...");

        // Esperar al botón
        await page.waitForSelector('input[name="CalDeud"]', { timeout: 10000 });

        // Click en el botón
        await page.click('input[name="CalDeud"]');

        console.log("  → Click realizado. Esperando carga...");

        // Esperar a que cargue la nueva vista
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

        console.log("  ✅ Paso 2 completado: Cálculo de deuda cargado");

        return {
            success: true,
            message: "Cálculo de deuda ejecutado correctamente"
        };

    } catch (error) {
        console.error("  ❌ Error en paso_2_calculoDeuda:", error);
        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = { ejecutar };
