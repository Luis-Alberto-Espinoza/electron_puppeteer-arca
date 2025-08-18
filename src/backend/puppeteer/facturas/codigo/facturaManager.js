const loginManager = require('./login/login_arca');
const flujo_Factura = require('./hacerFacturas/flujo_Factura');
async function iniciarProcesoFacturas(url, credenciales, datosProcesados, test = false) {
    let page;
    try {
        console.log("Iniciando proceso con test:", test);
        if (test) {
            console.log("Modo test activado. No se realizarán cambios reales.");
        }
        page = await loginManager.hacerLogin(url, credenciales);
        const resultado = await flujo_Factura.ejecutar_Facturas(page, datosProcesados, test, credenciales);
        return resultado;
    } catch (error) {
        console.error("Error en iniciarProcesoFacturas:", error);
        throw error;
    }
}

module.exports = {
    iniciarProceso: iniciarProcesoFacturas,
};