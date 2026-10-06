// Manager para el proceso de Planes de Pago AFIP
// Orquesta: login → flujo de consulta

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const flujo = require('../../puppeteer/afip/planesDePago/flujos/flujo_planesDePago.js');
const { resolverHeadless } = require('../../puppeteer/archivos_comunes/navegador/browserLauncher.js');
const { app } = require('electron');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Inicia el proceso de consulta de Planes de Pago para un representante y un CUIT
 * @param {Object} credenciales - { usuario: CUIT, contrasena: claveAFIP }
 * @param {Object} usuario - Datos del representante
 * @param {Object} cuitConsulta - { cuit, alias } del CUIT a consultar
 * @param {string} downloadsPath - Ruta para descargas
 * @param {Object} [opciones]
 * @param {boolean} [opciones.visible] - false = navegador oculto; si no llega, visible
 */
async function iniciarProceso(credenciales, usuario, cuitConsulta, downloadsPath = null, { visible } = {}) {
    console.log('[PlanesDePago Manager] Iniciando proceso...');
    console.log(`   Representante: ${usuario.nombre} (${credenciales.usuario})`);
    console.log(`   Consulta CUIT: ${cuitConsulta.cuit} (${cuitConsulta.alias})`);

    // Misma carpeta que usan los handlers: la que el sistema define como Descargas.
    if (!downloadsPath) downloadsPath = app.getPath('downloads');

    return await puppeteerManager.ejecutar(async (browser, page) => {
        // 1. Login
        console.log('[PlanesDePago Manager] Paso 1: Login...');
        const resultadoLogin = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);

        if (!resultadoLogin.success) {
            console.error('[PlanesDePago Manager] Login falló:', resultadoLogin.message);
            return {
                success: false,
                error: resultadoLogin.error || 'LOGIN_FAILED',
                message: resultadoLogin.message
            };
        }

        console.log('[PlanesDePago Manager] Login exitoso. Iniciando flujo...');

        // 2. Ejecutar flujo
        const resultado = await flujo.ejecutarFlujo(page, usuario, cuitConsulta, downloadsPath);
        return resultado;

    }, { headless: resolverHeadless(visible) });
}

/**
 * Inicia el proceso lote: login ONCE, luego procesa múltiples CUITs en la misma sesión.
 * @param {Object} credenciales - { usuario: CUIT, contrasena: claveAFIP }
 * @param {Object} usuario - Datos del representante
 * @param {Array} cuitsAProcesar - Array de { cuit, alias }
 * @param {string} downloadsPath - Ruta para descargas
 * @param {Function} onProgreso - Callback(datos) para informar progreso por CUIT
 * @param {Object} [opciones]
 * @param {boolean} [opciones.visible] - false = navegador oculto; si no llega, visible
 */
async function iniciarProcesoLote(credenciales, usuario, cuitsAProcesar, downloadsPath, onProgreso, { visible } = {}) {
    console.log(`[PlanesDePago Manager] Iniciando proceso lote para ${usuario.nombre} (${credenciales.usuario})`);
    console.log(`   CUITs a procesar: ${cuitsAProcesar.length}`);

    // Misma carpeta que usan los handlers: la que el sistema define como Descargas.
    if (!downloadsPath) downloadsPath = app.getPath('downloads');

    return await puppeteerManager.ejecutar(async (browser, page) => {
        // 1. Login (una sola vez para este representante)
        console.log('[PlanesDePago Manager Lote] Login...');
        const resultadoLogin = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);

        if (!resultadoLogin.success) {
            console.error('[PlanesDePago Manager Lote] Login falló:', resultadoLogin.message);
            return {
                success: false,
                error: resultadoLogin.error || 'LOGIN_FAILED',
                message: resultadoLogin.message
            };
        }

        console.log('[PlanesDePago Manager Lote] Login exitoso. Procesando CUITs...');

        // 2. Para cada CUIT, ejecutar el flujo
        const resultados = [];

        for (let i = 0; i < cuitsAProcesar.length; i++) {
            const cuitConsulta = cuitsAProcesar[i];
            console.log(`[PlanesDePago Manager Lote] CUIT ${i + 1}/${cuitsAProcesar.length}: ${cuitConsulta.alias} (${cuitConsulta.cuit})`);

            if (onProgreso) {
                onProgreso({
                    tipo: 'progreso',
                    cuit: cuitConsulta.cuit,
                    alias: cuitConsulta.alias,
                    procesados: i,
                    total: cuitsAProcesar.length,
                    estado: 'procesando',
                    mensaje: `Procesando ${cuitConsulta.alias} (${cuitConsulta.cuit})...`
                });
            }

            try {
                const resultado = await flujo.ejecutarFlujo(page, usuario, cuitConsulta, downloadsPath);
                resultados.push({ cuitConsulta, ...resultado });

                let downloadDir = null;
                if (resultado.planes) {
                    const planConPdf = resultado.planes.find(p => p.pdf && p.pdf.downloadDir);
                    if (planConPdf) downloadDir = planConPdf.pdf.downloadDir;
                }

                if (onProgreso) {
                    onProgreso({
                        tipo: 'resultado',
                        cuit: cuitConsulta.cuit,
                        alias: cuitConsulta.alias,
                        procesados: i + 1,
                        total: cuitsAProcesar.length,
                        estado: resultado.success ? 'exito' : 'error',
                        mensaje: resultado.message,
                        downloadDir,
                        resumenCliente: resultado.resumenCliente || null,
                        resumenPlanes: resultado.resumenPlanes || null
                    });
                }

                // Volver al home de AFIP para buscar "mis facilidades" de nuevo (para el próximo CUIT)
                if (i < cuitsAProcesar.length - 1) {
                    console.log('[PlanesDePago Manager Lote] Navegando al home AFIP para próximo CUIT...');
                    try {
                        await page.goto('https://portalcf.cloud.afip.gob.ar/portal/app/', {
                            waitUntil: 'networkidle2',
                            timeout: 15000
                        });
                    } catch (e) {
                        console.log('[PlanesDePago Manager Lote] Advertencia al volver al home:', e.message);
                    }
                }

            } catch (error) {
                console.error(`[PlanesDePago Manager Lote] Error CUIT ${cuitConsulta.cuit}:`, error.message);
                resultados.push({
                    cuitConsulta,
                    success: false,
                    message: error.message
                });

                if (onProgreso) {
                    onProgreso({
                        tipo: 'resultado',
                        cuit: cuitConsulta.cuit,
                        alias: cuitConsulta.alias,
                        procesados: i + 1,
                        total: cuitsAProcesar.length,
                        estado: 'error',
                        mensaje: error.message
                    });
                }

                // Intentar volver al home para continuar con el siguiente
                try {
                    await page.goto('https://portalcf.cloud.afip.gob.ar/portal/app/', {
                        waitUntil: 'networkidle2',
                        timeout: 15000
                    });
                } catch (e) {
                    console.log('[PlanesDePago Manager Lote] No se pudo volver al home:', e.message);
                }
            }
        }

        return {
            success: true,
            message: `Procesados ${resultados.filter(r => r.success).length}/${cuitsAProcesar.length} CUITs`,
            resultados
        };

    }, { headless: resolverHeadless(visible) });
}

module.exports = { iniciarProceso, iniciarProcesoLote };
