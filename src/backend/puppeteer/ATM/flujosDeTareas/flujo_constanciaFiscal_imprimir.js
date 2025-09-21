const { loginATM } = require('../codigoXpagina/login_atm.js');
const { entrarOficinaVirtual } = require('../codigoXpagina/home-oficinaVirtual.js');
const { navegarAConstanciaFiscal } = require('../codigoXpagina/oficina_constanciaFiscal.js');
const { gestionarConstanciaFiscal } = require('../codigoXpagina/constanciaFiscal.js');
const { launchBrowser } = require('../../browserLauncher.js'); // Importar el lanzador autónomo

async function flujoConstanciaFiscal(credencialesATM, nombreUsuario, downloadsPath, enviarProgreso) {
    let browser;

    try {
        enviarProgreso('info', 'Iniciando navegador...');
        browser = await launchBrowser({ headless: true });
        const page = await browser.newPage();

        const urlATM = 'https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp';
        await page.goto(urlATM);

        enviarProgreso('info', 'Iniciando sesión en ATM...');
        await loginATM(page, credencialesATM);

        enviarProgreso('info', 'Navegando a la oficina virtual...');
        const oficinaVirtualPage = await entrarOficinaVirtual(page);

        enviarProgreso('info', 'Navegando a la sección de Constancia de Inscripción...');
        await navegarAConstanciaFiscal(oficinaVirtualPage);

        enviarProgreso('info', 'Gestionando descarga de la constancia...');
        const { success, files, downloadDir } = await gestionarConstanciaFiscal(oficinaVirtualPage, nombreUsuario, credencialesATM.cuit, downloadsPath);

        if (success && files.length > 0) {
            enviarProgreso('info', 'Constancia Fiscal descargada. Procesando PDF...');
            const { procesarConstanciaFiscal } = require('../../../extraerTablasPdf/constancia_fiscal.js');

            const parseCurrency = (value) => {
                if (typeof value !== 'string') return 0;
                return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
            };

            const filePath = files[0];
            const resultado = await procesarConstanciaFiscal(filePath);

            if (!resultado || !resultado.tablas) {
                throw new Error('El procesamiento del PDF no devolvió tablas.');
            }

            const resumenDeudas = resultado.tablas.map(tabla => {
                const total = tabla.datos.reduce((sum, fila) => {
                    const saldo = parseCurrency(fila["Saldo Actualizado"]);
                    return sum + saldo;
                }, 0);
                return { nombreTabla: tabla.titulo, total: total.toFixed(2) };
            });

            enviarProgreso('exito', `Proceso completado. Se generó ${files.length} archivo de constancia.`);
            return {
                exito: true,
                mensaje: 'Constancia fiscal procesada.',
                resumen: resumenDeudas,
                downloadDir: downloadDir,
                files: [filePath]
            };
        } else {
            enviarProgreso('info', 'No se encontró Constancia Fiscal para este usuario.');
            return { exito: true, mensaje: 'No se encontró Constancia Fiscal.', files: [], downloadDir: null };
        }

    } catch (error) {
        console.error('Error en el flujo de Constancia Fiscal:', error.message);
        enviarProgreso('error', `Error en el flujo de Constancia Fiscal: ${error.message}`);
        throw error; // Lanzar para que el worker lo capture
    } finally {
        if (browser) {
            await browser.close();
            enviarProgreso('info', 'Navegador cerrado.');
        }
    }
}

module.exports = {
    flujoConstanciaFiscal
};