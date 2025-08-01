// src/backend/puppeteer/facturas/codigo/hacerFacturas/index.js

const { menuPrincipal } = require('./menuPrincipal');
const { paso_0_seleccionarPuntoDeVenta } = require('./paso_0_PuntosDeVentas');
const { paso_1_DatosDeEmision_Productos } = require('./paso_1_DatosDeEmision_Productos');
const { paso_1_DatosDeEmision_Servicio } = require('./paso_1_DatosDeEmision_Servicio');
const { paso_2_DatosDelReceptor } = require('./paso_2_DatosDelReceptor');
const { paso_3_DatosDeOperacion_Factura_B } = require('./paso_3_DatosDeOperacion_Factura_B');
const { paso_3_DatosDeOperacion_Factura_C } = require('./paso_3_DatosDeOperacion_Factura_C');
const { paso_4_ConfirmarFactura } = require('./paso_4_ConfirmarFactura');


const { elegirComprobanteEnLinea } = require('../../../elegirComprobanteEnLinea');
const { elegirPuntoDeVenta } = require('../../../elegirPuntoDeVenta');
const ejecutar = async (page, datos, modoTest) => {
    try {
        console.log("\n\n === los datos recibidos\n", datos);
        const cantidad = datos.montoResultados.facturasGeneradas.length;

        // Función auxiliar para esperar
        const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Función auxiliar para esperar y verificar
        const ejecutarPasoConVerificacion = async (nombrePaso, funcion, ...args) => {
            try {
                console.log(`\n=== Iniciando paso: ${modoTest} ===\n`);
                console.log(`Iniciando ${nombrePaso}...`);
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

        // Inicialización única
        const newPage = await ejecutarPasoConVerificacion(
            'Elegir Comprobante en Línea',
            elegirComprobanteEnLinea,
            page
        );

        const pagePuntoDeVenta = await ejecutarPasoConVerificacion(
            'Elegir Punto de Venta',
            elegirPuntoDeVenta,
            newPage
        );

        // Procesar cada factura de manera secuencial
        for (let i = 0; i < cantidad; i++) {
            console.log(`\n=== Procesando factura ${i + 1} de ${cantidad} ===\n`);
            const factura = datos.montoResultados.facturasGeneradas[i];

            // Reducir el tiempo de espera entre facturas
            await esperar(500);

            // Ejecutar los pasos para cada factura
            await ejecutarPasoConVerificacion(
                'Menú Principal',
                menuPrincipal,
                pagePuntoDeVenta,
                factura
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
                paso_2_DatosDelReceptor,
                pagePuntoDeVenta,
                datos
            );

            if (datos.tipoContribuyente === 'B') {
                await ejecutarPasoConVerificacion(
                    'Datos de Operación - Factura B',
                    paso_3_DatosDeOperacion_Factura_B,
                    pagePuntoDeVenta,
                    datos,
                    i
                );
            } else if (datos.tipoContribuyente === 'C') {
                await ejecutarPasoConVerificacion(
                    'Datos de Operación - Factura C',
                    paso_3_DatosDeOperacion_Factura_C,
                    pagePuntoDeVenta,
                    datos,
                    i
                );
            }

            await ejecutarPasoConVerificacion(
                'Confirmar Factura',
                paso_4_ConfirmarFactura,
                pagePuntoDeVenta,
                modoTest
            );

            // Reducir la espera adicional entre facturas
            await esperar(1000);
        }

        console.log("Proceso de facturación completado correctamente.");
        return { success: true, message: "Proceso completado" };
    } catch (error) {
        console.error("Error en ejecutar:", error);
        throw error;
    }
};

module.exports = { ejecutar };