/**
 * PASO 9: Aceptar modal de confirmación
 *
 * Después de seleccionar el medio de pago, aparece un modal con un botón "Aceptar".
 * El ID del botón es dinámico, por lo que buscamos por clase y texto.
 *
 * Al hacer click en "Aceptar", la página se actualiza mostrando la nueva vista con el VEP.
 */

async function ejecutar(page) {
    try {
        console.log("  → Aceptando modal de confirmación...");

        // Buscar botón "Aceptar" por clase y texto
        const botonEncontrado = await page.evaluate(() => {
            const botones = Array.from(document.querySelectorAll('button.btn.btn-primary'));
            const botonAceptar = botones.find(btn => btn.textContent.trim().toLowerCase() === 'aceptar');
            return botonAceptar ? true : false;
        });

        if (!botonEncontrado) {
            throw new Error('No se pudo encontrar el botón "Aceptar" en el modal');
        }

        // Hacer click en el botón
        const clickRealizado = await page.evaluate(() => {
            const botones = Array.from(document.querySelectorAll('button.btn.btn-primary'));
            const boton = botones.find(btn => btn.textContent.trim().toLowerCase() === 'aceptar');

            if (boton) {
                boton.click();
                return true;
            }
            return false;
        });

        if (!clickRealizado) {
            throw new Error('No se pudo hacer click en el botón "Aceptar"');
        }

        console.log(`  ✅ Modal aceptado correctamente`);

        // Esperar navegación a la nueva vista
        await new Promise(resolve => setTimeout(resolve, 5000));

        return {
            success: true,
            message: 'Modal de confirmación aceptado correctamente'
        };

    } catch (error) {
        console.error("  ❌ Error en paso_9_aceptarModal:", error);
        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = { ejecutar };
