const { buscarEnAfip } = require('../../archivosComunes/buscadorAfip');

/**
 * Tras abrir la pestaña, AFIP a veces devuelve la página de error interna de
 * Chrome (chrome-error://chromewebdata/) por un fallo transitorio de carga.
 * El buscador no lo detecta porque esa página de error igual tiene <body>.
 *
 * Hacemos UN solo reintento con F5 (reload re-intenta la misma navegación, sin
 * reabrir la pestaña ni rehacer el login). Si tras el F5 sigue rota, fallamos
 * con un mensaje claro en vez de dejar que reviente disfrazado en el paso 2.
 *
 * @param {import('puppeteer').Page} newPage - La pestaña recién abierta
 */
async function asegurarPaginaCargada(newPage) {
    const esPaginaError = () => newPage.url().startsWith('chrome-error://');

    if (!esPaginaError()) return;

    console.warn('  ⚠️ La pestaña de Cuenta Corriente cargó como página de error de Chrome (chrome-error://). Reintentando con F5...');
    try {
        await newPage.reload({ waitUntil: 'networkidle2', timeout: 30000 });
    } catch (e) {
        console.warn(`  ⚠️ El F5 falló: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));

    if (esPaginaError()) {
        throw new Error(
            'La página de Cuenta Corriente no cargó (chrome-error). ' +
            'Posible error transitorio de AFIP. Reintentá el proceso.'
        );
    }

    console.log('  ✅ Reintento (F5) exitoso: la página cargó correctamente.');
}

/**
 * PASO 1: Acceder a "Cuenta Corriente de Contribuyentes"
 * Abre una nueva pestaña
 */
async function ejecutar(page) {
    try {
        console.log("  → Buscando el panel de Cuenta Corriente...");

        // Usar el componente reutilizable del buscador
        const newPage = await buscarEnAfip(page, 'ccma', {
            timeoutNuevaPestana: 10000,
            esperarNuevaPestana: true
        });

        // Guard: si la pestaña abrió como chrome-error://, un F5 (un intento)
        await asegurarPaginaCargada(newPage);

        console.log("  ✅ Paso 1 completado: Nueva pestaña abierta");

        return {
            success: true,
            message: "Cuenta Corriente abierta correctamente",
            newPage: newPage
        };

    } catch (error) {
        console.error("  ❌ Error en paso_1_cuentaCorriente:", error);
        return {
            success: false,
            message: error.message
        };
    }
}

module.exports = { ejecutar };
