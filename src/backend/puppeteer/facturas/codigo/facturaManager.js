// src/backend/puppeteer/facturas/codigo/facturaManager.js

const loginManager = require('./login/login_arca'); // Importa el nuevo módulo de login
const hacerFacturas = require('./hacerFacturas');

// Función principal para iniciar el proceso de facturas
async function iniciarProcesoFacturas(url, credenciales, datosProcesados, test = false) {
    let page;

    try {
        console.log("Iniciando proceso con test:", test);
        // Lógica adicional para manejar el modo test
        if (test) {
            console.log("Modo test activado. No se realizarán cambios reales.");
        }

        // Usa el módulo de login para obtener la página autenticada
        page = await loginManager.hacerLogin(url, credenciales);

        // Si el login es exitoso, procede con la generación de facturas
        const resultado = await hacerFacturas.ejecutar(page, datosProcesados, test);
        return resultado;
    } catch (error) {
        console.error("Error en iniciarProcesoFacturas:", error);
        throw error;
    } finally {
        //await puppeteerManager.cerrarNavegador();
    }
}


// Exportación de funciones
module.exports = {
    iniciarProceso: iniciarProcesoFacturas,
    // ... otras funciones ...
};