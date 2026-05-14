// flujo_pagarCT.js
// Flujo B de Cuenta Tributaria (SCT): pago directo por (periodo, impuesto).
//
// El usuario ya tiene un Excel previo y sabe qué deuda quiere pagar; entra al
// SCT, marca las filas que matcheen el (periodo, impuesto) que indicó, y
// genera el VEP en una sola pasada — sin descargar Excel ni extraer la tabla
// completa.
//
// Reusa los mismos pasos del Flujo A 2da pasada, salvo el paso 7 que va en
// modo 'match-periodo-impuesto' (en vez de 'ids-explicitos').

const paso_1_abrirSCT = require('../codigoXpagina/paso_1_abrirSCT.js');
const paso_2_cambiarCuitInterno = require('../codigoXpagina/paso_2_cambiarCuitInterno.js');
const paso_3_irAPestanaDeudas = require('../codigoXpagina/paso_3_irAPestanaDeudas.js');
const paso_4_verificarBadge = require('../codigoXpagina/paso_4_verificarBadge.js');
const paso_6_extraerTabla = require('../codigoXpagina/paso_6_extraerTabla.js');
const paso_7_seleccionarFilas = require('../codigoXpagina/paso_7_seleccionarFilas.js');
const paso_8_pagarSeleccionado = require('../codigoXpagina/paso_8_pagarSeleccionado.js');
const paso_9_generarVEP = require('../codigoXpagina/paso_9_generarVEP.js');
const paso_10_seleccionarMedioPago = require('../codigoXpagina/paso_10_seleccionarMedioPago.js');
const paso_11_aceptarModalCT = require('../codigoXpagina/paso_11_aceptarModalCT.js');
const paso_12_descargarPdfCT = require('../codigoXpagina/paso_12_descargarPdfCT.js');

/**
 * @param {import('puppeteer').Page} page  Página AFIP ya logueada.
 * @param {Object} payload {
 *   cliente: { id, nombre, cuitLogin },
 *   cuitAsociado: string,
 *   deudasABuscar: [{ periodo: 'AAAAMM', impuesto: '30' }, ...],
 *   medioPago: { id, nombre }
 * }
 * @param {string} downloadsPath
 * @param {Object} credenciales { usuario, contrasena }
 */
async function ejecutar(page, payload, downloadsPath, credenciales) {
    const { cliente, cuitAsociado, deudasABuscar, medioPago } = payload || {};
    const nombreCliente = cliente && cliente.nombre;

    if (!medioPago || !medioPago.id) {
        return {
            success: false,
            error: 'PAYLOAD_INVALIDO',
            message: 'Falta medioPago en el payload',
            cliente,
            cuitAsociado
        };
    }
    if (!Array.isArray(deudasABuscar) || deudasABuscar.length === 0) {
        return {
            success: false,
            error: 'PAYLOAD_INVALIDO',
            message: 'Falta deudasABuscar en el payload',
            cliente,
            cuitAsociado
        };
    }

    console.log(`🟣 [Flujo pagarDirectoB] Cliente=${nombreCliente} cuit=${cuitAsociado || '-'} medio=${medioPago.nombre} (${deudasABuscar.length} deuda/s a buscar)`);

    try {
        // 1. Abrir SCT.
        const r1 = await paso_1_abrirSCT.ejecutar(page, credenciales);
        if (!r1.success) throw new Error(`Paso 1 (abrirSCT) falló: ${r1.message}`);
        const sctPage = r1.newPage;

        // 2. Cambiar CUIT interno (opcional).
        const r2 = await paso_2_cambiarCuitInterno.ejecutar(sctPage, cuitAsociado);
        if (!r2.success) throw new Error(`Paso 2 (cambiarCuitInterno) falló: ${r2.message}`);

        // 3. Ir a Deudas.
        const r3 = await paso_3_irAPestanaDeudas.ejecutar(sctPage);
        if (!r3.success) throw new Error(`Paso 3 (irAPestanaDeudas) falló: ${r3.message}`);

        // 4. Sanity check del badge.
        const r4 = await paso_4_verificarBadge.ejecutar(sctPage);
        if (!r4.success) throw new Error(`Paso 4 (verificarBadge) falló: ${r4.message}`);
        if (r4.sinDeuda) {
            return {
                success: false,
                error: 'SIN_DEUDA',
                status: 'sin-deuda',
                message: 'El CUIT no tiene deuda pendiente',
                cliente,
                cuitAsociado,
                noMatcheadas: deudasABuscar.map(d => ({ ...d, motivo: 'CUIT sin deuda' }))
            };
        }

        // 5. Setear paginación a "Todos" (sin extraer datos — el match va a buscar
        //    por id de checkbox en el DOM).
        const r6 = await paso_6_extraerTabla.ejecutar(sctPage, { modo: 'soloPaginar' });
        if (!r6.success) throw new Error(`Paso 6 (soloPaginar) falló: ${r6.message}`);

        // 6. Match por (periodo, impuesto) y tildar filas matcheadas.
        const r7 = await paso_7_seleccionarFilas.ejecutar(sctPage, {
            modo: 'match-periodo-impuesto',
            deudasABuscar
        });
        // r7 puede venir success=false si NO matcheó nada — ese no es un error
        // técnico, es el caso "sin-match" que reportamos al front.
        const matcheadas = (r7 && r7.matcheadas) || [];
        const noMatcheadas = (r7 && r7.noMatcheadas) || [];
        if (matcheadas.length === 0) {
            return {
                success: false,
                error: 'SIN_MATCH',
                status: 'sin-match',
                message: 'Ninguna entrada matcheó con la deuda actual',
                cliente,
                cuitAsociado,
                matcheadas,
                noMatcheadas
            };
        }
        if (noMatcheadas.length > 0) {
            console.warn(`  ⚠️ [pagarDirectoB] No matchearon ${noMatcheadas.length} de ${deudasABuscar.length} entradas`);
        }

        // 7. Pagar seleccionado.
        const r8 = await paso_8_pagarSeleccionado.ejecutar(sctPage);
        if (!r8.success) throw new Error(`Paso 8 (pagarSeleccionado) falló: ${r8.message}`);

        // 8. GENERAR VEP (defensivo — si los medios ya están visibles, skipea click).
        const r9 = await paso_9_generarVEP.ejecutar(sctPage);
        if (!r9.success) throw new Error(`Paso 9 (generarVEP) falló: ${r9.message}`);

        // 9. Medio de pago.
        const r10 = await paso_10_seleccionarMedioPago.ejecutar(sctPage, medioPago);
        if (!r10.success) throw new Error(`Paso 10 (seleccionarMedioPago) falló: ${r10.message}`);

        // 10. Aceptar modal.
        const r11 = await paso_11_aceptarModalCT.ejecutar(sctPage);
        if (!r11.success) throw new Error(`Paso 11 (aceptarModalCT) falló: ${r11.message}`);

        // 11. Descargar PDF.
        const r12 = await paso_12_descargarPdfCT.ejecutar(sctPage, cliente, cuitAsociado, medioPago, downloadsPath);
        if (!r12.success) throw new Error(`Paso 12 (descargarPdfCT) falló: ${r12.message}`);

        return {
            success: true,
            status: 'success',
            cliente,
            cuitAsociado,
            medioPago,
            matcheadas,
            noMatcheadas,
            pdfDescargado: r12.pdfDescargado
        };

    } catch (error) {
        console.error('❌ [Flujo pagarDirectoB] Error:', error);
        return {
            success: false,
            error: 'FLUJO_ERROR',
            status: 'error',
            message: error.message,
            cliente,
            cuitAsociado
        };
    }
}

module.exports = { ejecutar };
