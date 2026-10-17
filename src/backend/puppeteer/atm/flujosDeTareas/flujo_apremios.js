// puppeteer/atm/flujosDeTareas/flujo_apremios.js
// Apremios ATM de UN cliente: login → Oficina Virtual → Apremios › Consulta de Apremios
// → por cada impuesto elegido, leer la tabla → un Excel con una hoja por impuesto.
// Un impuesto que falla no corta a los demás: queda marcado en su hoja y en el resultado.

const { launchBrowserAndPage, resolverHeadless } = require('../../archivos_comunes/navegador/browserLauncher.js');
const { exigirLoginATM } = require('../codigoXpagina/login_atm.js');
const { entrarOficinaVirtual } = require('../codigoXpagina/home-oficinaVirtual.js');
const { entrarApremios, aceptarAviso, consultarImpuesto } = require('../codigoXpagina/oficina_apremios.js');
const { IMPUESTO_POR_ID, resumirTabla } = require('../../../atm/apremios/tablaApremios.js');
const { generarExcelApremios } = require('../../../atm/apremios/excelApremios.js');

const URL_LOGIN_ATM = 'https://atm.mendoza.gov.ar/portalatm/misTramites/misTramitesLogin.jsp';

/**
 * @param {Object} p
 * @param {{cuit: string, clave: string}} p.credenciales  login (ATM: siempre el propio cliente)
 * @param {{cuit: string, nombre: string}} p.contribuyente  objetivo, para la carpeta
 * @param {string[]} p.impuestos  ids de IMPUESTOS_APREMIOS, ya normalizados
 * @param {string} p.downloadsPath
 * @param {(estado: string, mensaje: string) => void} p.enviarProgreso
 * @param {boolean} [p.visible]
 * @returns {Promise<{success: true, resultados: Array, rutaExcel: string, downloadDir: string}>}
 *          (los errores de login / navegación se lanzan)
 */
async function flujoApremios({ credenciales, contribuyente, impuestos, downloadsPath, enviarProgreso, visible }) {
    let browser;
    try {
        enviarProgreso('info', 'Iniciando navegador...');
        const lanzado = await launchBrowserAndPage({ headless: resolverHeadless(visible) });
        browser = lanzado.browser;
        const page = lanzado.page;

        enviarProgreso('info', 'Iniciando sesión en ATM...');
        await page.goto(URL_LOGIN_ATM);
        await exigirLoginATM(page, credenciales);

        enviarProgreso('info', 'Entrando a la Oficina Virtual...');
        const oficina = await entrarOficinaVirtual(page);

        enviarProgreso('info', 'Abriendo Consulta de Apremios...');
        const frame = await entrarApremios(oficina);
        await aceptarAviso(frame, { esperarMs: 5000 });

        const resultados = [];
        for (const id of impuestos) {
            const impuesto = IMPUESTO_POR_ID.get(id);
            enviarProgreso('info', `Consultando ${impuesto.hoja}...`);
            try {
                const { encabezados, filas, mensaje } = await consultarImpuesto(frame, impuesto);
                resultados.push({ impuesto: id, ok: true, encabezados, filas, mensaje, resumen: resumirTabla(encabezados, filas) });
            } catch (error) {
                console.error(`⛔ [Apremios] ${contribuyente.cuit} ${impuesto.hoja}: ${error.message}`);
                resultados.push({ impuesto: id, ok: false, error: error.message });
            }
        }

        enviarProgreso('info', 'Generando Excel...');
        const { rutaExcel, downloadDir } = await generarExcelApremios(resultados, contribuyente, downloadsPath);
        return { success: true, resultados, rutaExcel, downloadDir };

    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

module.exports = { flujoApremios };
