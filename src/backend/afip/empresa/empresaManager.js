/**
 * Manager de operaciones de Empresa (sobre datos del cliente).
 *
 * Hoy expone:
 *   - analizarContribuyente(repo, cuit) → login por resolverAcceso, scrapea los PDV
 *     del ABM y los guarda en contribuyentes.json.
 *   - analizarLote(repo, cuits, onProgreso) → lo mismo, un login por credencial.
 *
 * No conoce de IPC ni de Electron; recibe el `repo` por inyección.
 */

const puppeteerManager = require('../../puppeteer/archivos_comunes/navegador/puppeteer-manager.js');
const loginManager     = require('../../puppeteer/afip/archivosComunes/login/login_arca.js');
const {
    abrirAbmPuntosVenta,
    procesarEmpresaEnAbm,
    procesarEnAbmSinSelector,
    volverAListaEmpresas
} = require('../../puppeteer/afip/empresa/flujo_abmPuntosDeVenta.js');
const { listarEmpresas, normalizarFuerte } = require('../../puppeteer/afip/archivosComunes/empresasDisponibles.js');
const { buscarEnAfip } = require('../../puppeteer/afip/archivosComunes/buscadorAfip.js');
const { listarRepresentadosSistemaRegistral } = require('../../puppeteer/afip/archivosComunes/representadosSistemaRegistral.js');
const { normalizarPuntoDeVenta } = require('../../cliente/model.js');

const URL_LOGIN_AFIP = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

/**
 * Estado de credencial que le corresponde a cada error de `login_arca`.
 *
 * TIMEOUT / UNEXPECTED_ERROR caen a 'no_verificado' a propósito: que AFIP no
 * conteste no prueba que la clave esté mal. Marcarlos 'invalido' condenaría
 * credenciales buenas por un problema de red — mismo criterio que ya se usa
 * para el captcha.
 */
const ESTADO_POR_ERROR_LOGIN = {
    INVALID_CREDENTIALS: 'invalido',
    INVALID_CUIT: 'invalido',
    UPDATE_PASSWORD_REQUIRED: 'requiere_actualizacion',
    CAPTCHA_BLOQUEO: 'no_verificado',
    TIMEOUT: 'no_verificado',
    UNEXPECTED_ERROR: 'no_verificado'
};

/**
 * Traduce el resultado del login AFIP al estado de credencial y lo persiste.
 *
 * Es lo que convierte a "analizar" en una validación implícita: si el login
 * anduvo, la clave es buena, y no hace falta una pasada previa de "probar clave"
 * (que era un segundo login para averiguar exactamente lo mismo).
 *
 * OJO con la fila destino: se sella la del DUEÑO de la clave (`loginCuit`), no la
 * del contribuyente analizado. Si el analizado es un representado, el normalizador
 * le fuerza `estado_afip='no_aplica'` (invariante: representado sin clave propia),
 * así que escribir el estado en su fila se perdería en silencio.
 *
 * @returns {Promise<string>} el estado que quedó sellado
 */
async function sellarEstadoAfip(repo, loginCuit, loginResult) {
    const estado = loginResult.success
        ? 'validado'
        : (ESTADO_POR_ERROR_LOGIN[loginResult.error] || 'no_verificado');

    try {
        await repo.actualizar(String(loginCuit), {
            estado_afip: estado,
            errorAfip: loginResult.success
                ? null
                : (loginResult.message || loginResult.error || 'No se pudo iniciar sesión en AFIP'),
            fechaVerificacionAfip: new Date().toISOString()
        });
        console.log(`  🔐 Credencial AFIP de ${loginCuit} sellada como "${estado}".`);
    } catch (e) {
        // No aborta el análisis: el scraping puede seguir aunque el sello falle.
        console.error(`  ⚠️ No se pudo sellar el estado AFIP de ${loginCuit}: ${e.message}`);
    }
    return estado;
}

/**
 * Decide si hay que pisar la razón social guardada con la que muestra AFIP.
 *
 * La razón social NO es un campo descriptivo: es la CLAVE DE MATCHEO contra la
 * pantalla de "elegir empresa" (seleccionarEmpresa compara contra el texto de los
 * botones .btn_empresa). Si no coincide con lo que muestra el organismo, la
 * facturación muere con "Empresa X no encontrada en la lista".
 *
 * Por eso acá gana AFIP y pisamos lo que haya cargado el humano, que suele ser un
 * apodo ("Mastantuono Guadalupe" contra "BLANCO GUADALUPE AILEN"). El apodo NO se
 * pierde: vive en nombre/apellido, que este barrido nunca toca.
 *
 * Se compara con normalizarFuerte —el MISMO criterio del fallback 2 de
 * seleccionarEmpresa— para no reescribir la fila en cada barrido por diferencias
 * de tildes o mayúsculas que el matcher ya perdona.
 *
 * @param {Object} filaPrevia        contribuyente ya guardado
 * @param {string} razonSocialAfip   razón social leída de AFIP
 * @returns {{razonSocial?: string}} para hacer spread sobre los cambios (vacío = no tocar)
 */
function sincronizarRazonSocial(filaPrevia, razonSocialAfip) {
    const deAfip = (razonSocialAfip || '').trim();
    if (!deAfip) return {};   // AFIP no trajo nombre: jamás pisar con vacío.

    const guardada = (filaPrevia && filaPrevia.razonSocial) || '';
    if (normalizarFuerte(guardada) === normalizarFuerte(deAfip)) return {};

    console.log(`  🔄 Razón social desactualizada en ${filaPrevia.cuit}: "${guardada}" → "${deAfip}" (manda AFIP).`);
    return { razonSocial: deAfip };
}

/**
 * Vincula una fila YA EXISTENTE con el representante bajo cuyo login apareció.
 *
 * Si AFIP nos mostró esa empresa entrando con la clave de otro CUIT, la representación
 * existe en el organismo: es la fuente más confiable que tenemos. Antes esto solo se
 * guardaba al CREAR la fila; si la empresa ya estaba dada de alta el vínculo se perdía
 * y había que ponerlo a mano con el select, una por una.
 *
 * OJO, ES DESTRUCTIVO A PROPÓSITO: `normalizarContribuyente` mantiene la invariante
 * "representado NO tiene clave propia", así que al escribir `representanteAfipCuit` la
 * `claveAFIP` de esa fila se borra y su estado vuelve a `no_aplica`. Decisión tomada
 * el 2026-08-10: el barrido manda. Por eso cada borrado se loguea con el CUIT, para
 * poder recuperar la clave del backup si hiciera falta.
 *
 * @param {Object} filaPrevia  contribuyente ya guardado
 * @param {string} loginCuit   CUIT con cuya clave entramos a AFIP
 * @returns {{representanteAfipCuit?: string}} para spread sobre los cambios
 */
function vincularConRepresentante(filaPrevia, loginCuit) {
    const cuitFila = String(filaPrevia.cuit);
    const rep = String(loginCuit);

    // La empresa ES el login: opera sola, no se representa a sí misma.
    if (cuitFila === rep) return {};
    // Ya está vinculada a este mismo representante: nada que escribir.
    if (String(filaPrevia.representanteAfipCuit || '') === rep) return {};

    const repAnterior = filaPrevia.representanteAfipCuit;
    if (repAnterior) {
        console.log(`  🔗 ${cuitFila} cambia de representante: ${repAnterior} → ${rep} (lo vimos con ESTE login).`);
    } else {
        console.log(`  🔗 ${cuitFila} "${filaPrevia.razonSocial}" pasa a representada por ${rep}.`);
    }
    if (filaPrevia.claveAFIP) {
        console.log(`     ⚠️ Pierde su clave AFIP propia (estado "${filaPrevia.estado_afip}"). Si la necesitás, está en el backup.`);
    }
    return { representanteAfipCuit: rep };
}

/**
 * Modelo plano: analiza UN contribuyente y guarda sus PDV en `contribuyentes.json`
 * vía el repo. El login lo resuelve `resolverAcceso` (representante si aplica) y se
 * scrapea la empresa OBJETIVO (su razón social canónica).
 *
 * @param {Object} repo  contribuyenteRepo (resolverAcceso + actualizar)
 * @param {string} cuit  CUIT del contribuyente a analizar
 */
async function analizarContribuyente(repo, cuit, opciones = {}) {
    // dejarAbiertoEnError: en el análisis de a UNO conviene dejar el navegador abierto
    // para inspeccionar qué falló. En LOTE se apaga (ver analizarLote): 5 logins malos
    // = 5 Chrome zombis comiéndose la RAM.
    const { dejarAbiertoEnError = true } = opciones;
    const acceso = await repo.resolverAcceso(String(cuit), 'afip');
    if (!acceso) {
        return { success: false, error: 'NO_ACCESO', message: 'El contribuyente no tiene acceso AFIP (ni clave propia ni representante).' };
    }

    const credenciales = { usuario: acceso.loginCuit, contrasena: acceso.loginClave };

    // Guarda los PDV de UNA empresa en la fila del contribuyente DUEÑO, ruteando
    // por el CUIT que leímos de su encabezado (no por nombre). Si la fila no existe
    // (empresa representada que aún no estaba cargada), la crea: la representa quien
    // estamos logueando, salvo que la empresa SEA el login (entonces tiene clave
    // propia → sin representante, y el normalizador respeta esa clave).
    async function persistirEmpresaPorCuit(cuitEmpresa, razonSocial, pdvsCrudos) {
        const puntosDeVenta = (pdvsCrudos || []).map(p => normalizarPuntoDeVenta(p)).filter(Boolean);
        const cambios = { puntosDeVenta, puntosDeVentaActualizados: new Date().toISOString() };

        const previo = await repo.getByCuit(String(cuitEmpresa));
        if (previo) {
            // Además de los PDV, realineamos con lo que AFIP nos acaba de mostrar:
            // la razón social (clave de matcheo al elegir empresa) y de quién depende
            // esta empresa (el login con el que la vimos).
            await repo.actualizar(String(cuitEmpresa), {
                ...cambios,
                ...sincronizarRazonSocial(previo, razonSocial),
                ...vincularConRepresentante(previo, acceso.loginCuit)
            });
            return { creado: false };
        }
        const esElLogin = String(cuitEmpresa) === String(acceso.loginCuit);
        await repo.crear({
            cuit: String(cuitEmpresa),
            razonSocial,
            representanteAfipCuit: esElLogin ? null : String(acceso.loginCuit),
            ...cambios
        });
        return { creado: true };
    }

    // Crea la fila de una empresa representada que NO pasó por el ABM (no tiene PDV,
    // por eso el ABM no la lista). NO toca puntosDeVenta: la creamos "vacía" y sin
    // fecha de actualización, para dejar claro que sus PDV nunca se scrapearon. Si la
    // fila ya existe (la analizó el ABM recién, o estaba de antes), lo ÚNICO que le
    // sincronizamos es la razón social oficial que trae Sistema Registral.
    async function crearFilaRepresentadoSiFalta(cuitEmpresa, razonSocial) {
        if (!cuitEmpresa) return { creado: false };
        const previo = await repo.getByCuit(String(cuitEmpresa));
        if (previo) {
            // Sistema Registral lista JUSTO a los representados de este login, así que
            // es la fuente más directa del vínculo. Igual que arriba: no tocamos PDV.
            const cambios = {
                ...sincronizarRazonSocial(previo, razonSocial),
                ...vincularConRepresentante(previo, acceso.loginCuit)
            };
            if (Object.keys(cambios).length) await repo.actualizar(String(cuitEmpresa), cambios);
            return { creado: false };
        }
        const esElLogin = String(cuitEmpresa) === String(acceso.loginCuit);
        await repo.crear({
            cuit: String(cuitEmpresa),
            razonSocial,
            representanteAfipCuit: esElLogin ? null : String(acceso.loginCuit)
        });
        return { creado: true };
    }

    return await puppeteerManager.ejecutar(async (browser, page) => {
        console.log('🔵 [EmpresaManager] analizarContribuyente: login AFIP...');
        const loginResult = await loginManager.hacerLogin(page, URL_LOGIN_AFIP, credenciales);

        // El login ES la validación de la credencial: sellamos el estado en ambos
        // casos (ande o falle) para no necesitar una pasada aparte de "probar clave".
        const estadoAfip = await sellarEstadoAfip(repo, acceso.loginCuit, loginResult);

        if (!loginResult.success) {
            return {
                success: false,
                // Error GRANULAR tal cual lo dio el login (INVALID_CREDENTIALS,
                // CAPTCHA_BLOQUEO, UPDATE_PASSWORD_REQUIRED, TIMEOUT...). Antes se
                // aplastaba todo a 'LOGIN_FAILED' y quien llamaba no podía distinguir
                // "la clave está mal" de "reintentá más tarde".
                error: loginResult.error || 'LOGIN_FAILED',
                message: loginResult.message || 'No se pudo iniciar sesión en AFIP.',
                data: { estadoAfip, loginCuit: String(acceso.loginCuit) }
            };
        }

        const { page: pageLista, modo } = await abrirAbmPuntosVenta(page);

        // Modo "lista": AFIP muestra el selector con TODAS las empresas (la propia +
        // las representadas). Las recorremos todas: de cada una sacamos su CUIT (del
        // encabezado) y sus PDV, y guardamos en SU fila. Máxima extracción.
        // Modo "menu"/"abm": el login no tiene selector → una sola empresa.
        const razonesSociales = modo === 'lista'
            ? await listarEmpresas(pageLista)
            : [acceso.objetivoNombre];
        console.log(`🔵 [EmpresaManager] ${razonesSociales.length} empresa(s) a procesar (modo "${modo}").`);

        const resultados = [];
        for (let i = 0; i < razonesSociales.length; i++) {
            const razon = razonesSociales[i];
            const num = `${i + 1}/${razonesSociales.length}`;
            try {
                console.log(`🔵 [EmpresaManager] Empresa ${num}: ${razon}`);
                const r = modo === 'lista'
                    ? await procesarEmpresaEnAbm(pageLista, razon)
                    : await procesarEnAbmSinSelector(pageLista, modo);

                // El CUIT sale del encabezado "Representando a:". Si AFIP no lo trae,
                // caemos al objetivo para no perder los PDV (única opción sensata).
                const cuitEmpresa = r.cuit || acceso.objetivoCuit;
                if (!r.cuit) {
                    console.log(`  ⚠️ Empresa "${razon}" sin CUIT en el encabezado; uso el objetivo ${cuitEmpresa}.`);
                }

                const { creado } = await persistirEmpresaPorCuit(cuitEmpresa, razon, r.pdvs);
                const count = (r.pdvs || []).length;
                resultados.push({ razonSocial: razon, cuit: cuitEmpresa, creado, count, success: true });
                console.log(`  ✅ Empresa ${num} OK: ${count} PDV → ${cuitEmpresa}${creado ? ' (fila creada)' : ''}.`);
            } catch (err) {
                console.error(`  ❌ Empresa ${num} "${razon}" falló: ${err.message}`);
                resultados.push({ razonSocial: razon, success: false, error: err.message });
            }

            // Volver a la lista para la próxima empresa (solo en modo lista).
            if (modo === 'lista' && i < razonesSociales.length - 1) {
                try {
                    await volverAListaEmpresas(pageLista);
                } catch (eVuelta) {
                    console.error(`  ⚠️ No se pudo volver a la lista: ${eVuelta.message}. Aborto las restantes.`);
                    break;
                }
            }
        }

        // Segundo flujo: el ABM de arriba solo lista empresas CON punto de venta. Las
        // empresas que el CUIT representa pero no facturan no aparecen ahí y se perderían.
        // Sistema Registral trae la lista COMPLETA (cuit + razón social). Creamos la fila
        // de las que falten para no perderlas; sus PDV quedan vacíos hasta que tengan y
        // se re-analice. Usamos `page` (la pestaña original conserva el buscador; el ABM
        // se abrió en una pestaña aparte).
        let representadosCreados = 0;
        console.log('🔵 [EmpresaManager] Sistema Registral: completando empresas sin PDV...');
        let registralPage = null;
        try {
            registralPage = await buscarEnAfip(page, 'Sistema registral', {
                esperarNuevaPestana: true,
                timeoutNuevaPestana: 10000,
                textoEsperadoEnResultado: 'Sistema Registral'
            });
            const representados = await listarRepresentadosSistemaRegistral(registralPage);
            console.log(`  → Sistema Registral: ${representados.length} persona(s) listada(s).`);
            for (const rep of representados) {
                if (!rep.cuit) continue;
                try {
                    const { creado } = await crearFilaRepresentadoSiFalta(rep.cuit, rep.razonSocial);
                    if (creado) {
                        representadosCreados++;
                        console.log(`  ➕ Empresa sin PDV agregada: ${rep.razonSocial} (${rep.cuit}).`);
                    }
                } catch (eRep) {
                    console.error(`  ⚠️ No se pudo crear fila para ${rep.razonSocial} (${rep.cuit}): ${eRep.message}`);
                }
            }
        } catch (eReg) {
            console.log(`  ⚠️ Sistema Registral no disponible: ${eReg.message}`);
        } finally {
            if (registralPage && registralPage !== page) {
                try { await registralPage.close(); } catch (_) {}
            }
        }

        const exitosos = resultados.filter(r => r.success).length;
        const fallidas = resultados.filter(r => !r.success);
        const extraSinPdv = representadosCreados > 0 ? ` (+${representadosCreados} sin PDV desde Sistema Registral)` : '';
        const message = exitosos === 0
            ? `Ninguna de las ${razonesSociales.length} empresas pudo procesarse. Primer error: ${fallidas[0]?.error || 'sin detalle'}`
            : `${exitosos}/${razonesSociales.length} empresa(s) procesadas${extraSinPdv}.`;
        console.log(`✅ [EmpresaManager] analizarContribuyente terminado: ${exitosos}/${razonesSociales.length} OK${extraSinPdv}.`);

        // Sellar como analizado al contribuyente clickeado aunque él mismo no tenga
        // PDV propios: si es representante, sus PDV viven en las empresas representadas
        // (p.ej. Lucas → GRUPO DALED), así que su fila nunca se tocó en el loop y su
        // botón quedaría en "Traer empresas" para siempre. Solo sella la fecha (no
        // pisa puntosDeVenta), y solo si algo se pudo traer.
        if (exitosos > 0) {
            try {
                await repo.actualizar(String(cuit), { puntosDeVentaActualizados: new Date().toISOString() });
            } catch (eSello) {
                console.error(`  ⚠️ No se pudo marcar ${cuit} como analizado: ${eSello.message}`);
            }
        }

        // Para que el alert del frontend muestre los PDV del cliente analizado,
        // releemos su fila ya actualizada y devolvemos sus puntos de venta.
        const objetivoFresh = await repo.getByCuit(String(cuit));
        return {
            success: exitosos > 0,
            error: exitosos === 0 ? 'ALL_EMPRESAS_FAILED' : null,
            message,
            data: {
                razonSocial: acceso.objetivoNombre,
                cuit: String(cuit),
                puntosDeVenta: (objetivoFresh && objetivoFresh.puntosDeVenta) || [],
                totalEmpresas: razonesSociales.length,
                empresasExitosas: exitosos,
                representadosSinPdvCreados: representadosCreados,
                resultados
            }
        };
    }, { headless: false, dejarAbiertoEnError });
}

/**
 * Analiza un LOTE de contribuyentes con UN login por credencial, no por contribuyente.
 *
 * Clave del ahorro: `analizarContribuyente` en modo "lista" ya scrapea TODAS las
 * empresas que un login ve (la propia + las representadas) y guarda cada una en su
 * fila. Entonces, si 12 contribuyentes cuelgan del mismo representante, alcanza UN
 * login del representante para traerlos a todos. Agrupamos por `loginCuit` (que
 * `resolverAcceso` resuelve sin abrir navegador) y disparamos un análisis por grupo.
 *
 * Pasamos `loginCuit` como objetivo (no un representado cualquiera) para que el sello
 * final de "analizado" caiga sobre el dueño de la clave aunque no tenga PDV propios.
 *
 * @param {Object} repo
 * @param {Array<string>} cuits contribuyentes objetivo del lote
 * @param {(p:Object)=>void} [onProgreso] callback de progreso POR GRUPO (login)
 * @returns {Promise<Object>} resumen agregado
 */
async function analizarLote(repo, cuits, onProgreso = () => {}) {
    // 1) Agrupar por credencial. resolverAcceso es puro repo (sin navegador) → barato.
    const grupos = new Map();      // loginCuit -> [cuits objetivo]
    const sinAcceso = [];
    for (const cuit of cuits) {
        let acceso = null;
        try { acceso = await repo.resolverAcceso(String(cuit), 'afip'); } catch (_) { /* lo tratamos como sin acceso */ }
        if (!acceso) { sinAcceso.push(String(cuit)); continue; }
        const key = String(acceso.loginCuit);
        if (!grupos.has(key)) grupos.set(key, []);
        grupos.get(key).push(String(cuit));
    }

    const totalGrupos = grupos.size;
    console.log(`🔵 [EmpresaManager] analizarLote: ${cuits.length} contribuyente(s) → ${totalGrupos} login(s) distinto(s)${sinAcceso.length ? `, ${sinAcceso.length} sin acceso` : ''}.`);

    // 2) Un análisis (un navegador) por grupo, en serie.
    const resultados = [];
    let i = 0;
    for (const [loginCuit, targets] of grupos.entries()) {
        i++;
        onProgreso({ status: 'processing', indice: i, total: totalGrupos, loginCuit, targets });
        try {
            const r = await analizarContribuyente(repo, loginCuit, { dejarAbiertoEnError: false });
            resultados.push({ loginCuit, targets, success: !!r.success, message: r.message, error: r.error, data: r.data });
            onProgreso({ status: r.success ? 'ok' : 'fallo', indice: i, total: totalGrupos, loginCuit, targets, message: r.message, error: r.error });
        } catch (e) {
            resultados.push({ loginCuit, targets, success: false, error: e.message });
            onProgreso({ status: 'error', indice: i, total: totalGrupos, loginCuit, targets, message: e.message });
        }
    }

    const gruposOk = resultados.filter(r => r.success).length;
    return {
        success: gruposOk > 0,
        totalContribuyentes: cuits.length,
        totalGrupos,
        gruposOk,
        sinAcceso,
        resultados
    };
}

module.exports = {
    analizarContribuyente,
    analizarLote,
    // Exportados para tests:
    sincronizarRazonSocial,
    vincularConRepresentante
};
