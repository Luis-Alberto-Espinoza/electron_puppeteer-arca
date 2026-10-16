// Paso 2 — Portal IVA: dejar "Representando a" en el CUIT del cliente.
// Si ya está (cliente con clave propia), no se toca. Si no: ícono de personas
// (#/changeRelation) → "Elegí una persona para ingresar" → la tarjeta con ese CUIT.
// Se matchea por CUIT (no por nombre) y se confirma leyendo la cabecera.

const { esperar, soloDigitos, errorConCodigo, clickReal } = require('./_comun.js');

const TIMEOUT = 30000;

// CUIT que muestra la cabecera en "Representando a: NOMBRE [CUIT 30-71898569-9]".
async function cuitRepresentado(portal) {
    return portal.evaluate(() => {
        const span = Array.from(document.querySelectorAll('#usernav span'))
            .find(s => /^\s*representando a/i.test(s.textContent || ''));
        const m = span && /\[CUIT\s*([\d-]+)\]/i.exec(span.textContent);
        return m ? m[1].replace(/\D/g, '') : null;
    });
}

/**
 * @param {import('puppeteer').Page} portal  Pestaña de Portal IVA (de paso 1).
 * @param {string} cuit  CUIT del cliente (objetivo).
 */
async function elegirRepresentado(portal, cuit) {
    const objetivo = soloDigitos(cuit);
    if (await cuitRepresentado(portal) === objetivo) return;

    await clickReal(portal, 'a[href*="#/changeRelation"]');
    await portal.waitForSelector('a[title="Representar a..."]', { visible: true, timeout: TIMEOUT })
        .catch(() => {
            throw errorConCodigo('NO_REPRESENTADO',
                `Portal IVA no ofrece personas para representar (se buscaba el CUIT ${objetivo}).`);
        });

    // Tarjetas: <a title="Representar a..."><h3>NOMBRE<small>[CUIT 30-71898569-9]</small></h3></a>
    const tarjetas = await portal.$$('a[title="Representar a..."]');
    let elegida = null;
    for (const t of tarjetas) {
        const texto = await t.evaluate(a => a.textContent || '');
        const m = /\[CUIT\s*([\d-]+)\]/i.exec(texto);
        if (m && soloDigitos(m[1]) === objetivo) { elegida = t; break; }
    }
    if (!elegida) {
        throw errorConCodigo('NO_REPRESENTADO',
            `El CUIT ${objetivo} no figura entre las personas que este login representa en Portal IVA.`);
    }

    await elegida.evaluate(a => a.scrollIntoView({ block: 'center' }));
    await elegida.click();

    // Confirmar en la cabecera, no asumir.
    const limite = Date.now() + TIMEOUT;
    while (Date.now() < limite) {
        if (await cuitRepresentado(portal).catch(() => null) === objetivo) return;
        await esperar(500);
    }
    throw errorConCodigo('NO_REPRESENTADO', `Portal IVA no quedó representando al CUIT ${objetivo}.`);
}

module.exports = { elegirRepresentado };
