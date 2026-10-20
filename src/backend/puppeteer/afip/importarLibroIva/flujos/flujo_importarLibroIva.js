// Flujo Importar Libro IVA (sesión AFIP ya iniciada). Por cliente:
//   portal → "portal iva" → Portal IVA (pestaña nueva) → representar al cliente →
//   Nueva declaración jurada → período → IVA Simple (Libro IVA, borrador) →
//   Libro Ventas → Libro Compras, cada uno según el origen que eligió el usuario:
//     - ARCA (por defecto): importar desde ARCA + Excel.
//     - archivos: (Excel de respaldo, si se pidió) + Eliminar todo + Importar Archivos (los txt) + Excel.
// NUNCA presenta la DDJJ: deja el borrador cargado. Puede descartar un borrador de OTRO período
// y completar los Datos Iniciales, solo con lo que autorizó/eligió el usuario (paso 3a/3b).
// Cada libro es independiente: si Ventas falla, igual se intenta Compras.
// soloVistaPrevia: no importa nada; del menú del Libro IVA va a la Vista Previa y deja la pestaña
// abierta para que el usuario la revise (el navegador también queda abierto: lo decide el manager),
// con el cartel "El navegador quedó a tu disposición". Si ARCA pide Datos Iniciales, el período no
// tiene declaración iniciada: no hay Vista Previa, no se pregunta nada y se deja esa pantalla.

const path = require('path');
const { getDownloadPathContribuyente } = require('../../../../cliente/carpetaContribuyente.js');
const { abrirPortalIva } = require('../codigoXpagina/paso_1_abrirPortalIva.js');
const { elegirRepresentado } = require('../codigoXpagina/paso_2_elegirRepresentado.js');
const { abrirPeriodo } = require('../codigoXpagina/paso_3_abrirPeriodo.js');
const { importarLibro, LIBROS } = require('../codigoXpagina/paso_4_importarLibro.js');
const { eliminarTodo, importarArchivos } = require('../codigoXpagina/paso_4b_importarArchivos.js');
const { descargarExcel, leerLibro } = require('../codigoXpagina/paso_5_descargarExcel.js');
const { abrirVistaPrevia } = require('../codigoXpagina/paso_6_vistaPrevia.js');
const { avisarEnNavegador } = require('../../../archivos_comunes/navegador/avisarEnNavegador.js');
const { periodoLegible } = require('../codigoXpagina/_comun.js');

const SESION_LIMITADA = '⏱️ La sesión de ARCA dura un tiempo limitado.';

const unirAvisos = (...avisos) => avisos.filter(Boolean).join(' ') || undefined;
const LOG = '        [ImportarLibroIva]';
// "renglón 3 (alícuotas 5): El CUIT es inválido · …"
const textoErrorFila = (e) => `renglón ${e.fila}${e.filaAlicuota != null ? ` (alícuotas ${e.filaAlicuota})` : ''}: ${e.error}`;
const contadores = (i) => `${i.agregados} agregados de ${i.encontrados}, ${i.yaExistentes} ya estaban, ${i.noImportados} con error`;

async function desdeArca(liva, tipo, contribuyente, { periodo, downloadsPath }, avisar) {
    const cuit = String(contribuyente.cuit);
    avisar(`Libro ${LIBROS[tipo].nombre}: importando desde ARCA…`);
    const importacion = await importarLibro(liva, tipo, { cuit, periodo }, avisar);
    console.log(`${LOG} ${cuit} ${LIBROS[tipo].nombre}: importado desde ARCA: ${contadores(importacion)}`);
    avisar(`Libro ${LIBROS[tipo].nombre}: descargando Excel…`);
    const excel = await descargarExcel(liva, tipo, { cuit, nombre: contribuyente.nombre, periodo, downloadsPath });
    console.log(`${LOG} ${cuit} ${LIBROS[tipo].nombre}: Excel ${excel.rutaExcel || `no (${excel.aviso})`}`);
    const aviso = unirAvisos(
        importacion.noImportados > 0 ? `${importacion.noImportados} comprobante(s) no importado(s): ver el detalle en el Historial de Importaciones de ARCA.` : null,
        excel.aviso
    );
    return { success: true, ...importacion, ...excel, aviso };
}

// Lo que había en el libro se reemplaza por los txt. Si el usuario lo pidió, antes se guarda en
// Excel (lo que vino de ARCA se recupera con "Importar desde ARCA"; lo cargado a mano, no).
async function desdeArchivos(liva, tipo, contribuyente, { periodo, downloadsPath }, avisar) {
    const cuit = String(contribuyente.cuit);
    const nombre = LIBROS[tipo].nombre;
    const datos = { cuit, nombre: contribuyente.nombre, periodo, downloadsPath };
    const archivos = contribuyente.archivos;

    const { totalLibro: habia } = await leerLibro(liva, tipo, { cuit, periodo });
    console.log(`${LOG} ${cuit} ${nombre}: el libro tiene ${habia} comprobante(s)`);
    let respaldo = {};
    if (habia > 0) {
        if (contribuyente.respaldo) {
            avisar(`Libro ${nombre}: guardando en Excel los ${habia} comprobante(s) que había…`);
            respaldo = await descargarExcel(liva, tipo, { ...datos, sufijo: '_antes' });
            console.log(`${LOG} ${cuit} ${nombre}: respaldo ${respaldo.rutaExcel || `no (${respaldo.aviso})`}`);
        }
        avisar(`Libro ${nombre}: eliminando los ${habia} comprobante(s)…`);
        await eliminarTodo(liva, tipo);
        const { totalLibro: quedan } = await leerLibro(liva, tipo, { cuit, periodo });
        console.log(`${LOG} ${cuit} ${nombre}: Eliminar todo → quedan ${quedan}`);
        if (quedan > 0) {
            const e = new Error(`"Eliminar todo" dejó ${quedan} comprobante(s) en el Libro ${nombre}: no se importaron los archivos.`);
            e.code = 'ELIMINAR_TODO_FALLO';
            throw e;
        }
    }

    avisar(`Libro ${nombre}: subiendo los archivos…`);
    console.log(`${LOG} ${cuit} ${nombre}: subiendo ${path.basename(archivos[`${tipo}Cbte`])} + ${path.basename(archivos[`${tipo}Alicuotas`])}`);
    let importacion;
    try {
        importacion = await importarArchivos(liva, tipo, {
            cuit, periodo,
            cbte: archivos[`${tipo}Cbte`],
            alicuotas: archivos[`${tipo}Alicuotas`]
        }, avisar);
    } catch (error) {
        // Ya se eliminó lo que había: que se sepa, y que el respaldo siga a mano.
        if (habia > 0) {
            error.message += ` Lo que había (${habia}) quedó eliminado` +
                (respaldo.rutaExcel ? ': está en el Excel anterior.' : ': lo que vino de ARCA se recupera con "Importar desde ARCA".');
            error.rutaRespaldo = respaldo.rutaExcel;
        }
        throw error;
    }
    console.log(`${LOG} ${cuit} ${nombre}: archivos cargados: ${contadores(importacion)}`);
    (importacion.erroresFilas || []).forEach(e => console.log(`${LOG} ${cuit} ${nombre}: ${textoErrorFila(e)}`));
    avisar(`Libro ${nombre}: descargando Excel…`);
    const excel = await descargarExcel(liva, tipo, datos);
    console.log(`${LOG} ${cuit} ${nombre}: Excel ${excel.rutaExcel || `no (${excel.aviso})`}`);
    const aviso = unirAvisos(
        contribuyente.respaldo && habia > 0 && !respaldo.rutaExcel ? `Lo que había (${habia}) se eliminó sin respaldo: ARCA no ofrece Excel con tantos comprobantes.` : null,
        importacion.noImportados > 0 && !(importacion.erroresFilas || []).length
            ? `${importacion.noImportados} renglón(es) con error: ver el detalle en el Historial de Importaciones de ARCA.` : null,
        excel.aviso
    );
    return { success: true, origen: 'archivos', eliminados: habia, rutaRespaldo: respaldo.rutaExcel, ...importacion, ...excel, aviso };
}

async function procesarLibro(liva, tipo, contribuyente, opciones, avisar) {
    const cuit = String(contribuyente.cuit);
    try {
        return contribuyente.origen === 'archivos'
            ? await desdeArchivos(liva, tipo, contribuyente, opciones, avisar)
            : await desdeArca(liva, tipo, contribuyente, opciones, avisar);
    } catch (error) {
        console.error(`        [ImportarLibroIva] ${cuit} ${tipo}: ${error.message}`);
        (error.detalle || []).forEach(d => console.error(`        [ImportarLibroIva] ${cuit} ${tipo}:   ${d}`));
        return { success: false, error: error.code || 'FLUJO_ERROR', message: error.message, detalle: error.detalle, rutaRespaldo: error.rutaRespaldo };
    }
}

/**
 * @param {import('puppeteer').Page} page  Pestaña del portal AFIP (logueada).
 * @param {{cuit: string, nombre?: string, origen?: 'arca'|'archivos', archivos?: object,
 *          descartarPeriodo?: string, datosIniciales?: object}} contribuyente
 *        el OBJETIVO (no el login), con lo que eligió el usuario (Preparación o Resultados).
 *        archivos = { ventasCbte, ventasAlicuotas, comprasCbte, comprasAlicuotas } (rutas ya validadas)
 * @param {{periodo: string, downloadsPath: string, descartarBorrador?: boolean}} opciones  periodo 'AAAAMM'
 * @param {(msg: string) => void} [avisar]
 * @returns {Promise<{success, error?, message, ventas?, compras?, downloadDir?,
 *          borradorDescartado?, datosInicialesCargados?, periodoBorrador?, datosIniciales?}>}
 */
async function procesarCliente(page, contribuyente, { periodo, downloadsPath, descartarBorrador, soloVistaPrevia }, avisar = () => {}) {
    const cuit = String(contribuyente.cuit);
    let portal = null;
    let liva = null;
    try {
        avisar('Abriendo Portal IVA…');
        portal = await abrirPortalIva(page);
        await elegirRepresentado(portal, cuit);
        avisar('Abriendo el Libro IVA del período…');
        const abierto = await abrirPeriodo(portal, periodo, avisar, {
            cuit,
            soloVistaPrevia,
            descartarBorrador,
            descartarPeriodo: contribuyente.descartarPeriodo,
            datosIniciales: contribuyente.datosIniciales
        });
        liva = abierto.liva;
        const { borradorDescartado, datosInicialesCargados } = abierto;

        if (soloVistaPrevia) {
            avisar('Abriendo la Vista Previa…');
            await abrirVistaPrevia(liva);
            console.log(`        [ImportarLibroIva] ${cuit}: Vista Previa abierta, queda para revisar`);
            await avisarEnNavegador(liva,
                `La Vista Previa de ${periodoLegible(periodo)} está lista para revisar y seguir el trámite a mano. ${SESION_LIMITADA}`,
                { log: '        [ImportarLibroIva]' });
            return {
                success: true, vistaPrevia: true, borradorDescartado, datosInicialesCargados,
                message: 'Vista Previa abierta en el navegador: revisala y cerralo a mano'
            };
        }

        const ventas = await procesarLibro(liva, 'ventas', contribuyente, { periodo, downloadsPath }, avisar);
        const compras = await procesarLibro(liva, 'compras', contribuyente, { periodo, downloadsPath }, avisar);
        const downloadDir = await getDownloadPathContribuyente(downloadsPath, cuit, contribuyente.nombre || '', 'archivos_afip');

        const success = ventas.success && compras.success;
        const message = success
            ? (contribuyente.origen === 'archivos' ? 'Ventas y Compras cargados desde los archivos' : 'Ventas y Compras importados')
            : [ventas.success ? null : `Ventas: ${ventas.message}`, compras.success ? null : `Compras: ${compras.message}`]
                .filter(Boolean).join(' · ');
        return {
            success, error: success ? undefined : (ventas.error || compras.error), message, ventas, compras, downloadDir,
            borradorDescartado, datosInicialesCargados
        };
    } catch (error) {
        console.error(`        [ImportarLibroIva] ERROR ${cuit}: ${error.message}`);
        if (error.liva) liva = error.liva;
        if (soloVistaPrevia) {
            // La pestaña queda abierta donde se frenó: que el usuario lo vea ahí también.
            const sinDeclaracion = error.code === 'SIN_DECLARACION_INICIADA';
            const donde = liva || portal;
            if (donde) {
                await avisarEnNavegador(donde, `${error.message} ${SESION_LIMITADA}`,
                    { titulo: sinDeclaracion ? 'No hay Vista Previa' : 'La automatización se detuvo', log: '        [ImportarLibroIva]' });
            }
            if (sinDeclaracion) return { success: true, sinDeclaracion: true, message: error.message };
        }
        // error.datos: lo que el front necesita para ofrecer la acción (período del borrador,
        // opciones de Datos Iniciales) y lo que ya se hizo (borradorDescartado).
        return { success: false, error: error.code || 'FLUJO_ERROR', message: error.message, ...(error.datos || {}) };
    } finally {
        // El próximo cliente arranca de nuevo desde el portal. Con soloVistaPrevia, las pestañas
        // quedan (también si falló: se ve dónde quedó).
        if (!soloVistaPrevia) for (const p of new Set([liva, portal])) {
            if (p && p !== page) await p.close().catch(() => {});
        }
    }
}

module.exports = { procesarCliente };
