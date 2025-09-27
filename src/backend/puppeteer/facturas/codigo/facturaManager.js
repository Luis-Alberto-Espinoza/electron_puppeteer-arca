const loginManager = require('./login/login_arca');
const flujo_Factura = require('./hacerFacturas/flujo_Factura');
async function iniciarProcesoFacturas(url, credenciales, datosProcesados, test = false, usuarioSeleccionado, empresa) {
    let browser; // La definimos aquí para que sea accesible en el bloque `finally`
    console.log("Iniciando proceso de manager de facturación...", usuarioSeleccionado);

    try {
        if (test) {
            console.log("Modo test activado. No se realizarán cambios reales.");
        }

        // 1. Llamamos a la nueva función de login
        const loginResult = await loginManager.hacerLogin(url, credenciales);

        // 2. Verificamos si el login fue exitoso
        if (!loginResult.success) {
            console.error("[Factura Manager] El login falló:", loginResult.message);
            return { success: false, error: 'LOGIN_FAILED', message: loginResult.message };
        }

        // 3. Desestructuramos page y browser del resultado exitoso
        const { page, browser: b } = loginResult;
        browser = b; // Asignamos el browser a la variable externa

        // 4. Ejecutamos el flujo principal de la factura
        const resultado = await flujo_Factura.ejecutar_Facturas(page, datosProcesados, test, credenciales, usuarioSeleccionado, empresa);
        return resultado;

    } catch (error) {
        console.error("Error en iniciarProcesoFacturas:", error);
        // Devolvemos un objeto de error estructurado para consistencia
        return { success: false, error: 'PROCESS_ERROR', message: error.message };
    } finally {
        // 5. Nos aseguramos de que el navegador se cierre SIEMPRE
        if (browser) {
            console.log("[Factura Manager] Cerrando el navegador.");
            await browser.close();
        }
    }
}

module.exports = {
    iniciarProceso: iniciarProcesoFacturas,
};