// Flujo Importar Libro IVA (sesión AFIP ya iniciada). Por cliente:
//   portal → "portal iva" → Portal IVA (pestaña nueva) → representar al cliente →
//   Nueva declaración jurada → período → IVA Simple (Libro IVA, borrador) →
//   Libro Ventas: importar desde ARCA + Excel → Libro Compras: importar desde ARCA + Excel.
// NUNCA presenta la DDJJ: deja el borrador cargado.
// Cada libro es independiente: si Ventas falla, igual se intenta Compras.

const { getDownloadPathContribuyente } = require('../../../../cliente/carpetaContribuyente.js');
const { abrirPortalIva } = require('../codigoXpagina/paso_1_abrirPortalIva.js');
const { elegirRepresentado } = require('../codigoXpagina/paso_2_elegirRepresentado.js');
const { abrirPeriodo } = require('../codigoXpagina/paso_3_abrirPeriodo.js');
const { importarLibro, LIBROS } = require('../codigoXpagina/paso_4_importarLibro.js');
const { descargarExcel } = require('../codigoXpagina/paso_5_descargarExcel.js');

async function procesarLibro(liva, tipo, contribuyente, { periodo, downloadsPath }, avisar) {
    const cuit = String(contribuyente.cuit);
    try {
        avisar(`Libro ${LIBROS[tipo].nombre}: importando desde ARCA…`);
        const importacion = await importarLibro(liva, tipo, { cuit, periodo }, avisar);
        avisar(`Libro ${LIBROS[tipo].nombre}: descargando Excel…`);
        const excel = await descargarExcel(liva, tipo, { cuit, nombre: contribuyente.nombre, periodo, downloadsPath });
        const aviso = [
            importacion.noImportados > 0 ? `${importacion.noImportados} comprobante(s) no importado(s): ver el detalle en el Historial de Importaciones de ARCA.` : null,
            excel.aviso || null
        ].filter(Boolean).join(' ') || undefined;
        return { success: true, ...importacion, ...excel, aviso };
    } catch (error) {
        console.error(`        [ImportarLibroIva] ${cuit} ${tipo}: ${error.message}`);
        return { success: false, error: error.code || 'FLUJO_ERROR', message: error.message };
    }
}

/**
 * @param {import('puppeteer').Page} page  Pestaña del portal AFIP (logueada).
 * @param {{cuit: string, nombre?: string}} contribuyente  el OBJETIVO (no el login)
 * @param {{periodo: string, downloadsPath: string}} opciones  periodo 'AAAAMM'
 * @param {(msg: string) => void} [avisar]
 * @returns {Promise<{success, error?, message, ventas?, compras?, downloadDir?}>}
 */
async function procesarCliente(page, contribuyente, { periodo, downloadsPath }, avisar = () => {}) {
    const cuit = String(contribuyente.cuit);
    let portal = null;
    let liva = null;
    try {
        avisar('Abriendo Portal IVA…');
        portal = await abrirPortalIva(page);
        await elegirRepresentado(portal, cuit);
        avisar('Abriendo el Libro IVA del período…');
        liva = await abrirPeriodo(portal, periodo, avisar);

        const ventas = await procesarLibro(liva, 'ventas', contribuyente, { periodo, downloadsPath }, avisar);
        const compras = await procesarLibro(liva, 'compras', contribuyente, { periodo, downloadsPath }, avisar);
        const downloadDir = await getDownloadPathContribuyente(downloadsPath, cuit, contribuyente.nombre || '', 'archivos_afip');

        const success = ventas.success && compras.success;
        const message = success
            ? 'Ventas y Compras importados'
            : [ventas.success ? null : `Ventas: ${ventas.message}`, compras.success ? null : `Compras: ${compras.message}`]
                .filter(Boolean).join(' · ');
        return { success, error: success ? undefined : (ventas.error || compras.error), message, ventas, compras, downloadDir };
    } catch (error) {
        console.error(`        [ImportarLibroIva] ERROR ${cuit}: ${error.message}`);
        return { success: false, error: error.code || 'FLUJO_ERROR', message: error.message };
    } finally {
        // El próximo cliente arranca de nuevo desde el portal.
        for (const p of new Set([liva, portal])) {
            if (p && p !== page) await p.close().catch(() => {});
        }
    }
}

module.exports = { procesarCliente };
