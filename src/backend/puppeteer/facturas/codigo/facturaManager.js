const loginManager = require('./login/login_arca'); // Importa el nuevo módulo de login
const hacerFacturas = require('./hacerFacturas');

// Función principal para iniciar el proceso de facturas
async function iniciarProcesoFacturas(url, credenciales, datosProcesados) {
    let page;

    try {
        // Usa el módulo de login para obtener la página autenticada
        page = await loginManager.hacerLogin(url, credenciales);

        // Si el login es exitoso, procede con la generación de facturas
        const resultado = await hacerFacturas.ejecutar(page, datosProcesados);
        return resultado;
    } catch (error) {
        console.error("Error en iniciarProcesoFacturas:", error);
        throw error;
    } finally {
        //await puppeteerManager.cerrarNavegador();
    }
}

// Función para manejar la automatización de facturas
async function hacerFacturasAutomation(page, datosProcesados) {
    try {
        console.log("########### datosProcesados ", datosProcesados);

        let iterador = 0;
        async function pasos(page, datos, iterador) {
            console.log("########### datos ", datos);

            try {
                await hacerFacturas.ejecutar(page, datos, iterador);
                if (datos.arrayDatos && datos.arrayDatos.length > iterador + 1) {
                    iterador++;
                    await pasos(page, datos, iterador);
                }
            } catch (error) {
                console.error("Error en una automatización:", error);
                throw error;
            }
        }
        await pasos(page, datosProcesados, iterador);
        return { success: true, message: "Facturas generadas correctamente." };
    } catch (error) {
        console.error("Error en la automatización de facturas:", error);
        return { success: false, error: error.message };
    }
}

// Exportación de funciones
module.exports = {
    iniciarProceso: iniciarProcesoFacturas,
    hacerFacturas: hacerFacturasAutomation,
    // ... otras funciones ...
};