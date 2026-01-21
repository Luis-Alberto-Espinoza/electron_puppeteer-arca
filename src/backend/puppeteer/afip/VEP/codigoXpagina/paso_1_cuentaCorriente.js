const { buscarEnAfip } = require('../../archivosComunes/buscadorAfip');

/**
 * PASO 1: Acceder a "Cuenta Corriente de Contribuyentes"
 * Abre una nueva pestaña
 */
async function ejecutar(page) {
    try {
        console.log("  → Buscando el panel de Cuenta Corriente...");

        // Usar el componente reutilizable del buscador
        const newPage = await buscarEnAfip(page, 'ccma', {
            timeoutNuevaPestana: 10000,
            esperarNuevaPestana: true
        });

        console.log("  ✅ Paso 1 completado: Nueva pestaña abierta");

        return {
            success: true,
            message: "Cuenta Corriente abierta correctamente",
            newPage: newPage
        };

    } catch (error) {
        console.error("  ❌ Error en paso_1_cuentaCorriente:", error);
        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = { ejecutar };
