/**
 * PASO 3: Scroll hasta el final y click en "Volante de Pago"
 * Carga nueva vista en la misma pestaña
 */
async function ejecutar(page) {
    try {
        console.log("  → Haciendo scroll hasta el final de la página...");

        // Scroll hasta el final
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });

        // Esperar un momento después del scroll
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log("  → Buscando botón 'Volante de Pago'...");

        // Esperar al botón
        await page.waitForSelector('input[name="GENVOL"]', { timeout: 10000 });

        // Click en el botón
        await page.click('input[name="GENVOL"]');

        console.log("  → Click realizado. Esperando carga...");

        // Esperar a que cargue la nueva vista
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

        console.log("  ✅ Paso 3 completado: Volante de pago cargado");

        return {
            success: true,
            message: "Volante de pago cargado correctamente"
        };

    } catch (error) {
        console.error("  ❌ Error en paso_3_volantePago:", error);
        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = { ejecutar };
