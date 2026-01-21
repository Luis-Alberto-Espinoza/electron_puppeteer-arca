/**
 * Flujo de Facturación UNIFICADO (REHECHO CORRECTAMENTE)
 *
 * Combina EXACTAMENTE los flujos:
 * - flujo_Factura.js (modo simple: masivo/manual/mercadopago)
 * - flujo_Factura_tipificada.js (modo detallado: cliente específico)
 *
 * COPIADO LÍNEA POR LÍNEA de los originales que funcionan.
 *
 * Detecta automáticamente el modo según la estructura de datos:
 * - MODO SIMPLE: usa datos.montoResultados.facturasGeneradas
 * - MODO DETALLADO: usa datos.lineasDetalle (array)
 *
 * MODO SIMPLE:
 * - Una línea por factura (descripción automática)
 * - Cierra navegador al final
 * - Hace consulta de comprobantes
 *
 * MODO DETALLADO:
 * - Múltiples líneas por factura
 * - NO cierra navegador (vuelve a menú principal)
 * - NO hace consulta (por ahora)
 * - Reporta progreso
 * - Sistema de reintentos
 * - Descarga PDF
 */

const { menuPrincipal } = require('../codigoXpagina/menuPrincipal');
const { paso_0_seleccionarPuntoDeVenta } = require('../codigoXpagina/paso_0_PuntosDeVentas');
const { paso_1_DatosDeEmision_Productos } = require('../codigoXpagina/paso_1_DatosDeEmision_Productos');
const { paso_1_DatosDeEmision_Servicio } = require('../codigoXpagina/paso_1_DatosDeEmision_Servicio');

// Importar pasos UNIFICADOS
const { paso_2_DatosDelReceptor_Unificado } = require('../codigoXpagina/paso_2_DatosDelReceptor_Unificado');
const { paso_3_DatosDeOperacion_Unificado } = require('../codigoXpagina/paso_3_DatosDeOperacion_Unificado');
const { paso_4_ConfirmarFactura_Unificado } = require('../codigoXpagina/paso_4_ConfirmarFactura_Unificado');

// Funciones comunes
const { paso_X_ConsultaComprobantes } = require('../codigoXpagina/consultaDeComprobante_formulario');
const { buscarEnAfip } = require('../../../archivosComunes/buscadorAfip.js');
const { seleccionarEmpresa } = require('../../../../empresasDisponibles');
const { extraerDatosDeConsultaComprobantes } = require('../../consultarFacturas/comprobarFacturado');

let respuesta;

/**
 * Ejecuta el flujo de facturación unificado
 *
 * FIRMA EXACTA copiada de los originales.
 *
 * @param {Object} page - Página de Puppeteer (ya logueada)
 * @param {Object} datos - Datos normalizados de facturación
 * @param {boolean} modoTest - Si es true, no confirma facturas
 * @param {Object} credenciales - {cuit, claveAFIP, nombreEmpresa}
 * @param {Object} usuarioSeleccionado - Usuario completo
 * @param {string} empresaElegida - Nombre de la empresa
 * @param {Function} enviarProgreso - Callback para reportar progreso (opcional)
 * @param {string} downloadsPath - Ruta base de descargas (opcional)
 * @returns {Promise<Object>} Resultado del proceso
 */
const ejecutar_FacturacionUnificado = async (
    page,
    datos,
    modoTest,
    credenciales,
    usuarioSeleccionado,
    empresaElegida,
    enviarProgreso = null,
    downloadsPath = null
) => {
    try {
        console.log("\n╔═══════════════════════════════════════════════════╗");
        console.log("║  FLUJO DE FACTURACIÓN UNIFICADO                    ║");
        console.log("╚═══════════════════════════════════════════════════╝\n");

        // ==========================================
        // DETECTAR MODO
        // ==========================================
        const esModoDetallado = datos.lineasDetalle && Array.isArray(datos.lineasDetalle) && datos.lineasDetalle.length > 0;
        const modo = esModoDetallado ? 'DETALLADO' : 'SIMPLE';

        console.log(`=== MODO DETECTADO: ${modo} ===`);
        console.log(`  - Tipo actividad: ${datos.tipoActividad}`);
        console.log(`  - Tipo contribuyente: ${datos.tipoContribuyente}`);
        console.log(`  - Modo test: ${modoTest}`);

        if (esModoDetallado) {
            console.log(`  - Líneas de detalle: ${datos.lineasDetalle.length}`);
            console.log(`  - Receptor: ${datos.receptor?.numeroDocumento || 'genérico'}`);
        } else {
            console.log(`  - Facturas generadas: ${datos.montoResultados?.facturasGeneradas?.length || 0}`);
        }

        // ==========================================
        // FUNCIÓN AUXILIAR PARA ESPERAR (COPIADA EXACTA)
        // ==========================================
        const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // ==========================================
        // FUNCIÓN AUXILIAR PARA EJECUTAR PASOS CON VERIFICACIÓN (COPIADA EXACTA)
        // Tomada de flujo_Factura.js líneas 42-86
        // ==========================================
        const ejecutarPasoConVerificacion = async (nombrePaso, funcion, ...args) => {
            try {
                console.log(`\n=== Iniciando paso: ${nombrePaso} ===\n`);
                console.time(nombrePaso);

                // Reducir el tiempo de espera antes de ejecutar el paso
                await esperar(500);

                const resultado = await funcion(...args);

                // Reducir el tiempo de espera después de la ejecución
                await esperar(1000);

                // Verificar que no hay errores en la página
                const hayError = await args[0].evaluate(() => {
                    const mensajesError = document.querySelectorAll('.error, .alert-danger');
                    return mensajesError.length > 0;
                });

                if (hayError) {
                    // Si hay error, intentar recuperarse
                    console.log(`Detectado error en ${nombrePaso}, intentando recuperar...`);
                    await esperar(2000);

                    // Verificar si el error persiste
                    const errorPersiste = await args[0].evaluate(() => {
                        const mensajesError = document.querySelectorAll('.error, .alert-danger');
                        return mensajesError.length > 0;
                    });

                    if (errorPersiste) {
                        throw new Error(`Error persistente en ${nombrePaso}`);
                    }
                }

                console.log(`${nombrePaso} completado exitosamente`);
                console.timeEnd(nombrePaso);
                return resultado;
            } catch (error) {
                console.error(`Error en ${nombrePaso}:`, error);
                console.timeEnd(nombrePaso);
                throw error;
            }
        };

        // ==========================================
        // INICIALIZACIÓN (COPIADA EXACTA de ambos flujos)
        // De flujo_Factura.js líneas 88-100 y flujo_Factura_tipificada.js líneas 96-107
        // ==========================================
        const newPage = await ejecutarPasoConVerificacion(
            'Buscar Comprobante en Línea',
            async (p) => await buscarEnAfip(p, 'compr', { esperarNuevaPestana: true }),
            page
        );

        const pagePuntoDeVenta = await ejecutarPasoConVerificacion(
            'Elegir Punto de Venta',
            seleccionarEmpresa,
            newPage,
            credenciales.nombreEmpresa
        );

        // ==========================================
        // BIFURCACIÓN SEGÚN MODO
        // ==========================================

        if (esModoDetallado) {
            // ==========================================
            // MODO DETALLADO (COPIADO EXACTO de flujo_Factura_tipificada.js)
            // ==========================================
            console.log("\n=== EJECUTANDO MODO DETALLADO (Cliente específico) ===\n");

            // Normalizar datos: si es un array de facturas, procesarlo; si es una sola, convertirlo en array
            // COPIADO de línea 37
            const facturas = Array.isArray(datos) ? datos : [datos];
            const cantidad = facturas.length;
            console.log(`Total de facturas a procesar: ${cantidad}`);

            // Enviar progreso inicial (COPIADO líneas 42-48)
            if (enviarProgreso) {
                enviarProgreso({
                    tipo: 'inicio',
                    totalFacturas: cantidad,
                    mensaje: `Iniciando proceso de facturación para ${cantidad} factura(s)...`
                });
            }

            // ===== MODO TEST: Solo procesar primera factura sin confirmar =====
            // COPIADO líneas 110-212
            if (modoTest) {
                console.log("\n🧪 MODO TEST: Solo se procesará la primera factura sin confirmar");

                if (enviarProgreso) {
                    enviarProgreso({
                        tipo: 'procesando',
                        facturaActual: 1,
                        totalFacturas: cantidad,
                        paso: 'modo-test',
                        mensaje: 'Modo TEST: Procesando primera factura sin confirmar...'
                    });
                }

                const facturaPrueba = facturas[0];

                // Ejecutar pasos hasta la confirmación (sin confirmar)
                await ejecutarPasoConVerificacion(
                    'Menú Principal',
                    menuPrincipal,
                    pagePuntoDeVenta,
                    { botonId: "btn_gen_cmp" }
                );

                await ejecutarPasoConVerificacion(
                    'Selección Punto de Venta',
                    paso_0_seleccionarPuntoDeVenta,
                    pagePuntoDeVenta,
                    facturaPrueba,
                    null
                );

                if (facturaPrueba.tipoActividad === 'Producto') {
                    await ejecutarPasoConVerificacion(
                        'Datos de Emisión - Productos',
                        paso_1_DatosDeEmision_Productos,
                        pagePuntoDeVenta,
                        facturaPrueba,
                        null,
                        modoTest
                    );
                } else if (facturaPrueba.tipoActividad === 'Servicio') {
                    await ejecutarPasoConVerificacion(
                        'Datos de Emisión - Servicio',
                        paso_1_DatosDeEmision_Servicio,
                        pagePuntoDeVenta,
                        facturaPrueba,
                        { 0: facturaPrueba.fechaDesde || facturaPrueba.fechaComprobante },
                        modoTest
                    );
                }

                await ejecutarPasoConVerificacion(
                    'Datos del Receptor',
                    paso_2_DatosDelReceptor_Unificado,
                    pagePuntoDeVenta,
                    facturaPrueba
                );

                // Usar paso_3 unificado
                await ejecutarPasoConVerificacion(
                    'Datos de Operación',
                    paso_3_DatosDeOperacion_Unificado,
                    pagePuntoDeVenta,
                    facturaPrueba,
                    0 // índice de factura
                );

                // Tomar screenshot en lugar de confirmar
                const os = require('os');
                const path = require('path');
                const screenshotPath = path.join(os.tmpdir(), 'factura_cliente_confirmacion.png');
                await pagePuntoDeVenta.screenshot({ path: screenshotPath, fullPage: true });
                console.log('📸 Screenshot guardado en:', screenshotPath);

                // Mostrar con visor
                const { fork } = require('child_process');
                const visorProcess = fork(path.join(__dirname, '../../../../archivos_comunes/visorImagen.js'));
                visorProcess.send({ screenshotPath });

                if (enviarProgreso) {
                    enviarProgreso({
                        tipo: 'test-completado',
                        mensaje: 'Modo TEST: Revisa la captura para verificar los datos',
                        screenshotPath: screenshotPath
                    });
                }

                return {
                    success: true,
                    modoTest: true,
                    mensaje: 'Modo TEST completado - Revisa la captura',
                    screenshotPath: screenshotPath
                };
            }

            // ===== MODO PRODUCCIÓN: Procesar todas las facturas =====
            // COPIADO líneas 215-428
            const resultadosFacturas = [];
            const MAX_REINTENTOS = 1;

            // Función para procesar una factura con reintentos (COPIADA líneas 218-393)
            const procesarFacturaConReintento = async (facturaActual, facturaIndex, intento = 0) => {
                // Definir clienteIdentificador FUERA del try para que esté disponible en el catch
                const clienteIdentificador = facturaActual.receptor?.numeroDocumento || facturaActual.receptor?.nombreCliente || `Factura ${facturaIndex + 1}`;

                try {
                    // Enviar progreso: iniciando factura
                    if (enviarProgreso) {
                        enviarProgreso({
                            tipo: 'procesando',
                            facturaActual: facturaIndex + 1,
                            totalFacturas: cantidad,
                            paso: 'completando-datos',
                            mensaje: `Factura ${facturaIndex + 1}/${cantidad}: Iniciando - Cliente ${clienteIdentificador}`,
                            cliente: clienteIdentificador,
                            intento: intento + 1
                        });
                    }

                    console.log(`\n=== Procesando factura ${facturaIndex + 1} de ${cantidad} (intento ${intento + 1}) ===`);

                    // Reducir el tiempo de espera entre facturas
                    await esperar(500);

                    // ===== GENERAR COMPROBANTE =====
                    await ejecutarPasoConVerificacion(
                        'Menú Principal',
                        menuPrincipal,
                        pagePuntoDeVenta,
                        { botonId: "btn_gen_cmp" }
                    );

                    // ===== PASO 0: Selección de Punto de Venta =====
                    await ejecutarPasoConVerificacion(
                        'Selección Punto de Venta',
                        paso_0_seleccionarPuntoDeVenta,
                        pagePuntoDeVenta,
                        facturaActual,
                        null // No usamos factura de array, datos vienen completos del frontend
                    );

                    // ===== PASO 1: Datos de Emisión (Producto o Servicio) =====
                    if (facturaActual.tipoActividad === 'Producto') {
                        await ejecutarPasoConVerificacion(
                            'Datos de Emisión - Productos',
                            paso_1_DatosDeEmision_Productos,
                            pagePuntoDeVenta,
                            facturaActual,
                            null,
                            modoTest
                        );
                    } else if (facturaActual.tipoActividad === 'Servicio') {
                        await ejecutarPasoConVerificacion(
                            'Datos de Emisión - Servicio',
                            paso_1_DatosDeEmision_Servicio,
                            pagePuntoDeVenta,
                            facturaActual,
                            { 0: facturaActual.fechaDesde || facturaActual.fechaComprobante }, // Formato compatible
                            modoTest
                        );
                    }

                    // ===== PASO 2: Datos del Receptor (UNIFICADO) =====
                    await ejecutarPasoConVerificacion(
                        'Datos del Receptor',
                        paso_2_DatosDelReceptor_Unificado,
                        pagePuntoDeVenta,
                        facturaActual
                    );

                    // ===== PASO 3: Datos de Operación (UNIFICADO) =====
                    await ejecutarPasoConVerificacion(
                        'Datos de Operación',
                        paso_3_DatosDeOperacion_Unificado,
                        pagePuntoDeVenta,
                        facturaActual,
                        facturaIndex // índice de factura
                    );

                    // Progreso: confirmando
                    if (enviarProgreso) {
                        enviarProgreso({
                            tipo: 'procesando',
                            facturaActual: facturaIndex + 1,
                            totalFacturas: cantidad,
                            paso: 'confirmando',
                            mensaje: `Factura ${facturaIndex + 1}/${cantidad}: Confirmando factura...`,
                            cliente: clienteIdentificador
                        });
                    }

                    // ===== PASO 4: Confirmar Factura y Descargar PDF (UNIFICADO) =====
                    const resultadoConfirmacion = await ejecutarPasoConVerificacion(
                        'Confirmar Factura y Descargar PDF',
                        paso_4_ConfirmarFactura_Unificado,
                        pagePuntoDeVenta,
                        modoTest,
                        usuarioSeleccionado, // Para configurar carpeta de descarga
                        downloadsPath // Ruta base de descargas
                    );

                    // Progreso: PDF generado
                    if (enviarProgreso) {
                        enviarProgreso({
                            tipo: 'factura-completada',
                            facturaActual: facturaIndex + 1,
                            totalFacturas: cantidad,
                            mensaje: `Factura ${facturaIndex + 1}/${cantidad}: ✓ PDF generado`,
                            cliente: clienteIdentificador,
                            pdfPath: resultadoConfirmacion.pdfPath
                        });
                    }

                    console.log(`✓ Factura ${facturaIndex + 1}/${cantidad} completada: ${resultadoConfirmacion.pdfPath || 'N/A'}`);

                    return {
                        success: true,
                        facturaNumero: facturaIndex + 1,
                        pdfPath: resultadoConfirmacion.pdfPath,
                        pdfNombre: resultadoConfirmacion.pdfPath ? require('path').basename(resultadoConfirmacion.pdfPath) : null,
                        receptor: facturaActual.receptor,
                        cliente: clienteIdentificador
                    };

                } catch (error) {
                    console.error(`❌ Error en factura ${facturaIndex + 1} (intento ${intento + 1}):`, error);

                    // Si no hemos alcanzado el máximo de reintentos
                    if (intento < MAX_REINTENTOS) {
                        if (enviarProgreso) {
                            enviarProgreso({
                                tipo: 'error',
                                facturaActual: facturaIndex + 1,
                                totalFacturas: cantidad,
                                mensaje: `Factura ${facturaIndex + 1}/${cantidad}: Error - reintentando en 2 segundos...`,
                                error: error.message,
                                cliente: clienteIdentificador
                            });
                        }

                        console.log(`🔄 Reintentando factura ${facturaIndex + 1} en 2 segundos...`);
                        await esperar(2000);
                        return procesarFacturaConReintento(facturaActual, facturaIndex, intento + 1);
                    } else {
                        // Falló definitivamente
                        if (enviarProgreso) {
                            enviarProgreso({
                                tipo: 'error',
                                facturaActual: facturaIndex + 1,
                                totalFacturas: cantidad,
                                mensaje: `Factura ${facturaIndex + 1}/${cantidad}: ❌ Falló después de ${intento + 1} intento(s)`,
                                error: error.message,
                                cliente: clienteIdentificador
                            });
                        }

                        return {
                            success: false,
                            facturaNumero: facturaIndex + 1,
                            error: error.message,
                            intentos: intento + 1,
                            cliente: clienteIdentificador
                        };
                    }
                }
            };

            // ===== LOOP PRINCIPAL: Procesar cada factura =====
            // COPIADO líneas 396-404
            for (let i = 0; i < cantidad; i++) {
                const resultado = await procesarFacturaConReintento(facturas[i], i);
                resultadosFacturas.push(resultado);

                // Espera entre facturas (excepto la última)
                if (i < cantidad - 1) {
                    await esperar(1000);
                }
            }

            // ===== RESUMEN FINAL =====
            // COPIADO líneas 407-428
            const exitosas = resultadosFacturas.filter(r => r.success).length;
            const fallidas = resultadosFacturas.filter(r => !r.success).length;

            console.log("\n=== Proceso de facturación para cliente completado ===");
            console.log(`📊 RESUMEN:`);
            console.log(`   Total: ${cantidad}`);
            console.log(`   ✅ Exitosas: ${exitosas}`);
            console.log(`   ❌ Fallidas: ${fallidas}\n`);

            // Retornar resultado con información de todas las facturas
            return {
                success: exitosas > 0, // Success si al menos una factura se generó
                message: exitosas === cantidad
                    ? `✅ ${cantidad} factura(s) generada(s) exitosamente`
                    : `⚠️  ${exitosas} exitosa(s), ${fallidas} fallida(s) de ${cantidad} total`,
                data: {
                    totalFacturas: cantidad,
                    exitosas: exitosas,
                    fallidas: fallidas,
                    resultados: resultadosFacturas
                }
            };

        } else {
            // ==========================================
            // MODO SIMPLE (COPIADO EXACTO de flujo_Factura.js)
            // ==========================================
            console.log("\n=== EJECUTANDO MODO SIMPLE (Masivo/Manual/MercadoPago) ===\n");

            // Preparar datos de consulta (COPIADO líneas 20-36)
            let cantidad = datos.montoResultados.facturasGeneradas.length;
            let tipoContribuyente = 0;
            if (usuarioSeleccionado.tipoContribuyente === 'B') {
                tipoContribuyente = 6;
            } else if (usuarioSeleccionado.tipoContribuyente === 'C') {
                tipoContribuyente = 11;
            } else {
                console.error("No se ha seleccionado un usuario válido.");
                return { success: false, message: "No se ha seleccionado un usuario válido." };
            }

            const datosConsulta = {
                consultaDesde: datos.montoResultados.facturasGeneradas[0][0],
                consultaHasta: datos.montoResultados.facturasGeneradas[cantidad - 1][0],
                idTipoComprobante: tipoContribuyente,
                idPuntoDeVenta: empresaElegida
            };

            // Procesar cada factura de manera secuencial (COPIADO líneas 104-182)
            for (let i = 0; i < cantidad; i++) {
                console.log(`\n=== Procesando factura ${i + 1} de ${cantidad} ===\n`);
                const factura = datos.montoResultados.facturasGeneradas[i];

                // Reducir el tiempo de espera entre facturas
                await esperar(500);

                // menu principal -> generar comprobantes
                await ejecutarPasoConVerificacion(
                    'Menú Principal',
                    menuPrincipal,
                    pagePuntoDeVenta,
                    { botonId: "btn_gen_cmp" }
                );

                await ejecutarPasoConVerificacion(
                    'Selección Punto de Venta',
                    paso_0_seleccionarPuntoDeVenta,
                    pagePuntoDeVenta,
                    datos,
                    factura
                );

                if (datos.tipoActividad === 'Producto') {
                    await ejecutarPasoConVerificacion(
                        'Datos de Emisión - Productos',
                        paso_1_DatosDeEmision_Productos,
                        pagePuntoDeVenta,
                        datos,
                        factura,
                        modoTest
                    );
                } else if (datos.tipoActividad === 'Servicio') {
                    await ejecutarPasoConVerificacion(
                        'Datos de Emisión - Servicio',
                        paso_1_DatosDeEmision_Servicio,
                        pagePuntoDeVenta,
                        datos,
                        factura,
                        modoTest
                    );
                }

                await ejecutarPasoConVerificacion(
                    'Datos del Receptor',
                    paso_2_DatosDelReceptor_Unificado,
                    pagePuntoDeVenta,
                    datos
                );

                // Usar paso_3 unificado
                await ejecutarPasoConVerificacion(
                    'Datos de Operación',
                    paso_3_DatosDeOperacion_Unificado,
                    pagePuntoDeVenta,
                    datos,
                    i
                );

                await ejecutarPasoConVerificacion(
                    'Confirmar Factura',
                    paso_4_ConfirmarFactura_Unificado,
                    pagePuntoDeVenta,
                    modoTest
                );

                // Reducir la espera adicional entre facturas
                await esperar(1000);
            }

            // Solo ejecutar la consulta y extracción si test es false (COPIADO líneas 184-250)
            if (!modoTest) {
                // menu principal -> generar CONSULTA
                await ejecutarPasoConVerificacion(
                    'Menú Principal',
                    menuPrincipal,
                    pagePuntoDeVenta,
                    { botonId: "btn_consultas" }
                );

                // Consulta de comprobantes
                await ejecutarPasoConVerificacion(
                    'Formulario de Consultas de Comprobante',
                    paso_X_ConsultaComprobantes,
                    pagePuntoDeVenta,
                    datosConsulta
                );

                // Extraer los datos de la consulta
                respuesta = await ejecutarPasoConVerificacion(
                    'Extraer Datos de la Consulta',
                    extraerDatosDeConsultaComprobantes,
                    pagePuntoDeVenta
                );
                console.log("Datos extraídos de la consulta:", respuesta);

                console.log("Proceso de facturación completado correctamente.");

                // hacer log de la url actual
                const urlActual = pagePuntoDeVenta.url();
                console.log("URL actual:", urlActual);

                // cerrar el navegador
                await pagePuntoDeVenta.close();
                await page.close();
            }

            return { success: true, message: "Proceso completado", data: respuesta?.data };
        }

    } catch (error) {
        console.error("Error en ejecutar_FacturacionUnificado:", error);
        throw error;
    }
};

module.exports = { ejecutar_FacturacionUnificado };
