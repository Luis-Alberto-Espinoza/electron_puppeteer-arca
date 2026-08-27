/**
 * Piloto de prueba E2E — Generar VEP.
 * -----------------------------------
 * Corre el flujo REAL de generación de VEP contra ARCA/AFIP (login + puppeteer)
 * y deja un reporte en pruebas/reportes/historial.jsonl vía guardarReporte.
 *
 * Es el primer "ladrillo" de la automatización de pruebas. Reusa vepManager
 * (la misma lógica que el botón "Generar VEP"), no reimplementa selectores.
 *
 * NO depende de Electron: llama a vepManager directo y toma las credenciales
 * del config local en vez del repo de contribuyentes (que sí necesita Electron).
 *
 * Cómo correr:
 *   1) cp pruebas/piloto_generarVep.config.example.js pruebas/piloto_generarVep.config.js
 *   2) completá el config con un cliente de prueba real
 *   3) node pruebas/piloto_generarVep.js
 *
 * Sale con código 0 si el VEP se generó (o el cliente estaba sin deuda), 1 si falló.
 * Ver docs/test/esqueleto_ideaInicial.md
 */
const path = require('path');
const fs = require('fs');

const vepManager = require('../src/backend/afip/vep/vepManager.js');
const { guardarReporte, DIR_REPORTES } = require('./guardarReporte.js');

const SERVICIO = 'afip-vep';
const URL_LOGIN = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

function cargarConfig() {
    const ruta = path.join(__dirname, 'piloto_generarVep.config.js');
    if (!fs.existsSync(ruta)) {
        throw new Error(
            'Falta pruebas/piloto_generarVep.config.js.\n' +
            '  Copialo de la plantilla:  cp pruebas/piloto_generarVep.config.example.js pruebas/piloto_generarVep.config.js\n' +
            '  y completá tus datos de prueba.'
        );
    }
    return require(ruta);
}

async function main() {
    const cfg = cargarConfig();

    // Las descargas (PDF del VEP) van junto a los reportes, en su subcarpeta de servicio.
    const downloadsPath = path.join(DIR_REPORTES, SERVICIO);
    fs.mkdirSync(downloadsPath, { recursive: true });

    // Forma que espera vepManager (igual que arma el handler, pero a mano):
    const credenciales = { usuario: cfg.login.cuit, contrasena: cfg.login.clave };
    const usuarioData = {
        usuario: { cuit: cfg.objetivo.cuit, nombre: cfg.objetivo.nombre, apellido: '' },
        medioPago: cfg.medioPago,
    };

    console.log(`🧪 [Piloto VEP] Cliente: ${cfg.objetivo.nombre} (${cfg.objetivo.cuit}) — medio: ${cfg.medioPago.nombre}`);

    const t0 = Date.now();
    try {
        const resultado = await vepManager.iniciarProceso(
            URL_LOGIN, credenciales, usuarioData, cfg.periodos ?? null, downloadsPath
        );

        // "ok" si el flujo terminó bien. Sin deuda o requiere selección también
        // son finales válidos (no son errores): los anotamos en extra para distinguirlos.
        const ok = !!(resultado && resultado.success);

        guardarReporte({
            servicio: SERVICIO,
            cliente: cfg.objetivo.nombre,
            resultado: ok ? 'ok' : 'fallo',
            error: ok ? null : (resultado && resultado.message) || 'resultado sin success',
            duracionMs: Date.now() - t0,
            extra: {
                medioPago: cfg.medioPago.nombre,
                sinDeuda: !!(resultado && resultado.sinDeuda),
                requiereSeleccion: !!(resultado && resultado.requiereSeleccion),
                pdf: (resultado && resultado.pdfDescargado && resultado.pdfDescargado.nombre) || null,
            },
        });

        if (ok) {
            console.log('✅ [Piloto VEP] OK.', resultado.sinDeuda ? '(cliente sin deuda)' : '');
        } else {
            console.error(`❌ [Piloto VEP] FALLÓ: ${resultado && resultado.message}`);
        }
        process.exit(ok ? 0 : 1);

    } catch (err) {
        // Excepción no controlada (ej: no hay Chrome, login reventó, etc.)
        guardarReporte({
            servicio: SERVICIO,
            cliente: cfg.objetivo && cfg.objetivo.nombre,
            resultado: 'fallo',
            error: err,
            duracionMs: Date.now() - t0,
        });
        console.error('❌ [Piloto VEP] Excepción:', err.message);
        process.exit(1);
    }
}

main();
