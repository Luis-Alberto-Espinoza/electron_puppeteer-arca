/**
 * Navegación del menú de la Oficina Virtual de ATM para las constancias.
 *
 * Se busca POR TEXTO (como Apremios): el orden del menú cambia según el contribuyente.
 * Antes se hacía clic en el 3er menú → 1er ítem, que es Ingresos Brutos → Inscripciones:
 * bajaba la constancia de INSCRIPCIÓN y nunca la de deuda.
 *
 *   General → "Constancia de Cumplimiento Fiscal"  (Imprimir Constancia / Imprimir Deuda)
 *   Ingresos Brutos → "Inscripciones"              (Imprimir Constancia de Inscripción)
 */

const { abrirMenu } = require('./menuOficinaVirtual.js');

const INTERVALO_MS = 250;

/** General → Constancia de Cumplimiento Fiscal. Espera a que aparezca "Imprimir Constancia". */
async function navegarACumplimientoFiscal(page) {
    console.log('Navegando a General → Constancia de Cumplimiento Fiscal...');
    const frame = await abrirMenu(page, 'General', 'Constancia de Cumplimiento Fiscal');
    await frame.waitForFunction(() => Array.from(document.querySelectorAll('.z-button'))
        .some(b => b.textContent.trim() === 'Imprimir Constancia'), { timeout: 20000, polling: INTERVALO_MS })
        .catch(() => { throw new Error('No cargó la pantalla de Constancia de Cumplimiento Fiscal.'); });
    console.log('Pantalla de Constancia de Cumplimiento Fiscal cargada.');
    return frame;
}

/**
 * Ingresos Brutos → Inscripciones. Espera el botón "Imprimir Constancia de Inscripción" (aunque
 * esté deshabilitado): esperar solo una tabla (.z-listitem) agarraba la del "Resultado Control"
 * de la pantalla anterior, y se seleccionaba una fila equivocada (probado en vivo 2026-10-22).
 */
async function navegarAInscripcionIIBB(page) {
    console.log('Navegando a Ingresos Brutos → Inscripciones...');
    const frame = await abrirMenu(page, 'Ingresos Brutos', 'Inscripciones');
    await frame.waitForFunction(() => Array.from(document.querySelectorAll('.z-button'))
        .some(b => b.textContent.trim() === 'Imprimir Constancia de Inscripción'), { timeout: 20000, polling: INTERVALO_MS })
        .catch(() => { throw new Error('No cargó la pantalla de Inscripciones de Ingresos Brutos.'); });
    await frame.waitForSelector('.z-listitem', { timeout: 10000 })
        .catch(() => { throw new Error('La pantalla de Inscripciones no trajo ninguna inscripción.'); });
    console.log('Pantalla de Inscripciones de Ingresos Brutos cargada.');
    return frame;
}

module.exports = { navegarACumplimientoFiscal, navegarAInscripcionIIBB };
