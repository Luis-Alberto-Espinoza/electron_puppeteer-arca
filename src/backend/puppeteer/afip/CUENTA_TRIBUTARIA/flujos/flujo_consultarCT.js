// flujo_consultarCT.js
// Flujo A de Cuenta Tributaria (SCT).
//   - modo='consultarA' : primera pasada (abre SCT, Deudas, Excel + tabla).
//   - modo='pagarA'     : segunda pasada (marca filas, paga, genera VEP, descarga PDF).

const paso_1_abrirSCT = require('../codigoXpagina/paso_1_abrirSCT.js');
const paso_2_cambiarCuitInterno = require('../codigoXpagina/paso_2_cambiarCuitInterno.js');
const paso_3_irAPestanaDeudas = require('../codigoXpagina/paso_3_irAPestanaDeudas.js');
const paso_4_verificarBadge = require('../codigoXpagina/paso_4_verificarBadge.js');
const paso_5_exportarExcel = require('../codigoXpagina/paso_5_exportarExcel.js');
const paso_6_extraerTabla = require('../codigoXpagina/paso_6_extraerTabla.js');
const paso_7_seleccionarFilas = require('../codigoXpagina/paso_7_seleccionarFilas.js');
const paso_8_pagarSeleccionado = require('../codigoXpagina/paso_8_pagarSeleccionado.js');
const paso_9_generarVEP = require('../codigoXpagina/paso_9_generarVEP.js');
const paso_10_seleccionarMedioPago = require('../codigoXpagina/paso_10_seleccionarMedioPago.js');
const paso_11_aceptarModalCT = require('../codigoXpagina/paso_11_aceptarModalCT.js');
const paso_12_descargarPdfCT = require('../codigoXpagina/paso_12_descargarPdfCT.js');

/**
 * Ejecuta el flujo A según el modo.
 * @param {import('puppeteer').Page} page - Página ya logueada en el portal AFIP (home).
 * @param {Object} payload - { cliente, cuitAsociado, medioPago? }
 * @param {'consultarA'|'pagarA'} modo
 * @param {string} downloadsPath
 * @param {Object} [credenciales] - { usuario, contrasena } — necesarias por si AFIP pide re-login intermedio al abrir el SCT.
 */
async function ejecutar(page, payload, modo, downloadsPath, credenciales) {
    const { cliente, cuitAsociado } = payload || {};
    const nombreCliente = cliente && cliente.nombre;

    if (modo === 'pagarA') {
        return await ejecutarPagarA(page, payload, downloadsPath, credenciales);
    }

    if (modo !== 'consultarA') {
        return {
            success: false,
            error: 'MODO_INVALIDO',
            message: `flujo_consultarCT: modo desconocido "${modo}"`,
            modo
        };
    }

    console.log(`🔵 [Flujo consultarCT] Cliente=${nombreCliente} cuitAsociado=${cuitAsociado || '-'}`);

    try {
        // 1. Abrir SCT (nueva pestaña). Pasamos credenciales por si AFIP pide re-login intermedio.
        const r1 = await paso_1_abrirSCT.ejecutar(page, credenciales);
        if (!r1.success) throw new Error(`Paso 1 (abrirSCT) falló: ${r1.message}`);
        const sctPage = r1.newPage;

        // 2. Cambiar CUIT interno (opcional).
        const r2 = await paso_2_cambiarCuitInterno.ejecutar(sctPage, cuitAsociado);
        if (!r2.success) throw new Error(`Paso 2 (cambiarCuitInterno) falló: ${r2.message}`);

        // 3. Ir a pestaña Deudas.
        const r3 = await paso_3_irAPestanaDeudas.ejecutar(sctPage);
        if (!r3.success) throw new Error(`Paso 3 (irAPestanaDeudas) falló: ${r3.message}`);

        // 4. Badge.
        const r4 = await paso_4_verificarBadge.ejecutar(sctPage);
        if (!r4.success) throw new Error(`Paso 4 (verificarBadge) falló: ${r4.message}`);

        if (r4.sinDeuda) {
            return {
                success: true,
                sinDeuda: true,
                cliente,
                cuitAsociado,
                message: 'El CUIT no tiene deuda pendiente'
            };
        }

        // 5. Exportar Excel. Si falla, seguimos con la tabla igual.
        const r5 = await paso_5_exportarExcel.ejecutar(sctPage, cliente, cuitAsociado, downloadsPath);
        if (!r5.success) {
            console.warn(`  ⚠️ [Flujo consultarCT] Excel falló (continuando): ${r5.message}`);
        }

        // 6. Extraer tabla completa.
        const r6 = await paso_6_extraerTabla.ejecutar(sctPage, { modo: 'completo' });
        if (!r6.success) throw new Error(`Paso 6 (extraerTabla) falló: ${r6.message}`);

        return {
            success: true,
            requiereSeleccion: true,
            cliente,
            cuitAsociado,
            excelDescargado: r5.success ? r5.excelDescargado : null,
            excelError: r5.success ? null : r5.message,
            deudas: r6.deudas,
            totales: r6.totales,
            cantidadFilas: r6.cantidad
        };

    } catch (error) {
        console.error('❌ [Flujo consultarCT] Error:', error);
        return {
            success: false,
            error: 'FLUJO_ERROR',
            message: error.message,
            cliente,
            cuitAsociado
        };
    }
}

// ============================================================
// FLUJO A — SEGUNDA PASADA (modo='pagarA')
// ============================================================
//
// payload = {
//   cliente, cuitAsociado,
//   medioPago: { id, nombre },
//   idsSeleccionadas: ["0-30-19-19-202412-0", ...]
// }
//
// Pasos: 1 → 2 → 3 → 4 (sanity) → 6.soloPaginar → 7 → 8 → 9 → 10 → 11 → 12.

async function ejecutarPagarA(page, payload, downloadsPath, credenciales) {
    const { cliente, cuitAsociado, medioPago, idsSeleccionadas } = payload || {};
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
    if (!Array.isArray(idsSeleccionadas) || idsSeleccionadas.length === 0) {
        return {
            success: false,
            error: 'PAYLOAD_INVALIDO',
            message: 'Falta idsSeleccionadas en el payload',
            cliente,
            cuitAsociado
        };
    }

    console.log(`🟣 [Flujo pagarA] Cliente=${nombreCliente} cuit=${cuitAsociado || '-'} medio=${medioPago.nombre} (${idsSeleccionadas.length} fila/s)`);

    try {
        // 1. Abrir SCT.
        const r1 = await paso_1_abrirSCT.ejecutar(page, credenciales);
        if (!r1.success) throw new Error(`Paso 1 (abrirSCT) falló: ${r1.message}`);
        const sctPage = r1.newPage;

        // 2. Cambiar CUIT interno (opcional).
        const r2 = await paso_2_cambiarCuitInterno.ejecutar(sctPage, cuitAsociado);
        if (!r2.success) throw new Error(`Paso 2 (cambiarCuitInterno) falló: ${r2.message}`);

        // 3. Ir a pestaña Deudas.
        const r3 = await paso_3_irAPestanaDeudas.ejecutar(sctPage);
        if (!r3.success) throw new Error(`Paso 3 (irAPestanaDeudas) falló: ${r3.message}`);

        // 4. Sanity check del badge: si no hay deuda, no podemos pagar.
        const r4 = await paso_4_verificarBadge.ejecutar(sctPage);
        if (!r4.success) throw new Error(`Paso 4 (verificarBadge) falló: ${r4.message}`);
        if (r4.sinDeuda) {
            return {
                success: false,
                error: 'SIN_DEUDA',
                status: 'sin-deuda',
                message: 'El CUIT ya no tiene deuda pendiente (puede haberse pagado entre pasadas)',
                cliente,
                cuitAsociado
            };
        }

        // 5. Setear paginación a "Todos" (sin extraer datos — ya los tenemos).
        const r6 = await paso_6_extraerTabla.ejecutar(sctPage, { modo: 'soloPaginar' });
        if (!r6.success) throw new Error(`Paso 6 (soloPaginar) falló: ${r6.message}`);

        // 6. Marcar las filas que el usuario eligió.
        const r7 = await paso_7_seleccionarFilas.ejecutar(sctPage, {
            modo: 'ids-explicitos',
            idsSeleccionadas
        });
        if (!r7.success) {
            throw new Error(`Paso 7 (seleccionarFilas) falló: ${r7.message}`);
        }
        if (r7.noEncontradas && r7.noEncontradas.length > 0) {
            console.warn(`  ⚠️ [pagarA] Filas no encontradas: ${r7.noEncontradas.join(', ')}`);
        }

        // 7. Click "Pagar seleccionado".
        const r8 = await paso_8_pagarSeleccionado.ejecutar(sctPage);
        if (!r8.success) throw new Error(`Paso 8 (pagarSeleccionado) falló: ${r8.message}`);

        // 8. Click "GENERAR VEP".
        const r9 = await paso_9_generarVEP.ejecutar(sctPage);
        if (!r9.success) throw new Error(`Paso 9 (generarVEP) falló: ${r9.message}`);

        // 9. Elegir medio de pago.
        const r10 = await paso_10_seleccionarMedioPago.ejecutar(sctPage, medioPago);
        if (!r10.success) throw new Error(`Paso 10 (seleccionarMedioPago) falló: ${r10.message}`);

        // 10. Aceptar modal.
        const r11 = await paso_11_aceptarModalCT.ejecutar(sctPage);
        if (!r11.success) throw new Error(`Paso 11 (aceptarModalCT) falló: ${r11.message}`);

        // 11. Descargar el PDF.
        const r12 = await paso_12_descargarPdfCT.ejecutar(sctPage, cliente, cuitAsociado, medioPago, downloadsPath);
        if (!r12.success) throw new Error(`Paso 12 (descargarPdfCT) falló: ${r12.message}`);

        return {
            success: true,
            status: 'success',
            cliente,
            cuitAsociado,
            medioPago,
            idsSeleccionadas,
            marcadas: r7.marcadas,
            noEncontradas: r7.noEncontradas || [],
            pdfDescargado: r12.pdfDescargado
        };

    } catch (error) {
        console.error('❌ [Flujo pagarA] Error:', error);
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
