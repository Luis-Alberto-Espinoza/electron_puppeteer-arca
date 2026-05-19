/**
 * Flujo Puppeteer: descubrir los puntos de venta numéricos de una empresa
 * representada por el cliente logueado.
 *
 * Reusa la cadena de navegación del módulo de Consulta de Comprobantes,
 * pero CORTA antes del "Buscar":
 *   1. buscarEnAfip('compr')                  → nueva pestaña Comprobantes en Línea
 *   2. seleccionarEmpresa(razonSocial)        → entra al contexto de la empresa
 *   3. menuPrincipal({ botonId: 'btn_consultas' })
 *   4. leerSelectPuntosDeVenta                → lee el <select id="puntodeventa">
 *
 * @param {import('puppeteer').Page} page - página ya logueada
 * @param {string} razonSocial             - empresa cuyos pdv queremos descubrir
 * @returns {Promise<Array<{value: string, text: string}>>}
 */

const { buscarEnAfip }                          = require('../archivosComunes/buscadorAfip.js');
const { seleccionarEmpresa, listarEmpresas }    = require('../archivosComunes/empresasDisponibles.js');
const { menuPrincipal }                         = require('../facturas/codigo/hacerFacturas/codigoXpagina/menuPrincipal.js');
const { leerSelectPuntosDeVenta }               = require('./paso_leerSelectPuntosDeVenta.js');

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Resuelve qué razón social tipear/clickear en la lista AFIP cuando `razonSocial`
 * de entrada no necesariamente coincide exactamente con cómo AFIP la rotula.
 *
 * Orden de match:
 *   1. Exacto.
 *   2. Case-insensitive con trim.
 *   3. Si hay UNA sola empresa, devolverla (caso fallback donde el cliente
 *      pasó el nombre completo del cliente, no la razón social).
 *
 * Devuelve null si no hay forma razonable de elegir.
 */
function elegirRazonSocial(razonesDisponibles, razonSocialBuscada) {
    if (!Array.isArray(razonesDisponibles) || razonesDisponibles.length === 0) return null;

    const exacto = razonesDisponibles.find(r => r === razonSocialBuscada);
    if (exacto) return exacto;

    const target = String(razonSocialBuscada || '').trim().toLowerCase();
    const ciMatch = razonesDisponibles.find(r => r.trim().toLowerCase() === target);
    if (ciMatch) return ciMatch;

    if (razonesDisponibles.length === 1) return razonesDisponibles[0];

    return null;
}

async function ejecutarFlujoDescubrirPuntosDeVenta(page, razonSocial) {
    console.log('🔵 [Flujo Descubrir PDV] Iniciando...');

    console.log('🔵 [Flujo] Paso 1: Buscando "Comprobantes en línea"...');
    const newPage = await buscarEnAfip(page, 'compr', { esperarNuevaPestana: true });
    await esperar(500);

    // Algunos clientes (monotributistas / personas físicas con 1 sola "empresa")
    // saltean el selector de empresa: AFIP los manda directo al menú.
    // Detectamos esa situación para no romper.
    let pageEmpresa;
    const tieneSelector = await newPage.$('.btn_empresa').catch(() => null);
    if (tieneSelector) {
        // Listar lo que AFIP realmente muestra y elegir con tolerancia,
        // porque el nombre que llega puede no coincidir exacto con la razón social.
        const razonesDisponibles = await listarEmpresas(newPage);
        const elegida = elegirRazonSocial(razonesDisponibles, razonSocial);
        if (!elegida) {
            throw new Error(
                `No encontré empresa que coincida con "${razonSocial}". ` +
                `Disponibles: [${razonesDisponibles.join(', ')}]`
            );
        }
        if (elegida !== razonSocial) {
            console.log(`🔵 [Flujo] Match flexible: "${razonSocial}" → "${elegida}".`);
        }
        console.log('🔵 [Flujo] Paso 2: Seleccionando empresa:', elegida);
        pageEmpresa = await seleccionarEmpresa(newPage, elegida);
        await esperar(800);
    } else {
        console.log('🔵 [Flujo] Paso 2: AFIP saltó selector de empresa, continúo directo.');
        pageEmpresa = newPage;
    }

    console.log('🔵 [Flujo] Paso 3: Click en "Consultas"...');
    await menuPrincipal(pageEmpresa, { botonId: 'btn_consultas' });
    await esperar(500);

    console.log('🔵 [Flujo] Paso 4: Leyendo <select id="puntodeventa">...');
    const opciones = await leerSelectPuntosDeVenta(pageEmpresa);

    console.log(`✅ [Flujo] Descubrimiento completado: ${opciones.length} pdv encontrado(s).`);
    return opciones;
}

module.exports = { ejecutarFlujoDescubrirPuntosDeVenta };
