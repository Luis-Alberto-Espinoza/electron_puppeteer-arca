// Manager para el proceso de Planes de Pago AFIP
// Orquesta: login → flujo de consulta

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const flujo = require('../../puppeteer/afip/planesDePago/flujos/flujo_planesDePago.js');
const { resolverHeadless } = require('../../puppeteer/archivos_comunes/navegador/browserLauncher.js');
const { app } = require('electron');
const { RESULTADO_NAVEGADOR_CERRADO, seCerroElNavegador } = require('../../comun/navegadorCerrado.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Inicia el proceso de consulta de Planes de Pago para un representante y un CUIT
 * @param {Object} credenciales - { usuario: CUIT, contrasena: claveAFIP }
 * @param {Object} usuario - Datos del representante
 * @param {Object} cuitConsulta - { cuit, alias } del CUIT a consultar
 * @param {string} downloadsPath - Ruta para descargas
 * @param {Object} [opciones]
 * @param {boolean} [opciones.visible] - false = navegador oculto; si no llega, visible
 * @param {Object} [opciones.estados] - { vigentes, noVigentes }; si no llega, solo vigentes
 */
async function iniciarProceso(credenciales, usuario, cuitConsulta, downloadsPath = null, { visible, estados } = {}) {
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
        const resultado = await flujo.ejecutarFlujo(page, usuario, cuitConsulta, downloadsPath, { estados });
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
 * @param {Object} [opciones.estados] - { vigentes, noVigentes }; si no llega, solo vigentes
 */
async function iniciarProcesoLote(credenciales, usuario, cuitsAProcesar, downloadsPath, onProgreso, { visible, estados } = {}) {
    console.log(`[PlanesDePago Manager] Iniciando proceso lote para ${usuario.nombre} (${credenciales.usuario})`);
    console.log(`   CUITs a procesar: ${cuitsAProcesar.length}`);

    // Misma carpeta que usan los handlers: la que el sistema define como Descargas.
    if (!downloadsPath) downloadsPath = app.getPath('downloads');

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const seCerro = () => seCerroElNavegador(browser, page);

        // 1. Login (una sola vez para este representante)
        console.log('[PlanesDePago Manager Lote] Login...');
        const resultadoLogin = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);
        if (seCerro()) return RESULTADO_NAVEGADOR_CERRADO;

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
            // El usuario cerró el navegador: este y los que faltan no se intentan (no es un fallo)
            if (seCerro()) {
                cerrarRestantes(cuitsAProcesar.slice(i), resultados, onProgreso);
                break;
            }
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
                let resultado = await flujo.ejecutarFlujo(page, usuario, cuitConsulta, downloadsPath, { estados });
                if (!resultado.success && seCerro()) resultado = RESULTADO_NAVEGADOR_CERRADO;
                resultados.push({ cuitConsulta, ...resultado });

                let downloadDir = resultado.downloadDir || null;
                if (!downloadDir && resultado.planes) {
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
                        estado: estadoDe(resultado),
                        mensaje: resultado.message,
                        downloadDir,
                        resumenCliente: resultado.resumenCliente || null,
                        resumenPlanes: resultado.resumenPlanes || null
                    });
                }

                // Volver al home de AFIP para buscar "mis facilidades" de nuevo (para el próximo CUIT)
                if (i < cuitsAProcesar.length - 1 && !seCerro()) {
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
                if (seCerro()) {
                    cerrarRestantes(cuitsAProcesar.slice(i), resultados, onProgreso);
                    break;
                }
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

/**
 * 1ª vuelta: login una vez y, por cada CUIT, leer la lista de planes (sin
 * descargar nada). La pantalla la muestra para que el usuario marque qué bajar.
 * @param {Object} credenciales - { usuario, contrasena }
 * @param {Object} usuario - representante
 * @param {Array} cuitsAProcesar - [{ cuit, alias }]
 * @param {Function} onProgreso - Callback(datos) por CUIT
 * @param {Object} [opciones] - { visible, estados } (mismos filtros que la descarga)
 * @returns {{ success, message, resultados: [{ cuitConsulta, success, planes?, message }] }}
 */
async function listarPlanesLote(credenciales, usuario, cuitsAProcesar, onProgreso, { visible, estados } = {}) {
    console.log(`[PlanesDePago Manager Listar] ${usuario.nombre}: ${cuitsAProcesar.length} CUIT(s)`);

    return await puppeteerManager.ejecutar(async (browser, page) => {
        const seCerro = () => seCerroElNavegador(browser, page);
        const resultadoLogin = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);
        if (seCerro()) return RESULTADO_NAVEGADOR_CERRADO;
        if (!resultadoLogin.success) {
            return { success: false, error: resultadoLogin.error || 'LOGIN_FAILED', message: resultadoLogin.message };
        }

        const resultados = [];
        for (let i = 0; i < cuitsAProcesar.length; i++) {
            const cuitConsulta = cuitsAProcesar[i];
            if (seCerro()) {
                cerrarRestantes(cuitsAProcesar.slice(i), resultados, onProgreso);
                break;
            }
            if (onProgreso) {
                onProgreso({
                    tipo: 'progreso', cuit: cuitConsulta.cuit, alias: cuitConsulta.alias,
                    estado: 'procesando', mensaje: `Leyendo la lista de planes de ${cuitConsulta.alias}...`
                });
            }

            let r = await flujo.listarPlanes(page, cuitConsulta, { estados });
            if (!r.success && seCerro()) r = RESULTADO_NAVEGADOR_CERRADO;
            resultados.push({ cuitConsulta, ...r });
            if (onProgreso) {
                onProgreso({
                    tipo: 'resultado', cuit: cuitConsulta.cuit, alias: cuitConsulta.alias,
                    estado: estadoDe(r), mensaje: r.message
                });
            }

            // Volver al home para el próximo CUIT (igual que el lote de descarga)
            if (i < cuitsAProcesar.length - 1 && !seCerro()) {
                try {
                    await page.goto('https://portalcf.cloud.afip.gob.ar/portal/app/', { waitUntil: 'networkidle2', timeout: 15000 });
                } catch (e) {
                    console.log('[PlanesDePago Manager Listar] Advertencia al volver al home:', e.message);
                }
            }
        }

        return {
            success: true,
            message: `Listados ${resultados.filter(r => r.success).length}/${cuitsAProcesar.length} CUITs`,
            resultados
        };
    }, { headless: resolverHeadless(visible) });
}

// 'cerrado' = el usuario cerró el navegador: se ve en amarillo, no como fallo
function estadoDe(resultado) {
    if (resultado.success) return 'exito';
    return resultado.error === RESULTADO_NAVEGADOR_CERRADO.error ? 'cerrado' : 'error';
}

// Navegador cerrado a mano: los CUITs que faltaban quedan "Se cerró el navegador antes de terminar"
function cerrarRestantes(cuits, resultados, onProgreso) {
    cuits.forEach(cuitConsulta => {
        resultados.push({ cuitConsulta, ...RESULTADO_NAVEGADOR_CERRADO });
        if (onProgreso) {
            onProgreso({
                tipo: 'resultado', cuit: cuitConsulta.cuit, alias: cuitConsulta.alias,
                estado: 'cerrado', mensaje: RESULTADO_NAVEGADOR_CERRADO.message
            });
        }
    });
}

module.exports = { iniciarProceso, iniciarProcesoLote, listarPlanesLote };
