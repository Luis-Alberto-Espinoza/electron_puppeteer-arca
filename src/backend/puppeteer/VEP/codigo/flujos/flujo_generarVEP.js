const paso_1_cuentaCorriente = require('../codigoXpagina/paso_1_cuentaCorriente.js');
const paso_2_calculoDeuda = require('../codigoXpagina/paso_2_calculoDeuda.js');
const paso_3_volantePago = require('../codigoXpagina/paso_3_volantePago.js');
const paso_4_seleccionarYCapturarObligaciones = require('../codigoXpagina/paso_4_seleccionarYCapturarObligaciones.js');
const paso_6_generarVEP = require('../codigoXpagina/paso_6_generarVEP.js');
const paso_7_seleccionarPrimerVEP = require('../codigoXpagina/paso_7_seleccionarPrimerVEP.js');
const paso_8_seleccionarMedioPago = require('../codigoXpagina/paso_8_seleccionarMedioPago.js');
const paso_9_aceptarModal = require('../codigoXpagina/paso_9_aceptarModal.js');
const paso_10_descargarPDF = require('../codigoXpagina/paso_10_descargarPDF.js');

/**
 * Ejecuta el flujo completo de generación de VEP
 * @param {Object} page - Página de Puppeteer
 * @param {Object} usuario - Datos del usuario
 * @param {Object} medioPago - Medio de pago seleccionado
 * @param {Array<string>} periodosSeleccionados - Períodos seleccionados por el usuario (opcional)
 * @param {string} downloadsPath - Ruta base para guardar los archivos descargados
 * @returns {Object} Resultado del proceso
 */
async function ejecutarFlujoVEP(page, usuario, medioPago, periodosSeleccionados = null, downloadsPath = null) {
    console.log("🔵 [Flujo VEP] Iniciando flujo completo...");
    console.log(`   Usuario: ${usuario.nombre} (${usuario.cuit})`);
    console.log(`   Medio de pago: ${medioPago.nombre} (${medioPago.id})`);
    if (periodosSeleccionados) {
        console.log(`   Períodos seleccionados: ${periodosSeleccionados.join(', ')}`);
    }

    try {
        let paginaActual = page;

        // PASO 1: Acceder a Cuenta Corriente de Contribuyentes (abre nueva pestaña)
        console.log("🔵 [Flujo VEP] Paso 1/7: Accediendo a Cuenta Corriente...");
        const resultado1 = await paso_1_cuentaCorriente.ejecutar(paginaActual);
        if (!resultado1.success) throw new Error(`Paso 1 falló: ${resultado1.message}`);
        paginaActual = resultado1.newPage; // Cambiamos a la nueva pestaña

        // PASO 2: Click en "Cálculo de Deuda"
        console.log("🔵 [Flujo VEP] Paso 2/7: Calculando deuda...");
        const resultado2 = await paso_2_calculoDeuda.ejecutar(paginaActual);
        if (!resultado2.success) throw new Error(`Paso 2 falló: ${resultado2.message}`);

        // PASO 3: Scroll y click en "Volante de Pago"
        console.log("🔵 [Flujo VEP] Paso 3/7: Generando volante de pago...");
        const resultado3 = await paso_3_volantePago.ejecutar(paginaActual);
        if (!resultado3.success) throw new Error(`Paso 3 falló: ${resultado3.message}`);

        // PASO 4: Seleccionar "Autónomos y Monotributistas" y capturar/seleccionar períodos
        console.log("🔵 [Flujo VEP] Paso 4/7: Seleccionando sección y procesando obligaciones...");
        const resultado4 = await paso_4_seleccionarYCapturarObligaciones.ejecutar(paginaActual, periodosSeleccionados);
        if (!resultado4.success) throw new Error(`Paso 4 falló: ${resultado4.message}`);

        // Si requiere selección, retornar inmediatamente con los datos capturados
        if (resultado4.requiereSeleccion) {
            console.log("🔵 [Flujo VEP] Requiere selección del usuario. Retornando datos...");
            return {
                success: true,
                requiereSeleccion: true,
                periodos: resultado4.periodos,
                usuario: usuario,
                medioPago: medioPago
            };
        }

        // PASO 5: Click en "Generar VEP o QR" (abre nueva pestaña)
        console.log("🔵 [Flujo VEP] Paso 5/7: Generando VEP...");
        const resultado5 = await paso_6_generarVEP.ejecutar(paginaActual);
        if (!resultado5.success) throw new Error(`Paso 5 falló: ${resultado5.message}`);
        paginaActual = resultado5.newPage; // Cambiamos a la nueva pestaña

        // PASO 6: Seleccionar el primer VEP de la lista
        console.log("🔵 [Flujo VEP] Paso 6/7: Seleccionando primer VEP...");
        const resultado6 = await paso_7_seleccionarPrimerVEP.ejecutar(paginaActual);
        if (!resultado6.success) throw new Error(`Paso 6 falló: ${resultado6.message}`);

        // PASO 7: Seleccionar medio de pago según la elección del usuario
        console.log(`🔵 [Flujo VEP] Paso 7/9: Seleccionando medio de pago: ${medioPago.nombre}...`);
        const resultado7 = await paso_8_seleccionarMedioPago.ejecutar(paginaActual, medioPago);
        if (!resultado7.success) throw new Error(`Paso 7 falló: ${resultado7.message}`);

        // PASO 8: Aceptar modal de confirmación
        console.log(`🔵 [Flujo VEP] Paso 8/9: Aceptando modal de confirmación...`);
        const resultado8 = await paso_9_aceptarModal.ejecutar(paginaActual);
        if (!resultado8.success) throw new Error(`Paso 8 falló: ${resultado8.message}`);

        // PASO 9: Descargar PDF del VEP
        console.log(`🔵 [Flujo VEP] Paso 9/9: Descargando PDF del VEP...`);
        const resultado9 = await paso_10_descargarPDF.ejecutar(paginaActual, usuario, medioPago, downloadsPath);
        if (!resultado9.success) throw new Error(`Paso 9 falló: ${resultado9.message}`);

        console.log("✅ [Flujo VEP] Flujo completado exitosamente!");
        console.log(`   PDF guardado: ${resultado9.pdfNombre}`);
        console.log(`   Ruta completa: ${resultado9.pdfPath}`);

        return {
            success: true,
            message: `VEP generado exitosamente para ${usuario.nombre}`,
            medioPago: medioPago.nombre,
            pdfDescargado: {
                nombre: resultado9.pdfNombre,
                path: resultado9.pdfPath,
                datos: resultado9.datosExtraidos
            }
        };

    } catch (error) {
        console.error("❌ [Flujo VEP] Error en el flujo:", error);
        return {
            success: false,
            error: 'FLUJO_ERROR',
            message: error.message,
            stack: error.stack
        };
    }
}

module.exports = {
    ejecutarFlujoVEP
};
