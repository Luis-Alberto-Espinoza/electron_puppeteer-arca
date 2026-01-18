const puppeteerManager = require('../archivos_comunes/navegador/puppeteer-manager');
const loginManager = require('./codigo/login/login_arca.js');
const flujo_Factura = require('./codigo/hacerFacturas/flujos/flujo_Factura.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

async function iniciarProcesoFacturas(url, credenciales, datosProcesados, test = false, usuarioSeleccionado, empresa) {
    console.log("[Factura Manager] Iniciando proceso de facturacion...");

    if (test) {
        console.log("[Factura Manager] Modo test activado.");
    }

    return await puppeteerManager.ejecutar(async (browser, page) => {
        // 1. Login (ahora recibe page como primer parametro)
        const loginResult = await loginManager.hacerLogin(page, url || URL_LOGIN_AFIP, credenciales);

        if (!loginResult.success) {
            console.error("[Factura Manager] El login fallo:", loginResult.message);
            return { success: false, error: 'LOGIN_FAILED', message: loginResult.message };
        }

        // 2. Ejecutar flujo de facturacion
        const resultado = await flujo_Factura.ejecutar_Facturas(page, datosProcesados, test, credenciales, usuarioSeleccionado, empresa);
        return resultado;

    }, { headless: false });
}

module.exports = {
    iniciarProceso: iniciarProcesoFacturas,
};
