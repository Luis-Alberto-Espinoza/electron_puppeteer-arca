/**
 * Manager de operaciones de Empresa (sobre datos del cliente).
 *
 * Hoy expone:
 *   - descubrirPuntosDeVenta(usuarioId, razonSocial)
 *       → navega AFIP, lee el <select id="puntodeventa">,
 *         persiste el resultado en cliente.empresas[i].puntosDeVenta
 *         y devuelve la lista normalizada.
 *
 * No conoce de IPC ni de Electron; recibe `userStorage` por inyección.
 */

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager     = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const { ejecutarFlujoDescubrirPuntosDeVenta } = require('../../puppeteer/afip/empresa/flujo_descubrirPuntosDeVenta.js');
const {
    abrirAbmPuntosVenta,
    procesarEmpresaEnAbm,
    procesarEnAbmSinSelector,
    volverAListaEmpresas
} = require('../../puppeteer/afip/empresa/flujo_abmPuntosDeVenta.js');
const { listarEmpresas } = require('../../puppeteer/afip/archivosComunes/empresasDisponibles.js');
const { crearEmpresa, normalizarPuntoDeVenta, getEmpresaPorRazonSocial } = require('../../cliente/model.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Parsea una opción cruda del <select id="puntodeventa"> de AFIP.
 *
 *   value: "1" o "00001" (número crudo)
 *   text:  "00001 - Casa Central" | "00001" | "00001-Sucursal"
 *
 * Devuelve { numero, descripcion } pasado por la normalización del modelo
 * (numero queda como string padStart-5).
 *
 * @param {{value:string, text:string}} opcion
 * @returns {{numero:string, descripcion:string|null}|null}
 */
function parsearOpcionPdv(opcion) {
    const valueLimpio = String(opcion.value || '').trim();
    if (!valueLimpio) return null;

    // Extraer descripción del texto visible, si difiere del número.
    const textLimpio = String(opcion.text || '').trim();
    let descripcion = null;
    // Patrón "00001 - Casa Central" o "00001-Casa Central" o "1 Casa Central"
    const m = textLimpio.match(/^\s*\d+\s*[-–:\s]\s*(.+?)\s*$/);
    if (m && m[1]) {
        const candidato = m[1].trim();
        // Si la descripción es sólo el mismo número repetido, descartar
        if (!/^\d+$/.test(candidato)) descripcion = candidato;
    }

    return normalizarPuntoDeVenta({ numero: valueLimpio, descripcion });
}

/**
 * Persiste el resultado del descubrimiento en el JSON.
 * Aplica `normalizarCliente` indirectamente vía `saveData`.
 *
 * @param {Object} userStorage
 * @param {string|number} usuarioId
 * @param {string} razonSocial
 * @param {Array<{numero:string, descripcion:string|null}>} puntosDeVenta
 * @returns {string} ISO timestamp de la actualización
 */
function persistirPuntosDeVenta(userStorage, usuarioId, razonSocial, puntosDeVenta) {
    const data = userStorage.loadData();
    const usuario = data.users.find(u => String(u.id) === String(usuarioId));
    if (!usuario) throw new Error(`Usuario id=${usuarioId} no encontrado al persistir pdv`);

    const empresa = getEmpresaPorRazonSocial(usuario, razonSocial);
    if (!empresa) throw new Error(`Empresa "${razonSocial}" no encontrada en usuario ${usuarioId}`);

    const ahora = new Date().toISOString();
    empresa.puntosDeVenta = puntosDeVenta;
    empresa.puntosDeVentaActualizados = ahora;

    userStorage.saveData(data);
    return ahora;
}

/**
 * Descubre los puntos de venta de una empresa.
 *
 * @param {Object} userStorage           - inyectado, instancia de JsonStorage
 * @param {string|number} usuarioId
 * @param {string} razonSocial
 * @returns {Promise<{success:true, data:{razonSocial:string, puntosDeVenta:Array, puntosDeVentaActualizados:string}} | {success:false, error:string, message:string}>}
 */
async function descubrirPuntosDeVenta(userStorage, usuarioId, razonSocial) {
    console.log('🔵 [EmpresaManager] descubrirPuntosDeVenta', { usuarioId, razonSocial });

    const data = userStorage.loadData();
    const usuario = data.users.find(u => String(u.id) === String(usuarioId));
    if (!usuario) {
        return { success: false, error: 'USER_NOT_FOUND', message: 'No se encontró el usuario.' };
    }

    if (!getEmpresaPorRazonSocial(usuario, razonSocial)) {
        return { success: false, error: 'EMPRESA_NOT_FOUND', message: `La empresa "${razonSocial}" no está en el cliente.` };
    }

    const credenciales = {
        usuario: usuario.cuit,
        contrasena: usuario.claveAFIP || usuario.clave,
        nombreEmpresa: razonSocial
    };

    return await puppeteerManager.ejecutar(async (browser, page) => {
        console.log('🔵 [EmpresaManager] Login en AFIP...');
        const loginResult = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);
        if (!loginResult.success) {
            return { success: false, error: 'LOGIN_FAILED', message: loginResult.message };
        }

        console.log('🔵 [EmpresaManager] Ejecutando flujo de descubrimiento...');
        const opcionesCrudas = await ejecutarFlujoDescubrirPuntosDeVenta(page, razonSocial);

        // Normalizar al modelo {numero, descripcion}
        const puntosDeVenta = opcionesCrudas
            .map(parsearOpcionPdv)
            .filter(Boolean);

        // Persistir en el JSON
        const ts = persistirPuntosDeVenta(userStorage, usuarioId, razonSocial, puntosDeVenta);

        console.log(`✅ [EmpresaManager] ${puntosDeVenta.length} pdv guardado(s) en ${razonSocial}.`);
        return {
            success: true,
            data: {
                razonSocial,
                puntosDeVenta,
                puntosDeVentaActualizados: ts
            }
        };

    }, { headless: false });
}

/**
 * Análisis completo del cliente vía ABM detallado.
 * Una sola corrida: login → lista empresas → por cada empresa, scrapea PDV detallados.
 * Persiste cada empresa después de procesarla (no espera al final), así si algo falla
 * a mitad de camino, las primeras empresas quedan guardadas.
 *
 * Empresas ya presentes en el cliente que NO aparezcan en AFIP son eliminadas.
 * Empresas nuevas se crean. Empresas que ya estaban preservan PDV cacheados hasta
 * que el ABM los reemplace.
 *
 * @param {Object} userStorage      instancia de JsonStorage inyectada
 * @param {string|number} usuarioId
 * @returns {Promise<{success:boolean, data?:Object, error?:string, message?:string}>}
 */
async function analizarCliente(userStorage, usuarioId) {
    console.log('🔵 [EmpresaManager] analizarCliente', { usuarioId });

    const data = userStorage.loadData();
    const usuario = data.users.find(u => String(u.id) === String(usuarioId));
    if (!usuario) {
        return { success: false, error: 'USER_NOT_FOUND', message: 'No se encontró el usuario.' };
    }
    if (!usuario.claveAFIP && !usuario.clave) {
        return { success: false, error: 'NO_AFIP_KEY', message: 'El cliente no tiene clave AFIP cargada.' };
    }

    const credenciales = {
        usuario: usuario.cuit,
        contrasena: usuario.claveAFIP || usuario.clave
    };

    return await puppeteerManager.ejecutar(async (browser, page) => {
        console.log('🔵 [EmpresaManager] Login en AFIP...');
        const loginResult = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);
        if (!loginResult.success) {
            return { success: false, error: 'LOGIN_FAILED', message: loginResult.message };
        }

        const nombreFallback = `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim() || usuario.cuit;

        // Intentar abrir "Administración de PDV" vía buscador AFIP.
        // Si falla (cliente sin permisos para ese módulo), caemos al fallback.
        let pageLista = page;
        let modo = null;
        let razonesSociales = [];
        let pdvsPreFetched = null;

        console.log('🔵 [EmpresaManager] Abriendo "Administración de PDV"...');
        try {
            const r = await abrirAbmPuntosVenta(page);
            pageLista = r.page;
            modo = r.modo;

            if (modo === 'lista') {
                console.log('🔵 [EmpresaManager] Listando empresas...');
                razonesSociales = await listarEmpresas(pageLista);
                console.log(`  → ${razonesSociales.length} empresa(s) encontrada(s).`);
            } else {
                razonesSociales = [nombreFallback];
                console.log(`🔵 [EmpresaManager] AFIP saltó la lista (modo "${modo}"). Empresa única: "${nombreFallback}".`);
            }
        } catch (eAbrir) {
            console.log(`  ⚠️ "Administración de PDV" no disponible: ${eAbrir.message}`);
        }

        // Si no conseguimos nada por el camino principal, probar fallback
        // (Comprobantes en Línea, accesible para todos los clientes con clave AFIP).
        if (razonesSociales.length === 0) {
            console.log('🔵 [EmpresaManager] Probando fallback con Comprobantes en Línea...');
            try {
                // Si quedamos en una página intermedia (index_bis vacía, error AFIP),
                // intentar volver con goBack para reactivar el buscador.
                if (pageLista !== page) {
                    try {
                        await pageLista.goBack({ waitUntil: 'networkidle2', timeout: 15000 });
                        await new Promise(r => setTimeout(r, 800));
                    } catch (_) { /* tolerante */ }
                }
                // pageOrigen es la pestaña con buscador habilitado: priorizamos la original
                // del login (puppeteerManager.ejecutar) que casi siempre conserva la sesión.
                const pageOrigen = pageLista !== page ? page : pageLista;
                const opcionesCrudas = await ejecutarFlujoDescubrirPuntosDeVenta(pageOrigen, nombreFallback);
                const pdvs = (opcionesCrudas || []).map(parsearOpcionPdv).filter(Boolean);
                if (pdvs.length > 0) {
                    console.log(`  ✅ Fallback Comprobantes en Línea trajo ${pdvs.length} PDV.`);
                    modo = 'fallback-viejo';
                    pdvsPreFetched = pdvs;
                    razonesSociales = [nombreFallback];
                } else {
                    console.log('  ⚠️ Fallback no trajo PDV. Cliente sin puntos de venta accesibles.');
                }
            } catch (eFb) {
                console.log(`  ⚠️ Fallback flujo viejo falló: ${eFb.message}`);
            }
        }

        if (razonesSociales.length === 0) {
            return {
                success: false,
                error: 'NO_EMPRESAS',
                message: 'El cliente no tiene empresas ni puntos de venta accesibles en AFIP (ni en Administración de PDV ni en el ABM directo).'
            };
        }

        // Refrescar usuario.empresas[] preservando PDV cacheados de las que sigan vivas.
        // Empresas que ya no aparecen en AFIP se pierden (intencional).
        {
            const dataFresh = userStorage.loadData();
            const usuarioFresh = dataFresh.users.find(u => String(u.id) === String(usuarioId));
            const empresasPrevias = Array.isArray(usuarioFresh.empresas) ? usuarioFresh.empresas : [];
            usuarioFresh.empresas = razonesSociales.map(razon => {
                const previa = empresasPrevias.find(e =>
                    e.razonSocial && e.razonSocial.trim().toLowerCase() === razon.trim().toLowerCase()
                );
                return previa || crearEmpresa({ razonSocial: razon });
            });
            userStorage.saveData(dataFresh);
        }

        // Iterar empresas: por cada una, scrapear ABM y persistir incremental.
        const resultados = [];
        for (let i = 0; i < razonesSociales.length; i++) {
            const razon = razonesSociales[i];
            const num = `${i + 1}/${razonesSociales.length}`;
            try {
                console.log(`🔵 [EmpresaManager] Empresa ${num}: ${razon}`);
                let pdvsNormalizados;
                if (modo === 'fallback-viejo') {
                    // Ya tenemos los PDV (vinieron del flujo Comprobantes en Línea); no rescrapeamos.
                    pdvsNormalizados = pdvsPreFetched;
                } else {
                    const pdvsCrudos = modo === 'lista'
                        ? await procesarEmpresaEnAbm(pageLista, razon)
                        : await procesarEnAbmSinSelector(pageLista, modo);
                    pdvsNormalizados = pdvsCrudos
                        .map(p => normalizarPuntoDeVenta(p))
                        .filter(Boolean);
                }

                // Persistir SOLO esta empresa (lectura fresca para no pisarnos a nosotros).
                const dataPersist = userStorage.loadData();
                const usuarioPersist = dataPersist.users.find(u => String(u.id) === String(usuarioId));
                const empresa = getEmpresaPorRazonSocial(usuarioPersist, razon);
                if (empresa) {
                    empresa.puntosDeVenta = pdvsNormalizados;
                    empresa.puntosDeVentaActualizados = new Date().toISOString();
                    userStorage.saveData(dataPersist);
                }
                resultados.push({ razonSocial: razon, success: true, count: pdvsNormalizados.length });
                console.log(`  ✅ Empresa ${num} OK: ${pdvsNormalizados.length} PDV.`);
            } catch (err) {
                console.error(`  ❌ Empresa ${num} "${razon}" falló: ${err.message}`);
                resultados.push({ razonSocial: razon, success: false, error: err.message });
            }

            // Volver a la lista para la próxima (solo aplica si modo === 'lista').
            if (modo === 'lista' && i < razonesSociales.length - 1) {
                try {
                    await volverAListaEmpresas(pageLista);
                } catch (eVuelta) {
                    console.error(`  ⚠️ No se pudo volver a la lista: ${eVuelta.message}. Aborto las restantes.`);
                    break;
                }
            }
        }

        // Marcar analizado_afip=true si al menos UNA empresa fue procesada con éxito.
        const exitosos = resultados.filter(r => r.success).length;
        if (exitosos > 0) {
            const dataFinal = userStorage.loadData();
            const usuarioFinal = dataFinal.users.find(u => String(u.id) === String(usuarioId));
            usuarioFinal.analizado_afip = true;
            userStorage.saveData(dataFinal);
        }

        console.log(`✅ [EmpresaManager] Análisis terminado: ${exitosos}/${razonesSociales.length} empresas OK.`);

        // Mensaje útil para mostrar al usuario incluso si falló todo.
        const fallidas = resultados.filter(r => !r.success);
        const message = exitosos === 0
            ? `Ninguna de las ${razonesSociales.length} empresas pudo procesarse. Primer error: ${fallidas[0]?.error || 'sin detalle'}`
            : `${exitosos}/${razonesSociales.length} empresa(s) procesadas correctamente.`;

        return {
            success: exitosos > 0,
            error: exitosos === 0 ? 'ALL_EMPRESAS_FAILED' : null,
            message,
            data: {
                totalEmpresas: razonesSociales.length,
                empresasExitosas: exitosos,
                resultados
            }
        };
    }, { headless: false });
}

module.exports = {
    descubrirPuntosDeVenta,
    analizarCliente,
    // Exportados para tests:
    parsearOpcionPdv
};
