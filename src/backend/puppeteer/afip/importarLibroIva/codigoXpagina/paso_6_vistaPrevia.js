// Paso 6 — IVA Simple: del menú del Libro IVA (menuPresentacion.do) a la Vista Previa.
//
// #btnVistaPrevia → location.href = "vistaPrevia.do". Ahí está "Finalizar Registración y
// Continuar" (#btnGenerarPresentacion): NUNCA se toca. Se deja la pantalla para que el usuario la revise.

const { errorConCodigo, esperarUrl, clickReal } = require('./_comun.js');
const { TIMEOUT_PAGINA } = require('./paso_4_importarLibro.js');

/** `liva` en menuPresentacion.do (de paso 3). Termina con la Vista Previa cargada. */
async function abrirVistaPrevia(liva) {
    const navegacion = liva.waitForNavigation({ waitUntil: 'networkidle2', timeout: TIMEOUT_PAGINA }).catch(() => null);
    await clickReal(liva, '#btnVistaPrevia');
    await navegacion;
    if (!await esperarUrl(liva, /vistaPrevia\.do/, TIMEOUT_PAGINA)) {
        throw errorConCodigo('VISTA_PREVIA_NO_ABRIO', `No se abrió la Vista Previa (quedó en ${liva.url()}).`);
    }
    // Solo para confirmar que es la pantalla correcta.
    await liva.waitForSelector('#btnGenerarPresentacion', { timeout: TIMEOUT_PAGINA }).catch(() => {
        throw errorConCodigo('VISTA_PREVIA_NO_ABRIO', 'La Vista Previa no terminó de cargar.');
    });
}

module.exports = { abrirVistaPrevia };
