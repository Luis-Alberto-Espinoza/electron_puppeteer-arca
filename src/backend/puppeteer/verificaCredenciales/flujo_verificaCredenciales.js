const { menuPrincipal } = require('../facturas/codigo/hacerFacturas/menuPrincipal');
const { paso_0_seleccionarPuntoDeVenta } = require('../facturas/codigo/hacerFacturas/paso_0_PuntosDeVentas');
const { elegirComprobanteEnLinea } = require('../elegirComprobanteEnLinea');
const { elegirPuntoDeVenta } = require('../elegirPuntoDeVenta');
const hacerLogin = require('../facturas/codigo/login/login_arca'); // Importa el nuevo módulo de login

const ejecutar_verificacionCredenciales = async (datos) => {
    try {
        console.log("\n\n === los datos recibidos\n", datos);

        // Si necesitas nombreEmpresa, obténlo de datos
        const nombreEmpresa = datos.nombreEmpresa || '';
        const url = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";
        // Login primero
        let page;
        try {// Utiliza el cuit o el cuil el que tenga valor
            const credenciales = {};
            credenciales.usuario = datos.cuit || datos.credenciales.cuil;
            credenciales.contrasena = datos.clave;

            // mostrar el objeto creado 
            console.log("Credenciales para login:", credenciales);
            // generar una espera
            page = await hacerLogin.hacerLogin(url, credenciales);
        } catch (loginError) {
            console.error("Error en login:", loginError);
            return { success: false, error: "Login fallido: " + (loginError.message || loginError) };
        }

        // Función auxiliar para esperar
        const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        // Función auxiliar para esperar y verificar
        const ejecutarPasoConVerificacion = async (nombrePaso, funcion, ...args) => {
            try {
                console.log(`Iniciando ${nombrePaso}...`);
                console.time(nombrePaso);

                // Reducir el tiempo de espera antes de ejecutar el paso
                // await esperar(500);

                const resultado = await funcion(...args);

                // Reducir el tiempo de espera después de la ejecución
                //await esperar(1000);

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

        const [pagePuntoDeVenta, puntosDeVentaArray] = await ejecutarPasoConVerificacion(
            'Elegir Punto de Venta',
            elegirPuntoDeVenta,
            newPage,
            nombreEmpresa
        );

        // Cerrar el navegador después de elegir el punto de venta
        await pagePuntoDeVenta.browser().close();

        return { success: true, message: "Proceso completado", empresas: puntosDeVentaArray  };
    } catch (error) {
        console.error("Error en ejecutar:", error);
        return { success: false, error: error.message || error };
    }
};

module.exports = { ejecutar_verificacionCredenciales };
