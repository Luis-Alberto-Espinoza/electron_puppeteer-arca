
const { menuPrincipal } = require('../codigoXpagina/menuPrincipal');
const { paso_0_seleccionarPuntoDeVenta } = require('../codigoXpagina/paso_0_PuntosDeVentas');
const { paso_1_DatosDeEmision_Productos } = require('../codigoXpagina/paso_1_DatosDeEmision_Productos');
const { paso_1_DatosDeEmision_Servicio } = require('../codigoXpagina/paso_1_DatosDeEmision_Servicio');
const { paso_2_DatosDelReceptor } = require('../codigoXpagina/paso_2_DatosDelReceptor');
const { paso_3_DatosDeOperacion_Factura_B } = require('../codigoXpagina/paso_3_DatosDeOperacion_Factura_B');
const { paso_3_DatosDeOperacion_Factura_C } = require('../codigoXpagina/paso_3_DatosDeOperacion_Factura_C');
const { paso_4_ConfirmarFactura } = require('../codigoXpagina/paso_4_ConfirmarFactura');
const { paso_X_ConsultaComprobantes } = require('../codigoXpagina/consultaDeComprobante_formulario');
const { buscarEnAfip } = require('../../../../buscadorAfip');
const { seleccionarEmpresa } = require('../../../../empresasDisponibles');
const { extraerDatosDeConsultaComprobantes } = require('../../consultarFacturas/comprobarFacturado');

let respuesta;

const ejecutar_Facturas = async (page, datos, modoTest, credenciales, usuarioSeleccionado, empresaElegida) => {
    try {
        console.log("\n\n === los datos recibidos desde flujo_Factura ===\n", datos, '\n\n\n', usuarioSeleccionado, '\n\nlos datos desde flujo_Factura', datos, '\n\n');
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
            'Buscar Comprobante en Línea',
            async (p) => await buscarEnAfip(p, 'compr', { esperarNuevaPestana: true }),
            page
        );

        const pagePuntoDeVenta = await ejecutarPasoConVerificacion(
            'Elegir Punto de Venta',
            seleccionarEmpresa,
            newPage,
            credenciales.nombreEmpresa // <-- aquí pasas el nombre de la empresa
        );

        // Procesar cada factura de manera secuencial
        //cantidad = 1;
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
                { botonId: "btn_gen_cmp" } // <-- pasa el id como dato
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

        // Solo ejecutar la consulta y extracción si test es false
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
// esta es la resppuesta que habria y se espera llevarlooshasta el frontend y mostrarlos usando los canales correspondientes segun mi arquitectura 

// 
            /**objeto respuesta
             * Datos extraídos de la consulta: {
              success: true,
              message: 'Datos extraídos exitosamente',
              data: {
                suma: 2440160,
                cantidadFacturas: 305,
                montos: [
                        9000,  8500,  9830,  7690,  9480,  9370,  8730,  7940, 14690,
                        9760,
                       ... 205 more items
                     ],
                    detalle: '0001-00000914, 26450\n' +
                    '0001-00000913, 12000\n' +
                    datosExtraidos: true
                }
            };
        esto habra que llevarlo a: 
                            # el frontend
                            # a la base de datos

         * 
         */
            console.log("Proceso de facturación completado correctamente.");

            //estoy en menu principal?
            // hacer un console.log de la url actual
            const urlActual = pagePuntoDeVenta.url();
            console.log("URL actual:", urlActual);
            //hacer log al objeto window
            const windowObject = await pagePuntoDeVenta.evaluate(() => window);
            console.log("Objeto window:", windowObject);

            // mostrar los resultados de la consulta 
            // guardar los datos? en el usuario?

            // cerrar el navegador
            await pagePuntoDeVenta.close();
            await page.close();
        }
        return { success: true, message: "Proceso completado", data: respuesta.data };
    } catch (error) {
        console.error("Error en ejecutar:", error);
        throw error;
    }
};

module.exports = { ejecutar_Facturas };
