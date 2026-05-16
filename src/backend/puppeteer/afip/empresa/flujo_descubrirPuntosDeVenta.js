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

const { buscarEnAfip }              = require('../archivosComunes/buscadorAfip.js');
const { seleccionarEmpresa }        = require('../archivosComunes/empresasDisponibles.js');
const { menuPrincipal }             = require('../facturas/codigo/hacerFacturas/codigoXpagina/menuPrincipal.js');
const { leerSelectPuntosDeVenta }   = require('./paso_leerSelectPuntosDeVenta.js');

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

async function ejecutarFlujoDescubrirPuntosDeVenta(page, razonSocial) {
    console.log('🔵 [Flujo Descubrir PDV] Iniciando...');

    console.log('🔵 [Flujo] Paso 1: Buscando "Comprobantes en línea"...');
    const newPage = await buscarEnAfip(page, 'compr', { esperarNuevaPestana: true });
    await esperar(500);

    console.log('🔵 [Flujo] Paso 2: Seleccionando empresa:', razonSocial);
    const pageEmpresa = await seleccionarEmpresa(newPage, razonSocial);
    await esperar(800);

    console.log('🔵 [Flujo] Paso 3: Click en "Consultas"...');
    await menuPrincipal(pageEmpresa, { botonId: 'btn_consultas' });
    await esperar(500);

    console.log('🔵 [Flujo] Paso 4: Leyendo <select id="puntodeventa">...');
    const opciones = await leerSelectPuntosDeVenta(pageEmpresa);

    console.log(`✅ [Flujo] Descubrimiento completado: ${opciones.length} pdv encontrado(s).`);
    return opciones;
}

module.exports = { ejecutarFlujoDescubrirPuntosDeVenta };
