// Importar módulos y funciones
const { loginATM } = require('../codigoXpagina/login_atm.js');
const { entrarOficinaVirtual } = require('../codigoXpagina/home-oficinaVirtual.js');
const { navegarAConstanciaFiscal } = require('../codigoXpagina/oficina_constanciaFiscal.js');
const { gestionarConstanciaFiscal } = require('../codigoXpagina/constanciaFiscal.js');
const { nuevaPagina, cerrarNavegador } = require('../../puppeteer-manager.js');

/**
 * Orquesta el flujo completo para obtener la constancia fiscal de ATM.
 * @param {object} credencialesATM - Objeto con las credenciales del usuario.
 * @param {string} credencialesATM.cuit - El CUIT del usuario.
 * @param {string} credencialesATM.clave - La clave fiscal del usuario.
 */
async function flujoConstanciaFiscal(credencialesATM, nombreUsuario, downloadsPath) {
    console.log("Iniciando flujo de Constancia Fiscal...", credencialesATM);
    let page;
    try {
        // 1. Inicia el navegador y abre la página de login
        const urlATM = 'https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp';
        page = await nuevaPagina(urlATM, {});
       
        // 2. Realiza el login
        await loginATM(page, credencialesATM);

        // 3. Entra a la Oficina Virtual
        const oficinaVirtualPage = await entrarOficinaVirtual(page);

        // 4. Navega hasta la sección de Constancia de Inscripción
        await navegarAConstanciaFiscal(oficinaVirtualPage);

        // 5. Gestiona la impresión/descarga de la constancia
        const { success, files, downloadDir } = await gestionarConstanciaFiscal(oficinaVirtualPage, nombreUsuario, credencialesATM.cuit, downloadsPath);



        if (success && files.length > 0) {
            // Importa el módulo para procesar el PDF.
            const { procesarConstanciaFiscal } = require('../../../extraerTablasPdf/constancia_fiscal.js');

            // Helper para convertir el formato de moneda a número.
            const parseCurrency = (value) => {
                if (typeof value !== 'string') return 0;
                return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
            };

            // Procesa el primer archivo PDF descargado.
            const filePath = files[0];
            const resultado = await procesarConstanciaFiscal(filePath);

            if (!resultado || !resultado.tablas) {
                throw new Error('El procesamiento del PDF no devolvió tablas.');
            }

            // Calcula el total de "Saldo Actualizado" para cada tabla.
            const resumenDeudas = resultado.tablas.map(tabla => {
                const total = tabla.datos.reduce((sum, fila) => {
                    const saldo = parseCurrency(fila["Saldo Actualizado"]);
                    return sum + saldo;
                }, 0);

                return {
                    nombreTabla: tabla.titulo,
                    total: total.toFixed(2) // Formatea el total a 2 decimales.
                };
            });

            console.log('Resumen de Deudas:', resumenDeudas);
            console.log('Flujo de Constancia Fiscal completado correctamente.');
            //cerrar el navegador
            await cerrarNavegador();

            // Devuelve el resumen al frontend.
            return {
                exito: true,
                mensaje: 'Constancia fiscal procesada.',
                resumen: resumenDeudas,
                directorio: downloadDir
            };

        } else {
            console.log('❌ Error en la descarga o no se encontraron archivos.');
            return { exito: false, mensaje: 'No se pudo generar o encontrar la constancia fiscal.' };
        }

    } catch (error) {
        console.error('Error en el flujo de Constancia Fiscal:', error.message);
        return { exito: false, mensaje: 'No se pudo completar el flujo.' };

    } finally {
        // 6. Cierra el navegador al finalizar
        if (page) {
           // await cerrarNavegador();
        }
    }
}



module.exports = {
    flujoConstanciaFiscal
};