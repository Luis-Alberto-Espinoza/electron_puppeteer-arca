/**
 * Flujo de Facturación para Cliente Específico
 *
 * Este flujo permite generar facturas con datos detallados del cliente:
 * - Condición IVA seleccionable
 * - Número de documento del receptor
 * - Condiciones de venta (checkboxes)
 * - Descripción personalizada (desde frontend)
 * - Múltiples líneas de detalle
 * - Generación de PDF en carpeta específica del cliente
 */

const { menuPrincipal } = require('../codigoXpagina/menuPrincipal');
const { paso_0_seleccionarPuntoDeVenta } = require('../codigoXpagina/paso_0_PuntosDeVentas');
const { paso_1_DatosDeEmision_Productos } = require('../codigoXpagina/paso_1_DatosDeEmision_Productos');
const { paso_1_DatosDeEmision_Servicio } = require('../codigoXpagina/paso_1_DatosDeEmision_Servicio');

// Usar pasos ORIGINALES que ya funcionan (del flujo normal)
const { paso_2_DatosDelReceptor_Cliente } = require('../codigoXpagina/paso_2_DatosDelReceptor_Cliente');
const { paso_3_DatosDeOperacion_Factura_B } = require('../codigoXpagina/paso_3_DatosDeOperacion_Factura_B');
const { paso_3_DatosDeOperacion_Cliente } = require('../codigoXpagina/paso_3_DatosDeOperacion_Cliente');
const { paso_4_ConfirmarFactura_Cliente } = require('../codigoXpagina/paso_4_ConfirmarFactura_Cliente');

const { buscarEnAfip } = require('../../../../buscadorAfip');
const { elegirEmpresaDisponible } = require('../../../../elegirEmpresaDisponible');

let respuesta;

const ejecutar_FacturaCliente = async (page, datos, modoTest, credenciales, usuarioSeleccionado, empresaElegida, enviarProgreso = null, downloadsPath = null) => {
    try {
        console.log("\n\n === Iniciando flujo de factura para cliente ===");
        console.log("Datos recibidos:", datos);
        console.log("Usuario:", usuarioSeleccionado);
        console.log("Empresa:", empresaElegida);

        // Normalizar datos: si es un array de facturas, procesarlo; si es una sola, convertirlo en array
        const facturas = Array.isArray(datos) ? datos : [datos];
        const cantidad = facturas.length;
        console.log(`Total de facturas a procesar: ${cantidad}`);

        // Enviar progreso inicial
        if (enviarProgreso) {
            enviarProgreso({
                tipo: 'inicio',
                totalFacturas: cantidad,
                mensaje: `Iniciando proceso de facturación para ${cantidad} factura(s)...`
            });
        }

        // Función auxiliar para esperar
        const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Función auxiliar para ejecutar pasos con verificación de errores
        const ejecutarPasoConVerificacion = async (nombrePaso, funcion, ...args) => {
            try {
                console.log(`\n=== Iniciando paso: ${nombrePaso} ===\n`);
                console.time(nombrePaso);

                await esperar(500);

                const resultado = await funcion(...args);

                await esperar(1000);

                // Verificar que no hay errores en la página
                const hayError = await args[0].evaluate(() => {
                    const mensajesError = document.querySelectorAll('.error, .alert-danger');
                    return mensajesError.length > 0;
                });

                if (hayError) {
                    console.log(`Detectado error en ${nombrePaso}, intentando recuperar...`);
                    await esperar(2000);

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

        // ===== INICIALIZACIÓN =====
        const newPage = await ejecutarPasoConVerificacion(
            'Buscar Comprobante en Línea',
            async (p) => await buscarEnAfip(p, 'compr', { esperarNuevaPestana: true }),
            page
        );

        const pagePuntoDeVenta = await ejecutarPasoConVerificacion(
            'Elegir Punto de Venta',
            elegirEmpresaDisponible,
            newPage,
            credenciales.nombreEmpresa
        );

        // ===== MODO TEST: Solo procesar primera factura sin confirmar =====
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
                paso_2_DatosDelReceptor_Cliente,
                pagePuntoDeVenta,
                facturaPrueba
            );

            if (facturaPrueba.tipoContribuyente === 'B') {
                await ejecutarPasoConVerificacion(
                    'Datos de Operación - Factura B',
                    paso_3_DatosDeOperacion_Factura_B,
                    pagePuntoDeVenta,
                    facturaPrueba,
                    0 // índice de factura
                );
            } else if (facturaPrueba.tipoContribuyente === 'C') {
                await ejecutarPasoConVerificacion(
                    'Datos de Operación - Factura C',
                    paso_3_DatosDeOperacion_Cliente,
                    pagePuntoDeVenta,
                    facturaPrueba,
                    0 // índice de factura
                );
            }

            // Tomar screenshot en lugar de confirmar
            const os = require('os');
            const path = require('path');
            const screenshotPath = path.join(os.tmpdir(), 'factura_cliente_confirmacion.png');
            await pagePuntoDeVenta.screenshot({ path: screenshotPath, fullPage: true });
            console.log('📸 Screenshot guardado en:', screenshotPath);

            // Mostrar con visor
            const { fork } = require('child_process');
            const visorProcess = fork(path.join(__dirname, './../visorImagen.js'));
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
        const resultadosFacturas = [];
        const MAX_REINTENTOS = 1;

        // Función para procesar una factura con reintentos
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

            // ===== PASO 2: Datos del Receptor =====
            await ejecutarPasoConVerificacion(
                'Datos del Receptor',
                paso_2_DatosDelReceptor_Cliente,
                pagePuntoDeVenta,
                facturaActual
            );

            // ===== PASO 3: Datos de Operación (según tipo de contribuyente) =====
            if (facturaActual.tipoContribuyente === 'B') {
                await ejecutarPasoConVerificacion(
                    'Datos de Operación - Factura B',
                    paso_3_DatosDeOperacion_Factura_B,
                    pagePuntoDeVenta,
                    facturaActual,
                    facturaIndex // índice de factura
                );
            } else if (facturaActual.tipoContribuyente === 'C') {
                await ejecutarPasoConVerificacion(
                    'Datos de Operación - Factura C',
                    paso_3_DatosDeOperacion_Cliente,
                    pagePuntoDeVenta,
                    facturaActual,
                    facturaIndex // índice de factura
                );
            }

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

            // ===== PASO 4: Confirmar Factura y Descargar PDF =====
            const resultadoConfirmacion = await ejecutarPasoConVerificacion(
                'Confirmar Factura y Descargar PDF',
                paso_4_ConfirmarFactura_Cliente,
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
        for (let i = 0; i < cantidad; i++) {
            const resultado = await procesarFacturaConReintento(facturas[i], i);
            resultadosFacturas.push(resultado);

            // Espera entre facturas (excepto la última)
            if (i < cantidad - 1) {
                await esperar(1000);
            }
        }

        // ===== RESUMEN FINAL =====
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

    } catch (error) {
        console.error("Error en ejecutar_FacturaCliente:", error);
        throw error;
    }
};

module.exports = { ejecutar_FacturaCliente };
