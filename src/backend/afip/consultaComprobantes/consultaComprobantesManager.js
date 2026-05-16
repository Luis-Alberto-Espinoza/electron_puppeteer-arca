/**
 * Manager de Consulta de Comprobantes Emitidos
 *
 * Punto de entrada del servicio. Orquesta navegador + login + flujo.
 * No conoce de IPC ni de Electron; recibe credenciales, datos de consulta
 * y la ruta base de descargas.
 */

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const { ejecutarFlujoConsultaComprobantes } = require('../../puppeteer/afip/facturas/codigo/consultarFacturas/flujo_consultaComprobantes.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Mapea tipoContribuyente del usuario al id del select "Tipo Comprobante":
 *   - 'B' → 6  (Factura B)
 *   - 'C' → 11 (Factura C)
 */
function mapearTipoComprobante(tipoContribuyente) {
    if (tipoContribuyente === 'B') return 6;
    if (tipoContribuyente === 'C') return 11;
    return null;
}

/**
 * @param {string} url
 * @param {Object} credenciales - { usuario, contrasena, nombreEmpresa }
 * @param {Object} datos - { fechaDesde, fechaHasta, tipoContribuyente, nombreEmpresa, puntoDeVenta }
 * @param {Object} usuarioParaArchivo - { cuit, nombre, apellido } para nombre de carpeta/Excel
 * @param {string} downloadsPath - ruta base de descargas
 */
async function iniciarConsultaComprobantes(url, credenciales, datos, usuarioParaArchivo, downloadsPath) {
    console.log('🔵 [Consulta Comprobantes Manager] Iniciando proceso...');
    console.log('   Empresa:', datos.nombreEmpresa);
    console.log('   Punto de venta:', datos.puntoDeVenta);
    console.log('   Desde:', datos.fechaDesde, '→ Hasta:', datos.fechaHasta);
    console.log('   Tipo contribuyente:', datos.tipoContribuyente);

    const idTipoComprobante = mapearTipoComprobante(datos.tipoContribuyente);
    if (!idTipoComprobante) {
        return {
            success: false,
            error: 'INVALID_TIPO_CONTRIBUYENTE',
            message: `El tipo de contribuyente "${datos.tipoContribuyente}" no es soportado (esperado: B o C).`
        };
    }

    const datosConsulta = {
        consultaDesde: datos.fechaDesde,
        consultaHasta: datos.fechaHasta,
        idTipoComprobante,
        nombreEmpresa: datos.nombreEmpresa,
        puntoDeVenta: datos.puntoDeVenta || null
    };

    return await puppeteerManager.ejecutar(async (browser, page) => {
        console.log('🔵 [Manager] Paso 1: Login en AFIP...');
        const loginResult = await loginManager.hacerLogin(page, url || URL_LOGIN_AFIP, credenciales);
        if (!loginResult.success) {
            console.error('❌ [Manager] Login falló:', loginResult.message);
            return {
                success: false,
                error: 'LOGIN_FAILED',
                message: loginResult.message
            };
        }

        console.log('🔵 [Manager] Paso 2: Ejecutando flujo de consulta...');
        const resultado = await ejecutarFlujoConsultaComprobantes(
            page,
            datosConsulta,
            usuarioParaArchivo,
            downloadsPath
        );

        console.log('✅ [Manager] Proceso finalizado');
        return resultado;

    }, { headless: false });
}

module.exports = {
    iniciarConsulta: iniciarConsultaComprobantes,
};
