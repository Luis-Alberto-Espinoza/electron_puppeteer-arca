/**
 * Entra a "Consulta Planes de Pago" de la Oficina Virtual, POR TEXTO.
 * Antes: clic en el 6º menú → 1er ítem (andaba solo mientras "Planes de Pago" cayera 6º).
 */
const { abrirMenu } = require('./menuOficinaVirtual.js');

/**
 * Planes de Pago → Consulta de Plan de Pago. Espera a que estén los botones de impuestos.
 * @param {import('puppeteer').Page} page - pestaña de la Oficina Virtual
 * @returns {Promise<import('puppeteer').Frame>}
 */
async function entrarPlanDePago(page) {
    console.log('Navegando a Planes de Pago → Consulta de Plan de Pago...');
    const frame = await abrirMenu(page, 'Planes de Pago', 'Consulta de Plan de Pago');
    await frame.waitForFunction(() => Array.from(document.querySelectorAll('.z-button'))
        .some(b => b.textContent.trim() === 'Ingresos Brutos'), { timeout: 20000, polling: 250 })
        .catch(() => { throw new Error('No cargó la pantalla de Consulta de Planes de Pago.'); });
    return frame;
}

module.exports = { entrarPlanDePago };
