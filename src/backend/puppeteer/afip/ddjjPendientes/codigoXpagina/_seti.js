// Utilidades de "Presentación de DDJJ y Pagos" (Seti: seti.afip.gob.ar/setiweb, app Vue).
//
// Los id de Seti son dinámicos (__EVID__123456__EV__...): cambian en cada carga.
// Por eso acá se busca por TEXTO del botón o por el final fijo del id, nunca el id entero.

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Cierra los avisos de Seti que tapan la pantalla, SOLO si aparecen:
 *   - "Novedades del servicio": tilda "No volver a mostrar" y "Entendido".
 *     (Usamos perfil temporal: el "no volver a mostrar" no persiste, sale siempre.)
 *   - Tour de bienvenida ("Formularios… Siguiente / Saltar intro"): "Saltar intro".
 * Los avisos llegan un rato después de la pantalla, así que se mira durante `ventanaMs`.
 * Ojo: Seti tiene oculto un modal "Cerrar sesión" (No / Si): nunca se toca.
 */
async function cerrarAvisos(page, { ventanaMs = 4000 } = {}) {
    const limite = Date.now() + ventanaMs;
    while (Date.now() < limite) {
        const cerrado = await page.evaluate(() => {
            const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const visibles = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);

            const entendido = visibles.find(b => norm(b.textContent) === 'entendido');
            if (entendido) {
                const modal = entendido.closest('.modal') || document;
                const check = Array.from(modal.querySelectorAll('label'))
                    .find(l => norm(l.textContent) === 'no volver a mostrar');
                const input = check && check.querySelector('input[type="checkbox"]');
                if (input && !input.checked) input.click();
                entendido.click();
                return 'Novedades';
            }
            const saltar = visibles.find(b => norm(b.textContent) === 'saltar intro');
            if (saltar) {
                saltar.click();
                return 'Tour';
            }
            return null;
        }).catch(() => null);

        // El modal tarda en irse (fade): sin esta pausa se lo ve y "cierra" dos veces.
        if (cerrado) await esperar(1200);
        await esperar(400);
    }
}

module.exports = { esperar, cerrarAvisos };
