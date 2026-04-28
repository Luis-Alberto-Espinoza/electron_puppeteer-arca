// flujo_consultarCT.js
// Flujo A de Cuenta Tributaria (SCT).
//   - modo='consultarA' : primera pasada (abre SCT, Deudas, Excel + tabla).
//   - modo='pagarA'     : segunda pasada — pendiente fase 4.

const paso_1_abrirSCT = require('../codigoXpagina/paso_1_abrirSCT.js');
const paso_2_cambiarCuitInterno = require('../codigoXpagina/paso_2_cambiarCuitInterno.js');
const paso_3_irAPestanaDeudas = require('../codigoXpagina/paso_3_irAPestanaDeudas.js');
const paso_4_verificarBadge = require('../codigoXpagina/paso_4_verificarBadge.js');
const paso_5_exportarExcel = require('../codigoXpagina/paso_5_exportarExcel.js');
const paso_6_extraerTabla = require('../codigoXpagina/paso_6_extraerTabla.js');

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
        return {
            success: false,
            error: 'NOT_IMPLEMENTED',
            message: 'flujo_consultarCT modo=pagarA aún no implementado (fase 4)',
            modo
        };
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

module.exports = { ejecutar };
